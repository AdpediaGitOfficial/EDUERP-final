import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../infra/database/prisma.service";
import { AuthService } from "../auth/auth.service";
import type { AuthUser } from "../../common/decorators/current-user.decorator";

export const APP_ROLES = [
  "admin",
  "teacher",
  "student",
  "parent",
  "hr",
  "accountant",
  "reception",
  "fleet_manager",
] as const;
export type AppRoleName = (typeof APP_ROLES)[number];

export type CreateUserInput = {
  fullName: string;
  email: string;
  password: string;
  role: string;
  phone?: string | null;
};

export type UpdateUserInput = {
  fullName?: string;
  phone?: string | null;
  role?: string;
  status?: "active" | "inactive";
};

export type ListUsersFilter = {
  role?: string;
  status?: "active" | "inactive";
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

  async listUsers(
    actor: AuthUser,
    page = 1,
    pageSize = 50,
    q?: string,
    filter: ListUsersFilter = {},
  ) {
    if (!actor.roles.includes("admin")) throw new ForbiddenException("Admin only");

    const where: Prisma.profilesWhereInput = {};
    if (q?.trim()) {
      where.OR = [
        { full_name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ];
    }
    if (filter.status) where.status = filter.status;
    // Roles live in user_roles (keyed on the auth uid = profiles.id) and profiles
    // has no relation to it, so narrow by id when a role filter is requested.
    if (filter.role) {
      const roleName = this.assertRole(filter.role);
      const ids = await this.prisma.user_roles.findMany({
        where: { role: roleName as Prisma.user_rolesWhereInput["role"] },
        select: { user_id: true },
      });
      where.id = { in: ids.map((r) => r.user_id) };
    }

    const [total, rows] = await Promise.all([
      this.prisma.profiles.count({ where }),
      this.prisma.profiles.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    const ids = rows.map((p) => p.id);
    const [roleRows, authRows] = await Promise.all([
      this.prisma.user_roles.findMany({ where: { user_id: { in: ids } } }),
      this.prisma.users.findMany({
        where: { id: { in: ids } },
        select: { id: true, last_sign_in_at: true },
      }),
    ]);
    const rolesByUser = new Map<string, string[]>();
    for (const r of roleRows) {
      rolesByUser.set(r.user_id, [...(rolesByUser.get(r.user_id) ?? []), r.role as string]);
    }
    const lastSignInByUser = new Map<string, Date | null>(
      authRows.map((u) => [u.id, u.last_sign_in_at]),
    );
    return {
      total,
      page,
      pageSize,
      rows: rows.map((p) => ({
        id: p.id,
        fullName: p.full_name,
        email: p.email,
        phone: p.phone,
        status: p.status,
        roles: rolesByUser.get(p.id) ?? [],
        lastSignInAt: lastSignInByUser.get(p.id) ?? null,
        createdAt: p.created_at,
      })),
    };
  }

  private assertRole(role: string): AppRoleName {
    if (!(APP_ROLES as readonly string[]).includes(role))
      throw new BadRequestException(`Unknown role: ${role}`);
    return role as AppRoleName;
  }

  /**
   * Admin updates another user's profile: name, phone, role, and active status.
   * Guards against self-lockout (an admin cannot demote or deactivate their own
   * account here — that must be done by another admin).
   */
  async updateUser(actor: AuthUser, id: string, input: UpdateUserInput) {
    if (!actor.roles.includes("admin"))
      throw new ForbiddenException("Only administrators can edit users.");
    const target = await this.prisma.profiles.findUnique({ where: { id } });
    if (!target) throw new NotFoundException("User not found");

    const isSelf = actor.id === id;
    if (isSelf && input.role && input.role !== "admin")
      throw new BadRequestException("You cannot change your own admin role.");
    if (isSelf && input.status === "inactive")
      throw new BadRequestException("You cannot deactivate your own account.");

    const newRole = input.role ? this.assertRole(input.role) : undefined;

    await this.prisma.$transaction(async (tx) => {
      await tx.profiles.update({
        where: { id },
        data: {
          ...(input.fullName !== undefined ? { full_name: input.fullName } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          updated_at: new Date(),
        },
      });
      if (newRole) {
        await tx.$executeRaw`DELETE FROM public.user_roles WHERE user_id = ${id}::uuid`;
        await tx.$executeRaw`INSERT INTO public.user_roles (user_id, role) VALUES (${id}::uuid, ${newRole}::app_role) ON CONFLICT DO NOTHING`;
      }
    });
    return this.getProfile(actor, id);
  }

  /**
   * Admin deletes a user. Because payments/attendance/holidays reference the auth
   * account via ON DELETE NO ACTION, a hard delete only succeeds for users with no
   * such history; when it can't, the caller is told to deactivate instead (which
   * blocks login without touching referenced rows).
   */
  async deleteUser(actor: AuthUser, id: string) {
    if (!actor.roles.includes("admin"))
      throw new ForbiddenException("Only administrators can delete users.");
    if (actor.id === id) throw new BadRequestException("You cannot delete your own account.");
    const target = await this.prisma.profiles.findUnique({ where: { id } });
    if (!target) throw new NotFoundException("User not found");
    try {
      // profiles has no FK to auth.users, so both rows must go, atomically: the
      // profile (cascades to students/parent_student, nulls asset/expense refs)
      // and the auth account (cascades user_roles/identities). If the account is
      // referenced by ON DELETE NO ACTION rows (payments/attendance/holidays),
      // the users.delete throws P2003 and the whole transaction rolls back —
      // nothing is half-deleted — and we tell the admin to deactivate instead.
      await this.prisma.$transaction([
        this.prisma.profiles.delete({ where: { id } }),
        this.prisma.users.delete({ where: { id } }),
      ]);
      return { ok: true, deleted: true, id };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
        throw new ConflictException(
          "This user has linked records (payments, attendance, etc.) and can't be permanently deleted. Deactivate the account instead.",
        );
      }
      throw e;
    }
  }

  async getProfile(actor: AuthUser, id: string) {
    const allowed =
      actor.id === id ||
      actor.roles.includes("admin") ||
      (actor.roles.includes("teacher") && (await this.teacherCanSeeProfile(actor.id, id)));
    if (!allowed) throw new ForbiddenException();
    const [profile, roleRows, authRow] = await Promise.all([
      this.prisma.profiles.findUnique({ where: { id } }),
      this.prisma.user_roles.findMany({ where: { user_id: id } }),
      this.prisma.users.findUnique({
        where: { id },
        select: { last_sign_in_at: true },
      }),
    ]);
    if (!profile) throw new NotFoundException();
    return {
      id: profile.id,
      fullName: profile.full_name,
      email: profile.email,
      phone: profile.phone,
      avatarUrl: profile.avatar_url,
      status: profile.status,
      roles: roleRows.map((r) => r.role as string),
      lastSignInAt: authRow?.last_sign_in_at ?? null,
      createdAt: profile.created_at,
    };
  }

  async updateOwnProfile(
    actor: AuthUser,
    data: { fullName?: string; phone?: string; avatarUrl?: string | null },
  ) {
    // profiles_update_own: a user may update only their own row.
    const updated = await this.prisma.profiles.update({
      where: { id: actor.id },
      data: {
        ...(data.fullName !== undefined ? { full_name: data.fullName } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.avatarUrl !== undefined ? { avatar_url: data.avatarUrl } : {}),
      },
    });
    return {
      id: updated.id,
      fullName: updated.full_name,
      email: updated.email,
      phone: updated.phone,
      avatarUrl: updated.avatar_url,
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
