import { ConflictException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import bcrypt from "bcryptjs";
import { createHash, randomUUID } from "node:crypto";
import { PrismaService } from "../../infra/database/prisma.service";
import { EmailService } from "../notifications/email.service";

export type TokenPair = { accessToken: string; refreshToken: string };
export type SessionUser = { id: string; email: string; fullName: string; roles: string[] };

const ACCESS_TTL = process.env.JWT_ACCESS_TTL || "15m";
const REFRESH_TTL = process.env.JWT_REFRESH_TTL || "7d";
const RECOVERY_TTL = process.env.JWT_RECOVERY_TTL || "1h";

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(EmailService) private readonly email: EmailService,
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

  /**
   * Admin-initiated account provisioning (port of the Supabase
   * `auth.admin.createUser` + forced-role server functions). Creates the auth
   * user, upserts the profile (optionally with phone), and forces an EXPLICIT
   * role — deleting whatever default the legacy trigger seeded, exactly as the
   * old server functions did (`user_roles.delete().insert(role)`). Returns the
   * new id; issues NO session (the admin stays signed in as themselves).
   */
  async provisionAccount(params: {
    email: string;
    password: string;
    fullName?: string;
    role: string;
    phone?: string | null;
  }): Promise<{ userId: string }> {
    const email = params.email.toLowerCase();
    const existing = await this.prisma.users.findUnique({ where: { email } });
    if (existing) throw new ConflictException("An account with this email already exists");

    const id = randomUUID();
    const hash = await bcrypt.hash(params.password, 10);
    const name = params.fullName?.trim() || email.split("@")[0];

    await this.prisma.$transaction(async (tx) => {
      await tx.users.create({
        data: {
          id,
          email,
          encrypted_password: hash,
          aud: "authenticated",
          role: "authenticated",
          email_confirmed_at: new Date(),
          raw_app_meta_data: { provider: "email", providers: ["email"] },
          raw_user_meta_data: { full_name: name },
        },
      });
      await tx.profiles.upsert({
        where: { id },
        create: { id, full_name: name, email, phone: params.phone ?? null },
        update: { full_name: name, ...(params.phone ? { phone: params.phone } : {}) },
      });
      // Force the requested role (the legacy on_auth_user_created trigger may
      // have seeded 'student'); overwrite for an accurate assignment.
      await tx.$executeRaw`DELETE FROM public.user_roles WHERE user_id = ${id}::uuid`;
      await tx.$executeRaw`INSERT INTO public.user_roles (user_id, role) VALUES (${id}::uuid, ${params.role}::app_role) ON CONFLICT DO NOTHING`;
    });

    return { userId: id };
  }

  /** Hard-delete an auth user (rollback path when a linked insert fails). */
  async deleteAccount(userId: string): Promise<void> {
    await this.prisma.users.delete({ where: { id: userId } }).catch(() => undefined);
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

  /**
   * Port of Supabase's `resetPasswordForEmail`. Mints a single-use recovery JWT
   * (typ "recovery", 1h), stores only its SHA-256 in `auth.users.recovery_token`
   * (the same column Supabase used) so the raw token never touches the DB and the
   * link can be spent exactly once, then emails the reset link via the swappable
   * EmailService. Always resolves the same way whether or not the email exists —
   * no account-enumeration leak (Supabase behaved identically). In non-production
   * the minted token is returned so local dev / tests can complete the flow
   * without reading mail.
   */
  async requestPasswordReset(email: string): Promise<{ ok: true; token?: string }> {
    const account = await this.prisma.users.findUnique({ where: { email: email.toLowerCase() } });
    if (!account?.email) return { ok: true };

    const token = await this.jwt.signAsync(
      { sub: account.id, email: account.email, typ: "recovery" },
      { expiresIn: RECOVERY_TTL as never },
    );
    await this.prisma.users.update({
      where: { id: account.id },
      data: { recovery_token: this.hashToken(token), updated_at: new Date() },
    });

    const base = process.env.WEB_ORIGIN || "http://localhost:3999";
    const link = `${base}/reset-password?token=${encodeURIComponent(token)}`;
    await this.email.send({
      to: account.email,
      subject: "Reset your Greenwood password",
      body: `We received a request to reset your password. Open the link below to choose a new one (valid for 1 hour):\n\n${link}\n\nIf you didn't request this, you can safely ignore this email.`,
    });

    return process.env.NODE_ENV === "production" ? { ok: true } : { ok: true, token };
  }

  /**
   * Port of Supabase's recovery `updateUser({ password })`. Verifies the recovery
   * JWT, enforces single-use by matching the stored SHA-256, sets the new bcrypt
   * hash, clears the recovery token, then issues a fresh session so the user lands
   * signed in (matching the old flow's navigate-to-dashboard).
   */
  async resetPassword(
    token: string,
    password: string,
  ): Promise<{ user: SessionUser; tokens: TokenPair }> {
    let payload: { sub: string; email: string; typ: string };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException("This reset link is invalid or has expired");
    }
    if (payload.typ !== "recovery") throw new UnauthorizedException("Invalid reset token");

    const account = await this.prisma.users.findUnique({ where: { id: payload.sub } });
    if (!account || account.recovery_token !== this.hashToken(token)) {
      // Empty/mismatched token => already used, superseded, or forged.
      throw new UnauthorizedException("This reset link is invalid or has expired");
    }

    await this.prisma.users.update({
      where: { id: account.id },
      data: {
        encrypted_password: await bcrypt.hash(password, 10),
        recovery_token: "",
        updated_at: new Date(),
      },
    });

    const user = await this.resolveSessionUser(account.id, account.email!);
    return { user, tokens: await this.issueTokens(user) };
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
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
