import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../infra/database/prisma.service";
import { AuthService } from "../auth/auth.service";
import type { AuthUser } from "../../common/decorators/current-user.decorator";

export type CreateUserInput = {
  fullName: string;
  email: string;
  password: string;
  role: string;
  phone?: string | null;
};

/**
 * RLS translation for profiles / user_roles (see api/db/rls-policies-extracted.csv):
 *   profiles_admin_all             -> admin: unrestricted
 *   profiles_self_read             -> anyone: own profile
 *   profiles_teacher_read_students -> teacher: profiles of students in their classes
 *   profiles_teacher_read_parents  -> teacher: profiles of those students' parents
 *   profiles_update_own            -> anyone: update own profile only
 *   user_roles_admin_all/read      -> admin: read all role rows
 *   user_roles_read_own            -> anyone: own roles
 */
@Injectable()
export class UsersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  /**
   * Admin creates a user (port of `createUserByAdmin`). Provisions the account
   * with the chosen role, then — for student/teacher roles — creates the linked
   * domain record, rolling the auth user back if that insert fails so no
   * orphaned account is left behind (same guarantee as the old server function).
   */
  async createUser(actor: AuthUser, input: CreateUserInput) {
    if (!actor.roles.includes("admin"))
      throw new ForbiddenException("Only administrators can create users.");
    const { userId } = await this.auth.provisionAccount({
      email: input.email,
      password: input.password,
      fullName: input.fullName,
      role: input.role,
      phone: input.phone ?? null,
    });
    try {
      if (input.role === "student") {
        await this.prisma.students.create({ data: { profile_id: userId } });
      } else if (input.role === "teacher") {
        await this.prisma.teachers.create({
          data: {
            full_name: input.fullName,
            email: input.email,
            phone: input.phone ?? null,
            subject: "General",
            status: "active",
          },
        });
      }
      return { ok: true, userId };
    } catch (e) {
      await this.auth.deleteAccount(userId);
      throw e;
    }
  }

  async listUsers(actor: AuthUser, page = 1, pageSize = 50, q?: string) {
    if (!actor.roles.includes("admin")) throw new ForbiddenException("Admin only");
    const where = q
      ? {
          OR: [
            { full_name: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {};
    const [total, rows] = await Promise.all([
      this.prisma.profiles.count({ where }),
      this.prisma.profiles.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    // user_roles keys on the auth uid (same value as profiles.id) but relates to
    // auth.users in the schema, so fetch the page's roles in one query.
    const roleRows = await this.prisma.user_roles.findMany({
      where: { user_id: { in: rows.map((p) => p.id) } },
    });
    const rolesByUser = new Map<string, string[]>();
    for (const r of roleRows) {
      rolesByUser.set(r.user_id, [...(rolesByUser.get(r.user_id) ?? []), r.role as string]);
    }
    return {
      total,
      page,
      pageSize,
      rows: rows.map((p) => ({
        id: p.id,
        fullName: p.full_name,
        email: p.email,
        phone: p.phone,
        roles: rolesByUser.get(p.id) ?? [],
        createdAt: p.created_at,
      })),
    };
  }

  async getProfile(actor: AuthUser, id: string) {
    const allowed =
      actor.id === id ||
      actor.roles.includes("admin") ||
      (actor.roles.includes("teacher") && (await this.teacherCanSeeProfile(actor.id, id)));
    if (!allowed) throw new ForbiddenException();
    const [profile, roleRows] = await Promise.all([
      this.prisma.profiles.findUnique({ where: { id } }),
      this.prisma.user_roles.findMany({ where: { user_id: id } }),
    ]);
    if (!profile) throw new NotFoundException();
    return {
      id: profile.id,
      fullName: profile.full_name,
      email: profile.email,
      phone: profile.phone,
      roles: roleRows.map((r) => r.role as string),
    };
  }

  async updateOwnProfile(actor: AuthUser, data: { fullName?: string; phone?: string }) {
    // profiles_update_own: a user may update only their own row.
    const updated = await this.prisma.profiles.update({
      where: { id: actor.id },
      data: {
        ...(data.fullName !== undefined ? { full_name: data.fullName } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
      },
    });
    return {
      id: updated.id,
      fullName: updated.full_name,
      email: updated.email,
      phone: updated.phone,
    };
  }

  /** profiles_teacher_read_students + profiles_teacher_read_parents, combined. */
  private async teacherCanSeeProfile(teacherId: string, profileId: string): Promise<boolean> {
    const asStudent = await this.prisma.students.findFirst({
      where: {
        profile_id: profileId,
        classes: { teacher_classes: { some: { teacher_id: teacherId } } },
      },
      select: { id: true },
    });
    if (asStudent) return true;
    const asParent = await this.prisma.parent_student.findFirst({
      where: {
        parent_id: profileId,
        students: { classes: { teacher_classes: { some: { teacher_id: teacherId } } } },
      },
      select: { student_id: true },
    });
    return !!asParent;
  }
}
