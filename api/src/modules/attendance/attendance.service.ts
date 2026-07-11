import { ConflictException, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { Prisma, attendance_status } from "@prisma/client";
import { PrismaService } from "../../infra/database/prisma.service";
import type { AuthUser } from "../../common/decorators/current-user.decorator";

/**
 * RLS translation (api/db/rls-policies-extracted.csv):
 *   attendance_admin_all     -> admin: read + write, unrestricted
 *   attendance_teacher_class -> teacher: read + write for rows whose class_id is in
 *                               their teacher_classes (policy is ALL, so marking too)
 *   attendance_parent_read   -> parent: rows of children via parent_student
 *   attendance_self_read     -> student: rows of their own student record
 */
@Injectable()
export class AttendanceService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private scopeFilter(actor: AuthUser): Prisma.attendanceWhereInput | null {
    if (actor.roles.includes("admin")) return {};
    if (actor.roles.includes("teacher")) {
      return { classes: { teacher_classes: { some: { teacher_id: actor.id } } } };
    }
    if (actor.roles.includes("parent")) {
      return { students: { parent_student: { some: { parent_id: actor.id } } } };
    }
    if (actor.roles.includes("student")) {
      return { students: { profile_id: actor.id } };
    }
    return null;
  }

  async list(
    actor: AuthUser,
    opts: {
      studentId?: string;
      classId?: string;
      from?: string;
      to?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    const scope = this.scopeFilter(actor);
    const page = opts.page ?? 1;
    const pageSize = Math.min(opts.pageSize ?? 100, 500);
    if (scope === null) return { total: 0, page, pageSize, rows: [] };

    const where: Prisma.attendanceWhereInput = {
      AND: [
        scope,
        opts.studentId ? { student_id: opts.studentId } : {},
        opts.classId ? { class_id: opts.classId } : {},
        opts.from ? { date: { gte: new Date(opts.from) } } : {},
        opts.to ? { date: { lte: new Date(opts.to) } } : {},
      ],
    };
    const [total, rows] = await Promise.all([
      this.prisma.attendance.count({ where }),
      this.prisma.attendance.findMany({
        where,
        orderBy: { date: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          students: {
            select: { id: true, roll_no: true, profiles: { select: { full_name: true } } },
          },
        },
      }),
    ]);
    return {
      total,
      page,
      pageSize,
      rows: rows.map((a) => ({
        id: a.id,
        studentId: a.student_id,
        studentName: a.students?.profiles?.full_name ?? null,
        rollNo: a.students?.roll_no ?? null,
        classId: a.class_id,
        date: a.date,
        status: a.status,
        markedBy: a.marked_by,
      })),
    };
  }

  /**
   * Marking (upsert on the (student_id, date) unique key). Allowed for admin
   * everywhere and for teachers on their own classes — the exact write surface
   * of attendance_admin_all + attendance_teacher_class (both cmd=ALL).
   */
  async mark(
    actor: AuthUser,
    classId: string,
    date: string,
    entries: { studentId: string; status: string }[],
  ) {
    if (!actor.roles.includes("admin")) {
      if (!actor.roles.includes("teacher")) throw new ForbiddenException();
      const assigned = await this.prisma.teacher_classes.findFirst({
        where: { teacher_id: actor.id, class_id: classId },
      });
      if (!assigned) throw new ForbiddenException("Not your class");
    }
    const day = new Date(date);
    await this.prisma.$transaction(
      entries.map((e) =>
        this.prisma.attendance.upsert({
          where: { student_id_date: { student_id: e.studentId, date: day } },
          create: {
            student_id: e.studentId,
            class_id: classId,
            date: day,
            status: e.status as attendance_status,
            marked_by: actor.id,
          },
          update: { status: e.status as attendance_status, marked_by: actor.id },
        }),
      ),
    );
    return { ok: true, marked: entries.length };
  }

  /**
   * Teacher self-attendance (hybrid self-mark). Resolves the caller's teacher
   * record by email (teacher rows are keyed to auth by email), returns today's
   * status row if present. teacher_attendance policies: ta_teacher_read_own /
   * ta_teacher_self_mark.
   */
  async myTeacherAttendance(actor: AuthUser) {
    const teacher = await this.prisma.teachers.findFirst({
      where: { email: { equals: actor.email, mode: "insensitive" } },
      select: { id: true, email: true },
    });
    if (!teacher) return { teacher: null, today: null };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const row = await this.prisma.teacher_attendance.findFirst({
      where: { teacher_id: teacher.id, date: today },
    });
    return { teacher: { id: teacher.id, email: teacher.email }, today: row };
  }

  /** ta_teacher_self_mark: one self-mark per teacher per day. */
  async markSelf(actor: AuthUser, status: string) {
    const teacher = await this.prisma.teachers.findFirst({
      where: { email: { equals: actor.email, mode: "insensitive" } },
      select: { id: true },
    });
    if (!teacher) throw new ForbiddenException("No teacher record linked to this account");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const existing = await this.prisma.teacher_attendance.findFirst({
      where: { teacher_id: teacher.id, date: today },
    });
    if (existing) throw new ConflictException("Attendance already marked for today");
    const row = await this.prisma.teacher_attendance.create({
      data: {
        teacher_id: teacher.id,
        date: today,
        status,
        marked_by: "self",
        marked_by_user: actor.id,
        check_in_time: new Date(),
      },
    });
    return { ok: true, id: row.id };
  }

  /** School-wide attendance for one date, per class + drill-down rows (admin, attendance_admin_all). */
  async overview(actor: AuthUser, date: string) {
    if (!actor.roles.includes("admin")) throw new ForbiddenException();
    const day = new Date(`${date.slice(0, 10)}T00:00:00.000Z`);
    const next = new Date(day.getTime() + 86_400_000);

    const [classes, enrolments, rows] = await Promise.all([
      this.prisma.classes.findMany({
        select: { id: true, name: true, section: true },
        orderBy: [{ name: "asc" }, { section: "asc" }],
      }),
      this.prisma.students.findMany({ select: { class_id: true } }),
      this.prisma.attendance.findMany({
        where: { date: { gte: day, lt: next } },
        select: {
          student_id: true,
          class_id: true,
          status: true,
          students: {
            select: {
              admission_no: true,
              roll_no: true,
              profiles: { select: { full_name: true } },
            },
          },
        },
      }),
    ]);

    const perClass = new Map<
      string,
      {
        id: string;
        name: string;
        section: string | null;
        total: number;
        present: number;
        absent: number;
        late: number;
        excused: number;
      }
    >();
    for (const c of classes) {
      perClass.set(c.id, {
        id: c.id,
        name: `${c.name}${c.section ? ` · ${c.section}` : ""}`,
        section: c.section,
        total: 0,
        present: 0,
        absent: 0,
        late: 0,
        excused: 0,
      });
    }
    for (const s of enrolments) {
      if (s.class_id && perClass.has(s.class_id)) perClass.get(s.class_id)!.total += 1;
    }
    for (const r of rows) {
      if (!r.class_id || !perClass.has(r.class_id)) continue;
      const e = perClass.get(r.class_id)! as any;
      if (r.status in e) e[r.status] += 1;
    }

    const perClassArr = Array.from(perClass.values());
    const totals = perClassArr.reduce(
      (a, v) => ({
        total: a.total + v.total,
        present: a.present + v.present,
        absent: a.absent + v.absent,
        late: a.late + v.late,
        excused: a.excused + v.excused,
      }),
      { total: 0, present: 0, absent: 0, late: 0, excused: 0 },
    );

    return {
      classes: classes.map((c) => ({ id: c.id, name: c.name, section: c.section })),
      perClass: perClassArr,
      totals: { ...totals, marked: totals.present + totals.absent + totals.late + totals.excused },
      rows: rows.map((r) => ({
        student_id: r.student_id,
        class_id: r.class_id,
        status: r.status,
        student_name: r.students?.profiles?.full_name ?? null,
        roll_no: r.students?.roll_no ?? null,
        admission_no: r.students?.admission_no ?? null,
      })),
    };
  }
}
