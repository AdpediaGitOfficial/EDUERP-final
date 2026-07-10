import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../infra/database/prisma.service";
import type { AuthUser } from "../../common/decorators/current-user.decorator";

/**
 * RLS translation (api/db/rls-policies-extracted.csv):
 *   staff:    hr_admin_all_staff -> hr|admin unrestricted; staff_read_own -> own row
 *             (profile_id = uid); others zero rows
 *   teachers: teachers_admin_all/read -> admin; teachers_self_read -> own row matched
 *             BY EMAIL (teachers.id is not always the auth uid in legacy rows — the
 *             RLS compares lower(email) = lower(auth.email()); reproduced verbatim)
 *   teacher_classes: tc_admin_all -> admin; tc_teacher_read_own -> own assignments
 */
@Injectable()
export class StaffService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listStaff(actor: AuthUser, page = 1, pageSize = 50, q?: string) {
    const isHrOrAdmin = actor.roles.some((r) => r === "admin" || r === "hr");
    if (!isHrOrAdmin) {
      // staff_read_own: non-HR staff see exactly their own record.
      const own = await this.prisma.staff.findFirst({ where: { profile_id: actor.id } });
      return { total: own ? 1 : 0, page: 1, pageSize, rows: own ? [this.staffRow(own)] : [] };
    }
    const where = q
      ? {
          OR: [
            { full_name: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
            { employee_code: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {};
    const [total, rows] = await Promise.all([
      this.prisma.staff.count({ where }),
      this.prisma.staff.findMany({
        where,
        orderBy: { full_name: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { total, page, pageSize, rows: rows.map((s) => this.staffRow(s)) };
  }

  async getStaff(actor: AuthUser, id: string) {
    const isHrOrAdmin = actor.roles.some((r) => r === "admin" || r === "hr");
    const row = await this.prisma.staff.findUnique({ where: { id } });
    if (!row) throw new NotFoundException();
    if (!isHrOrAdmin && row.profile_id !== actor.id) throw new NotFoundException(); // RLS invisibility
    return this.staffRow(row);
  }

  async listTeachers(actor: AuthUser, page = 1, pageSize = 50, q?: string) {
    if (actor.roles.includes("admin")) {
      const where = q
        ? {
            OR: [
              { full_name: { contains: q, mode: "insensitive" as const } },
              { email: { contains: q, mode: "insensitive" as const } },
              { subject: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {};
      const [total, rows] = await Promise.all([
        this.prisma.teachers.count({ where }),
        this.prisma.teachers.findMany({
          where,
          orderBy: { full_name: "asc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
      ]);
      return { total, page, pageSize, rows: rows.map((t) => this.teacherRow(t)) };
    }
    // teachers_self_read: matched by email, exactly as the policy does.
    const own = await this.prisma.teachers.findFirst({
      where: { email: { equals: actor.email, mode: "insensitive" } },
    });
    return { total: own ? 1 : 0, page: 1, pageSize, rows: own ? [this.teacherRow(own)] : [] };
  }

  async getTeacher(actor: AuthUser, id: string) {
    const row = await this.prisma.teachers.findUnique({ where: { id } });
    if (!row) throw new NotFoundException();
    const allowed =
      actor.roles.includes("admin") ||
      (row.email ?? "").toLowerCase() === actor.email.toLowerCase();
    if (!allowed) throw new NotFoundException(); // RLS invisibility
    return this.teacherRow(row);
  }

  async listTeacherClasses(actor: AuthUser, teacherId: string) {
    // tc_admin_all | tc_teacher_read_own
    if (!actor.roles.includes("admin") && actor.id !== teacherId) throw new ForbiddenException();
    const rows = await this.prisma.teacher_classes.findMany({
      where: { teacher_id: teacherId },
      include: { classes: { select: { id: true, name: true, section: true } } },
    });
    return rows.map((r) => ({
      classId: r.class_id,
      name: r.classes?.name,
      section: r.classes?.section,
    }));
  }

  private staffRow(s: any) {
    return {
      id: s.id,
      employeeCode: s.employee_code,
      fullName: s.full_name,
      email: s.email,
      phone: s.phone,
      department: s.department,
      designation: s.designation,
      employmentType: s.employment_type,
      status: s.status,
      joinDate: s.join_date,
      profileId: s.profile_id,
    };
  }

  private teacherRow(t: any) {
    return {
      id: t.id,
      fullName: t.full_name,
      email: t.email,
      phone: t.phone,
      subject: t.subject,
      qualification: t.qualification,
      experienceYears: t.experience_years,
      joinedDate: t.joined_date,
      status: t.status,
    };
  }
}
