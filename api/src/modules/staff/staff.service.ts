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

  /**
   * Full teacher-detail bundle for the admin/HR teacher page (~1070 lines, 17
   * tables). Resolves teacher -> staff -> profile id, then aggregates every
   * section the page renders. Gated admin|hr (the page's RequireRole).
   */
  async teacherDetail(actor: AuthUser, teacherId: string) {
    if (!actor.roles.some((r) => r === "admin" || r === "hr")) throw new ForbiddenException();
    const teacher = await this.prisma.teachers.findUnique({ where: { id: teacherId } });
    if (!teacher) throw new NotFoundException();
    const staffId = teacher.staff_id ?? null;
    const staff = staffId ? await this.prisma.staff.findUnique({ where: { id: staffId } }) : null;
    const profileId = staff?.profile_id ?? null;

    const [qualifications, experience, attendance, reviews] = await Promise.all([
      this.prisma.teacher_qualifications.findMany({
        where: { teacher_id: teacherId },
        orderBy: { year: "desc" },
      }),
      this.prisma.teacher_experience.findMany({
        where: { teacher_id: teacherId },
        orderBy: { start_date: "desc" },
      }),
      this.prisma.teacher_attendance.findMany({
        where: { teacher_id: teacherId },
        orderBy: { date: "desc" },
        take: 90,
      }),
      this.prisma.teacher_performance_reviews.findMany({
        where: { teacher_id: teacherId },
        orderBy: { period: "desc" },
      }),
    ]);

    // reviewer names
    const reviewerIds = Array.from(
      new Set(reviews.map((r) => r.reviewer_id).filter(Boolean)),
    ) as string[];
    const reviewerNames = reviewerIds.length
      ? new Map(
          (
            await this.prisma.profiles.findMany({
              where: { id: { in: reviewerIds } },
              select: { id: true, full_name: true },
            })
          ).map((p) => [p.id, p.full_name]),
        )
      : new Map<string, string>();

    // profile-id-scoped sets
    const [classes, timetable, homework, assets, announcements] = profileId
      ? await Promise.all([
          this.prisma.teacher_classes.findMany({
            where: { teacher_id: profileId },
            select: {
              id: true,
              class_id: true,
              classes: { select: { id: true, name: true, section: true, academic_year: true } },
            },
          }),
          this.prisma.timetable.findMany({
            where: { teacher_id: profileId },
            orderBy: [{ day_of_week: "asc" }, { start_time: "asc" }],
            include: {
              classes: { select: { name: true, section: true } },
              subjects: { select: { name: true, code: true } },
            },
          }),
          this.prisma.homework.findMany({
            where: { teacher_id: profileId },
            orderBy: { assigned_date: "desc" },
            take: 100,
            include: {
              classes: { select: { name: true, section: true } },
              subjects: { select: { name: true } },
            },
          }),
          this.prisma.assets.findMany({
            where: { assigned_to_profile_id: profileId },
            select: {
              id: true,
              asset_code: true,
              name: true,
              category: true,
              status: true,
              condition: true,
              updated_at: true,
            },
          }),
          this.prisma.announcements.findMany({
            where: { author_id: profileId },
            orderBy: { created_at: "desc" },
            take: 50,
            select: {
              id: true,
              title: true,
              body: true,
              audience: true,
              created_at: true,
              class_id: true,
            },
          }),
        ])
      : [[], [], [], [], []];

    const classIds = (classes as any[]).map((c) => c.class_id);
    const exams = classIds.length
      ? await this.prisma.exams.findMany({
          where: { class_id: { in: classIds } },
          orderBy: { exam_date: "desc" },
          include: {
            classes: { select: { name: true, section: true } },
            subjects: { select: { name: true } },
            exam_results: { select: { id: true, marks_obtained: true, grade: true } },
          },
        })
      : [];

    // staff-id-scoped sets
    const [payroll, leaves, docs, history, training] = staffId
      ? await Promise.all([
          this.prisma.payroll_runs.findMany({
            where: { staff_id: staffId },
            orderBy: { month: "desc" },
          }),
          this.prisma.leave_requests.findMany({
            where: { staff_id: staffId },
            orderBy: { start_date: "desc" },
          }),
          this.prisma.staff_documents.findMany({
            where: { staff_id: staffId },
            orderBy: { uploaded_at: "desc" },
          }),
          this.prisma.staff_employment_history.findMany({
            where: { staff_id: staffId },
            orderBy: { effective_date: "desc" },
          }),
          this.prisma.training_attendance.findMany({
            where: { staff_id: staffId },
            include: {
              training_programs: {
                select: { title: true, start_date: true, end_date: true, provider: true },
              },
            },
          }),
        ])
      : [[], [], [], [], []];

    return {
      teacher,
      staff,
      qualifications,
      experience,
      classes,
      timetable,
      homework,
      exams,
      attendance,
      reviews: reviews.map((r) => ({
        ...r,
        profiles: r.reviewer_id ? { full_name: reviewerNames.get(r.reviewer_id) ?? null } : null,
      })),
      payroll,
      leaves,
      docs,
      history,
      assets,
      training: (training as any[]).map((t) => ({
        ...t,
        training_programs: t.training_programs
          ? {
              // the page reads `.name`; the column is `title`.
              name: t.training_programs.title,
              title: t.training_programs.title,
              start_date: t.training_programs.start_date,
              end_date: t.training_programs.end_date,
              provider: t.training_programs.provider,
            }
          : null,
      })),
      announcements,
    };
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
