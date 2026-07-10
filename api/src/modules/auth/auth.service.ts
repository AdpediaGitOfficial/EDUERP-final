import { ConflictException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../infra/database/prisma.service";

export type TokenPair = { accessToken: string; refreshToken: string };
export type SessionUser = { id: string; email: string; fullName: string; roles: string[] };

const ACCESS_TTL = process.env.JWT_ACCESS_TTL || "15m";
const REFRESH_TTL = process.env.JWT_REFRESH_TTL || "7d";

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwt: JwtService,
  ) {}

  /**
   * Password check against the migrated Supabase hashes: Supabase Auth stores
   * bcrypt ($2a$…) in auth.users.encrypted_password, which bcryptjs verifies
   * directly — existing users (incl. the demo accounts) keep their passwords.
   */
  async login(email: string, password: string): Promise<{ user: SessionUser; tokens: TokenPair }> {
    const account = await this.prisma.users.findUnique({ where: { email: email.toLowerCase() } });
    if (
      !account?.encrypted_password ||
      !(await bcrypt.compare(password, account.encrypted_password))
    ) {
      throw new UnauthorizedException("Invalid email or password");
    }
    const user = await this.resolveSessionUser(account.id, account.email!);
    await this.prisma.users.update({
      where: { id: account.id },
      data: { last_sign_in_at: new Date() },
    });
    return { user, tokens: await this.issueTokens(user) };
  }

  /**
   * Port of the `handle_new_user` trigger (extracted in Phase 1): create the auth
   * user + linked profile + default role atomically. Client-supplied role is
   * ignored (same anti-privilege-escalation rule as the trigger): first-ever user
   * becomes admin, everyone else starts as student until an admin grants roles.
   */
  async register(
    email: string,
    password: string,
    fullName?: string,
  ): Promise<{ user: SessionUser; tokens: TokenPair }> {
    const existing = await this.prisma.users.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) throw new ConflictException("An account with this email already exists");

    const id = randomUUID();
    const hash = await bcrypt.hash(password, 10);
    const name = fullName?.trim() || email.split("@")[0];

    await this.prisma.$transaction(async (tx) => {
      await tx.users.create({
        data: {
          id,
          email: email.toLowerCase(),
          encrypted_password: hash,
          aud: "authenticated",
          role: "authenticated",
          email_confirmed_at: new Date(),
          raw_app_meta_data: { provider: "email", providers: ["email"] },
          raw_user_meta_data: { full_name: name },
        },
      });
      // The legacy DB trigger (on_auth_user_created) may have auto-created the
      // profile/role while Supabase and this API coexist; make both idempotent.
      await tx.profiles.upsert({
        where: { id },
        create: { id, full_name: name, email: email.toLowerCase() },
        update: { full_name: name },
      });
      const adminExists = await tx.user_roles.findFirst({ where: { role: "admin" } });
      const defaultRole = adminExists ? "student" : "admin";
      await tx.$executeRaw`INSERT INTO public.user_roles (user_id, role) VALUES (${id}::uuid, ${defaultRole}::app_role) ON CONFLICT DO NOTHING`;
    });

    const user = await this.resolveSessionUser(id, email.toLowerCase());
    return { user, tokens: await this.issueTokens(user) };
  }

  async refresh(refreshToken: string): Promise<{ user: SessionUser; tokens: TokenPair }> {
    let payload: { sub: string; email: string; typ: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken);
    } catch {
      throw new UnauthorizedException("Invalid refresh token");
    }
    if (payload.typ !== "refresh") throw new UnauthorizedException("Invalid refresh token");
    const account = await this.prisma.users.findUnique({ where: { id: payload.sub } });
    if (!account) throw new UnauthorizedException("Account no longer exists");
    const user = await this.resolveSessionUser(account.id, account.email!);
    return { user, tokens: await this.issueTokens(user) };
  }

  async resolveSessionUser(id: string, email: string): Promise<SessionUser> {
    const [profile, roleRows] = await Promise.all([
      this.prisma.profiles.findUnique({ where: { id } }),
      this.prisma.user_roles.findMany({ where: { user_id: id } }),
    ]);
    return {
      id,
      email,
      fullName: profile?.full_name || email.split("@")[0],
      roles: roleRows.map((r) => r.role as string),
    };
  }

  private async issueTokens(user: SessionUser): Promise<TokenPair> {
    const base = { sub: user.id, email: user.email };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(
        { ...base, roles: user.roles, typ: "access" },
        { expiresIn: ACCESS_TTL as never },
      ),
      this.jwt.signAsync({ ...base, typ: "refresh" }, { expiresIn: REFRESH_TTL as never }),
    ]);
    return { accessToken, refreshToken };
  }
}
