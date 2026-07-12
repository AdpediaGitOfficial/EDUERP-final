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
import type { AuthUser } from "../../common/decorators/current-user.decorator";

export interface ElectiveOfferingInput {
  name: string;
  code?: string | null;
  description?: string | null;
  session?: string | null;
  grade_level?: string | null;
  seat_capacity?: number;
  subject_id?: string | null;
  is_active?: boolean;
}
export interface TimetableSlotInput {
  class_id: string;
  subject_id?: string | null;
  teacher_id?: string | null;
  day_of_week: number;
  start_time: string; // "HH:MM"
  end_time: string; // "HH:MM"
  room?: string | null;
}
export interface RoomInput {
  room_number: string;
  name?: string | null;
  capacity?: number;
  floor?: string | null;
  building?: string | null;
  room_type?: string;
  is_smart?: boolean;
  has_projector?: boolean;
  is_active?: boolean;
}
export interface SubjectInput {
  class_id: string;
  name: string;
  code?: string | null;
  short_name?: string | null;
  category?: string | null;
  subject_type?: string;
  nature?: string;
  credits?: number;
  weekly_periods?: number;
  pass_marks?: number;
  max_marks?: number;
  lab_required?: boolean;
  department?: string | null;
  color?: string | null;
}

/**
 * RLS translation (api/db/rls-policies-extracted.csv):
 *   classes:   classes_read_auth  -> any authenticated user may read (qual: true)
 *   subjects:  subjects_read_auth -> any authenticated user may read (qual: true)
 *   timetable: timetable_read_auth -> any authenticated user may read (qual: true)
 *   (admin-only writes deferred to the write-path migration for this module)
 * `get_class_stats` (DB function) is ported as an explicit aggregate query.
 */
@Injectable()
export class AcademicsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listClasses(_actor: AuthUser, year?: string) {
    const rows = await this.prisma.classes.findMany({
      where: year && year !== "all" ? { academic_year: year } : {},
      orderBy: [{ name: "asc" }, { section: "asc" }],
      include: { _count: { select: { students: true } } },
    });
    // Port of the get_class_stats DB function: 30-day attendance totals with
    // present = status IN ('present','late'), grouped per class.
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const ids = rows.map((c) => c.id);
    const [attendance, teacherProfiles] = await Promise.all([
      ids.length
        ? this.prisma.attendance.groupBy({
            by: ["class_id", "status"],
            where: { class_id: { in: ids }, date: { gte: since } },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      this.prisma.profiles.findMany({
        where: { id: { in: rows.map((c) => c.class_teacher_id).filter((x): x is string => !!x) } },
        select: { id: true, full_name: true },
      }),
    ]);
    const att = new Map<string, { total: number; present: number }>();
    for (const row of attendance) {
      const key = row.class_id as string;
      const cur = att.get(key) ?? { total: 0, present: 0 };
      cur.total += row._count._all;
      if (row.status === "present" || row.status === "late") cur.present += row._count._all;
      att.set(key, cur);
    }
    const teacherName = new Map(teacherProfiles.map((p) => [p.id, p.full_name]));
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      section: c.section,
      academicYear: c.academic_year,
      capacity: c.capacity,
      room: c.room,
      studentCount: c._count.students,
      attendanceTotal: att.get(c.id)?.total ?? 0,
      attendancePresent: att.get(c.id)?.present ?? 0,
      classTeacherId: c.class_teacher_id,
      classTeacherName: c.class_teacher_id ? (teacherName.get(c.class_teacher_id) ?? null) : null,
    }));
  }

  async listYears(_actor: AuthUser) {
    const rows = await this.prisma.classes.findMany({
      select: { academic_year: true },
      distinct: ["academic_year"],
    });
    return rows
      .map((r) => r.academic_year)
      .filter(Boolean)
      .sort()
      .reverse();
  }

  /** Distinct teachers appearing in teacher_classes, for the class-teacher picker. */
  async teacherOptions(_actor: AuthUser) {
    const rows = await this.prisma.teacher_classes.findMany({
      select: { teacher_id: true },
      distinct: ["teacher_id"],
    });
    const profs = await this.prisma.profiles.findMany({
      where: { id: { in: rows.map((r) => r.teacher_id) } },
      select: { id: true, full_name: true },
      orderBy: { full_name: "asc" },
    });
    return profs.map((p) => ({ id: p.id, fullName: p.full_name }));
  }

  async createClass(
    actor: AuthUser,
    data: {
      name: string;
      section?: string;
      academicYear: string;
      capacity?: number;
      room?: string;
      classTeacherId?: string;
    },
  ) {
    // classes_admin_write
    if (!actor.roles.includes("admin")) throw new ForbiddenException();
    // classes_name_section_year_key is UNIQUE — surface a clean 409 instead of a 500.
    const existing = await this.prisma.classes.findFirst({
      where: {
        name: data.name,
        section: data.section || null,
        academic_year: data.academicYear,
      },
      select: { id: true },
    });
    if (existing) throw new ConflictException("That class/section already exists for this year");
    const row = await this.prisma.classes.create({
      data: {
        name: data.name,
        section: data.section || null,
        academic_year: data.academicYear,
        capacity: data.capacity ?? null,
        room: data.room || null,
        class_teacher_id: data.classTeacherId || null,
      },
    });
    return { id: row.id };
  }

  async getClass(_actor: AuthUser, id: string) {
    const cls = await this.prisma.classes.findUnique({
      where: { id },
      include: {
        _count: { select: { students: true } },
        subjects: { select: { id: true, name: true, code: true } },
        teacher_classes: { select: { teacher_id: true } },
      },
    });
    if (!cls) throw new NotFoundException();
    return {
      id: cls.id,
      name: cls.name,
      section: cls.section,
      academicYear: cls.academic_year,
      studentCount: cls._count.students,
      subjects: cls.subjects,
      teacherIds: cls.teacher_classes.map((t) => t.teacher_id),
    };
  }

  async listSubjects(_actor: AuthUser, classId?: string) {
    const rows = await this.prisma.subjects.findMany({
      where: classId ? { class_id: classId } : {},
      orderBy: { name: "asc" },
      include: { classes: { select: { name: true, section: true, academic_year: true } } },
    });
    return rows.map((s) => ({
      id: s.id,
      classId: s.class_id,
      className: s.classes ? `${s.classes.name} ${s.classes.section ?? ""}`.trim() : null,
      academicYear: s.classes?.academic_year ?? null,
      name: s.name,
      code: s.code,
      shortName: s.short_name,
      category: s.category,
      subjectType: s.subject_type,
      nature: s.nature,
      credits: Number(s.credits),
      weeklyPeriods: s.weekly_periods,
      passMarks: Number(s.pass_marks),
      maxMarks: Number(s.max_marks),
      labRequired: s.lab_required,
      department: s.department,
      color: s.color,
      isActive: s.is_active,
    }));
  }

  private mapSubjectInput(input: SubjectInput) {
    return {
      name: input.name,
      code: input.code || null,
      short_name: input.short_name || null,
      category: input.category || null,
      subject_type: input.subject_type || "compulsory",
      nature: input.nature || "theory",
      credits: input.credits ?? 0,
      weekly_periods: input.weekly_periods ?? 0,
      pass_marks: input.pass_marks ?? 33,
      max_marks: input.max_marks ?? 100,
      lab_required: input.lab_required ?? false,
      department: input.department || null,
      color: input.color || null,
    };
  }

  async createSubject(actor: AuthUser, input: SubjectInput) {
    this.requireAcademicAdmin(actor);
    const cls = await this.prisma.classes.findUnique({ where: { id: input.class_id } });
    if (!cls) throw new NotFoundException("Class not found");
    if (input.code) {
      const dup = await this.prisma.subjects.findFirst({
        where: { class_id: input.class_id, code: input.code },
        select: { id: true },
      });
      if (dup) throw new ConflictException("That subject code already exists for this class.");
    }
    const row = await this.prisma.subjects.create({
      data: { class_id: input.class_id, ...this.mapSubjectInput(input) },
    });
    return { id: row.id };
  }

  async updateSubject(actor: AuthUser, id: string, input: SubjectInput) {
    this.requireAcademicAdmin(actor);
    const existing = await this.prisma.subjects.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Subject not found");
    if (input.code && input.code !== existing.code) {
      const dup = await this.prisma.subjects.findFirst({
        where: { class_id: existing.class_id, code: input.code, id: { not: id } },
        select: { id: true },
      });
      if (dup) throw new ConflictException("That subject code already exists for this class.");
    }
    await this.prisma.subjects.update({ where: { id }, data: this.mapSubjectInput(input) });
    return { ok: true };
  }

  /** Soft enable/disable — subjects have exam/timetable/homework FKs, never hard-deleted. */
  async setSubjectActive(actor: AuthUser, id: string, isActive: boolean) {
    this.requireAcademicAdmin(actor);
    const existing = await this.prisma.subjects.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Subject not found");
    await this.prisma.subjects.update({ where: { id }, data: { is_active: isActive } });
    return { ok: true };
  }

  /**
   * Full class-detail bundle for the admin/HR class page: class row + class
   * teacher, roster, per-student 30-day attendance / performance / fee / parent
   * extras, teacher assignments + timetable, and same-grade school averages.
   * Gated to admin|hr (the page's RequireRole).
   */
  async classDetail(actor: AuthUser, classId: string) {
    if (!actor.roles.some((r) => r === "admin" || r === "hr")) throw new ForbiddenException();
    const cls = await this.prisma.classes.findUnique({ where: { id: classId } });
    if (!cls) throw new NotFoundException();

    const dstr = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
    const hhmm = (d: Date | null) => (d ? d.toISOString().slice(11, 16) : null);
    const num = (v: unknown) => (v == null ? null : Number(v));

    const [classTeacher, students, tc, tt, sameGrade] = await Promise.all([
      cls.class_teacher_id
        ? this.prisma.profiles.findUnique({
            where: { id: cls.class_teacher_id },
            select: { id: true, full_name: true, email: true },
          })
        : Promise.resolve(null),
      this.prisma.students.findMany({
        where: { class_id: classId },
        orderBy: { roll_no: "asc" },
        select: {
          id: true,
          admission_no: true,
          roll_no: true,
          gender: true,
          status: true,
          profile_id: true,
          profiles: { select: { full_name: true, email: true } },
        },
      }),
      this.prisma.teacher_classes.findMany({
        where: { class_id: classId },
        select: { teacher_id: true },
      }),
      this.prisma.timetable.findMany({
        where: { class_id: classId },
        orderBy: [{ day_of_week: "asc" }, { start_time: "asc" }],
        select: {
          id: true,
          teacher_id: true,
          day_of_week: true,
          start_time: true,
          end_time: true,
          room: true,
          subjects: { select: { id: true, name: true } },
        },
      }),
      this.prisma.classes.findMany({
        where: { name: cls.name, academic_year: cls.academic_year },
        select: { id: true },
      }),
    ]);

    const studentIds = students.map((s) => s.id);
    const since = new Date(Date.now() - 30 * 86_400_000);
    const [att, ex, fa, ps] = await Promise.all([
      studentIds.length
        ? this.prisma.attendance.findMany({
            where: { student_id: { in: studentIds }, date: { gte: since } },
            select: { student_id: true, status: true, date: true },
          })
        : Promise.resolve([]),
      studentIds.length
        ? this.prisma.exam_results.findMany({
            where: { student_id: { in: studentIds } },
            select: {
              student_id: true,
              marks_obtained: true,
              exams: { select: { max_marks: true, subjects: { select: { name: true } } } },
            },
          })
        : Promise.resolve([]),
      studentIds.length
        ? this.prisma.fee_assignments.findMany({
            where: { student_id: { in: studentIds } },
            select: { student_id: true, status: true, amount_due: true, amount_paid: true },
          })
        : Promise.resolve([]),
      studentIds.length
        ? this.prisma.parent_student.findMany({
            where: { student_id: { in: studentIds } },
            select: {
              student_id: true,
              relationship: true,
              profiles: { select: { full_name: true, email: true } },
            },
          })
        : Promise.resolve([]),
    ]);

    // Teacher profiles (for tc + tt), enriched with the teachers row (by email).
    const teacherIds = Array.from(
      new Set([...tc.map((r) => r.teacher_id), ...tt.map((r) => r.teacher_id)].filter(Boolean)),
    ) as string[];
    const profs = teacherIds.length
      ? await this.prisma.profiles.findMany({
          where: { id: { in: teacherIds } },
          select: { id: true, full_name: true, email: true },
        })
      : [];
    const emails = profs.map((p) => p.email).filter(Boolean) as string[];
    const teacherRows = emails.length
      ? await this.prisma.teachers.findMany({
          where: { email: { in: emails } },
          select: { id: true, email: true, subject: true },
        })
      : [];
    const teacherByEmail = new Map(teacherRows.map((t) => [t.email, t]));
    const profById: Record<string, any> = {};
    for (const p of profs) {
      profById[p.id] = {
        id: p.id,
        full_name: p.full_name,
        email: p.email,
        teacher: p.email ? (teacherByEmail.get(p.email) ?? null) : null,
      };
    }

    // Same-grade school average by subject.
    const gradeIds = sameGrade.map((c) => c.id);
    const gradeResults = gradeIds.length
      ? await this.prisma.exam_results.findMany({
          where: { exams: { class_id: { in: gradeIds } } },
          select: {
            marks_obtained: true,
            exams: { select: { max_marks: true, subjects: { select: { name: true } } } },
          },
        })
      : [];
    const bySubject: Record<string, { got: number; max: number }> = {};
    for (const r of gradeResults) {
      const name = r.exams?.subjects?.name ?? "—";
      const m = (bySubject[name] ||= { got: 0, max: 0 });
      m.got += Number(r.marks_obtained) || 0;
      m.max += Number(r.exams?.max_marks) || 0;
    }
    const schoolAvgBySubject = Object.fromEntries(
      Object.entries(bySubject).map(([k, v]) => [k, v.max ? (v.got / v.max) * 100 : 0]),
    );

    return {
      cls,
      classTeacher,
      students,
      extras: {
        att: att.map((a) => ({ student_id: a.student_id, status: a.status, date: dstr(a.date) })),
        ex: ex.map((r) => ({
          student_id: r.student_id,
          marks_obtained: num(r.marks_obtained),
          exams: r.exams
            ? {
                max_marks: r.exams.max_marks,
                subjects: r.exams.subjects ? { name: r.exams.subjects.name } : null,
              }
            : null,
        })),
        fa: fa.map((f) => ({
          student_id: f.student_id,
          status: f.status,
          amount_due: num(f.amount_due),
          amount_paid: num(f.amount_paid),
        })),
        ps: ps.map((p) => ({
          student_id: p.student_id,
          relationship: p.relationship,
          profiles: p.profiles
            ? { full_name: p.profiles.full_name, email: p.profiles.email }
            : null,
        })),
      },
      assignments: {
        tc,
        tt: tt.map((t) => ({
          id: t.id,
          teacher_id: t.teacher_id,
          day_of_week: t.day_of_week,
          start_time: hhmm(t.start_time),
          end_time: hhmm(t.end_time),
          room: t.room,
          subjects: t.subjects ? { id: t.subjects.id, name: t.subjects.name } : null,
        })),
        profById,
      },
      schoolAvgBySubject,
    };
  }

  /** The caller's own weekly timetable — student sees their class, staff their teaching classes. */
  async myTimetable(actor: AuthUser) {
    let classIds: string[] = [];
    if (actor.roles.includes("student")) {
      const s = await this.prisma.students.findFirst({
        where: { profile_id: actor.id },
        select: { class_id: true },
      });
      if (s?.class_id) classIds = [s.class_id];
    } else {
      const tc = await this.prisma.teacher_classes.findMany({
        where: { teacher_id: actor.id },
        select: { class_id: true },
      });
      classIds = tc.map((t) => t.class_id);
    }
    if (classIds.length === 0) return [];
    return this.shapeTimetable(await this.timetableRows({ class_id: { in: classIds } }));
  }

  private timetableRows(where: any) {
    return this.prisma.timetable.findMany({
      where,
      orderBy: [{ day_of_week: "asc" }, { start_time: "asc" }],
      include: {
        subjects: { select: { name: true } },
        classes: { select: { name: true, section: true } },
      },
    });
  }
  private shapeTimetable(rows: any[]) {
    const hhmm = (d: Date | null) => (d ? d.toISOString().slice(11, 16) : null);
    return rows.map((t) => ({
      id: t.id,
      classId: t.class_id,
      className: t.classes ? `${t.classes.name} ${t.classes.section ?? ""}`.trim() : null,
      section: t.classes?.section ?? null,
      subjectId: t.subject_id,
      subjectName: t.subjects?.name ?? null,
      teacherId: t.teacher_id,
      dayOfWeek: t.day_of_week,
      startTime: hhmm(t.start_time),
      endTime: hhmm(t.end_time),
      room: t.room,
    }));
  }

  async listTimetable(_actor: AuthUser, classId?: string, teacherId?: string) {
    const rows = await this.prisma.timetable.findMany({
      where: {
        ...(classId ? { class_id: classId } : {}),
        ...(teacherId ? { teacher_id: teacherId } : {}),
      },
      orderBy: [{ day_of_week: "asc" }, { start_time: "asc" }],
      include: {
        subjects: { select: { name: true } },
        classes: { select: { name: true, section: true } },
      },
    });
    return rows.map((t) => ({
      id: t.id,
      classId: t.class_id,
      className: t.classes ? `${t.classes.name} ${t.classes.section ?? ""}`.trim() : null,
      subjectId: t.subject_id,
      subjectName: t.subjects?.name ?? null,
      teacherId: t.teacher_id,
      dayOfWeek: t.day_of_week,
      startTime: t.start_time,
      endTime: t.end_time,
      room: t.room,
    }));
  }

  // ── Academic command centre: live dashboard + data-integrity audit ──────────
  private requireAcademicAdmin(actor: AuthUser) {
    if (!actor.roles.some((r) => r === "admin" || r === "principal" || r === "coordinator"))
      throw new ForbiddenException();
  }

  /**
   * The "current" session — authoritative from academic_sessions.is_current.
   * Falls back to the academic_year with the most active students (then the
   * latest year string) when no session is flagged, so pre-migration data and
   * fresh imports still resolve sensibly.
   */
  private async currentYear(): Promise<string | null> {
    const flagged = await this.prisma.academic_sessions.findFirst({
      where: { is_current: true },
      select: { name: true },
    });
    if (flagged) return flagged.name;
    const byYear = await this.prisma.$queryRaw<{ academic_year: string; n: bigint }[]>`
      SELECT c.academic_year, COUNT(s.id)::bigint AS n
      FROM public.classes c
      LEFT JOIN public.students s ON s.class_id = c.id AND s.status = 'active'
      WHERE c.academic_year IS NOT NULL
      GROUP BY c.academic_year
      ORDER BY n DESC, c.academic_year DESC
      LIMIT 1`;
    if (byYear.length && Number(byYear[0].n) > 0) return byYear[0].academic_year;
    const rows = await this.prisma.classes.findMany({
      select: { academic_year: true },
      distinct: ["academic_year"],
    });
    const years = rows.map((r) => r.academic_year).filter(Boolean).sort();
    return years.length ? years[years.length - 1] : null;
  }

  private startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /**
   * One aggregation powering the Academic Management dashboard — every figure is
   * derived live from the real relationships (classes/sections/students/teachers/
   * subjects/timetable/attendance), scoped to a session (academic_year).
   */
  async academicDashboard(actor: AuthUser, year?: string) {
    this.requireAcademicAdmin(actor);
    const session = year && year !== "all" ? year : ((await this.currentYear()) ?? "");
    const classes = await this.prisma.classes.findMany({
      where: session ? { academic_year: session } : {},
      include: { _count: { select: { students: true, subjects: true, timetable: true } } },
      orderBy: [{ name: "asc" }, { section: "asc" }],
    });
    const classIds = classes.map((c) => c.id);

    const [
      sessionsRaw,
      activeStudents,
      unassignedStudents,
      totalTeachers,
      teacherIdRows,
      subjectCount,
      attnToday,
      teacherAttnToday,
      genderRows,
      teacherLoadRows,
      classTeacherProfiles,
    ] = await Promise.all([
      this.prisma.classes.groupBy({ by: ["academic_year"], _count: { _all: true } }),
      classIds.length
        ? this.prisma.students.count({ where: { class_id: { in: classIds }, status: "active" } })
        : Promise.resolve(0),
      this.prisma.students.count({ where: { class_id: null, status: "active" } }),
      this.prisma.teachers.count(),
      this.prisma.teacher_classes.findMany({
        where: classIds.length ? { class_id: { in: classIds } } : {},
        select: { teacher_id: true },
        distinct: ["teacher_id"],
      }),
      classIds.length
        ? this.prisma.subjects.count({ where: { class_id: { in: classIds }, is_active: true } })
        : Promise.resolve(0),
      this.prisma.attendance.groupBy({
        by: ["status"],
        where: { date: { gte: this.startOfToday() }, ...(classIds.length ? { class_id: { in: classIds } } : {}) },
        _count: { _all: true },
      }),
      this.prisma.teacher_attendance.groupBy({
        by: ["status"],
        where: { date: { gte: this.startOfToday() } },
        _count: { _all: true },
      }),
      classIds.length
        ? this.prisma.students.groupBy({
            by: ["gender"],
            where: { class_id: { in: classIds }, status: "active" },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      this.prisma.timetable.groupBy({
        by: ["teacher_id"],
        where: classIds.length ? { class_id: { in: classIds } } : {},
        _count: { _all: true },
      }),
      this.prisma.profiles.findMany({
        where: { id: { in: classes.map((c) => c.class_teacher_id).filter((x): x is string => !!x) } },
        select: { id: true, full_name: true },
      }),
    ]);

    const teacherName = new Map(classTeacherProfiles.map((p) => [p.id, p.full_name]));

    // Per class-section flags.
    const withoutClassTeacher = classes.filter((c) => !c.class_teacher_id);
    const withoutTimetable = classes.filter((c) => c._count.timetable === 0);
    const withoutSubjects = classes.filter((c) => c._count.subjects === 0);
    const timetableCompletion =
      classes.length > 0
        ? Math.round(((classes.length - withoutTimetable.length) / classes.length) * 100)
        : 0;

    // Attendance today (student).
    const attnTotal = attnToday.reduce((s, r) => s + r._count._all, 0);
    const attnPresent = attnToday
      .filter((r) => r.status === "present" || r.status === "late")
      .reduce((s, r) => s + r._count._all, 0);
    const teacherAttnTotal = teacherAttnToday.reduce((s, r) => s + r._count._all, 0);
    const teacherAttnPresent = teacherAttnToday
      .filter((r) => r.status === "present" || r.status === "late")
      .reduce((s, r) => s + r._count._all, 0);

    // Charts.
    const byClassName = new Map<string, number>();
    for (const c of classes)
      byClassName.set(c.name, (byClassName.get(c.name) ?? 0) + c._count.students);
    const studentsByClass = [...byClassName.entries()].map(([name, count]) => ({ name, count }));

    const genderRatio = genderRows.map((g) => ({
      gender: g.gender ?? "unknown",
      count: g._count._all,
    }));

    // Teacher workload — top teachers by weekly period count.
    const loadProfiles = await this.prisma.profiles.findMany({
      where: { id: { in: teacherLoadRows.map((t) => t.teacher_id).filter((x): x is string => !!x) } },
      select: { id: true, full_name: true },
    });
    const loadName = new Map(loadProfiles.map((p) => [p.id, p.full_name]));
    const teacherWorkload = teacherLoadRows
      .filter((t) => t.teacher_id)
      .map((t) => ({ name: loadName.get(t.teacher_id!) ?? "—", periods: t._count._all }))
      .sort((a, b) => b.periods - a.periods)
      .slice(0, 10);

    // Class & section overview grouped by class name.
    const overviewMap = new Map<
      string,
      { name: string; sections: string[]; inCharge: string | null; students: number }
    >();
    for (const c of classes) {
      const g = overviewMap.get(c.name) ?? { name: c.name, sections: [], inCharge: null, students: 0 };
      if (c.section) g.sections.push(c.section);
      g.students += c._count.students;
      if (!g.inCharge && c.class_teacher_id) g.inCharge = teacherName.get(c.class_teacher_id) ?? null;
      overviewMap.set(c.name, g);
    }
    const classSectionOverview = [...overviewMap.values()].map((g) => ({
      ...g,
      sections: g.sections.sort(),
    }));

    const teacherCount = Math.max(teacherIdRows.length, 0);
    return {
      session,
      sessions: sessionsRaw
        .map((s) => ({ year: s.academic_year, students: s._count._all }))
        .sort((a, b) => (a.year < b.year ? 1 : -1)),
      stats: {
        totalClasses: overviewMap.size,
        totalSections: classes.length,
        totalStudents: activeStudents,
        totalTeachers,
        studentTeacherRatio:
          totalTeachers > 0 ? Math.round((activeStudents / totalTeachers) * 10) / 10 : 0,
        activeSubjects: subjectCount,
        timetableCompletion,
        attendanceToday: { present: attnPresent, total: attnTotal },
        teacherAttendanceToday: { present: teacherAttnPresent, total: teacherAttnTotal },
        pendingTeacherAllocation: withoutClassTeacher.length,
        classesWithoutClassTeacher: withoutClassTeacher.length,
        classesWithoutTimetable: withoutTimetable.length,
        classesWithoutSubjects: withoutSubjects.length,
        unassignedStudents,
        studentsToPromote: activeStudents,
        assignedTeachers: teacherCount,
      },
      charts: { studentsByClass, genderRatio, teacherWorkload },
      classSectionOverview,
      alerts: {
        classesWithoutTimetable: withoutTimetable.map((c) =>
          `${c.name} ${c.section ?? ""}`.trim(),
        ),
        classesWithoutClassTeacher: withoutClassTeacher.map((c) =>
          `${c.name} ${c.section ?? ""}`.trim(),
        ),
      },
    };
  }

  /**
   * Data-integrity audit for the academic domain — surfaces the exact conditions
   * the acceptance criteria forbid (duplicate rolls, orphan/unassigned records,
   * timetable conflicts). Read-only; returns counts plus a sample of offenders.
   */
  async academicIntegrity(actor: AuthUser, year?: string) {
    this.requireAcademicAdmin(actor);
    const session = year && year !== "all" ? year : ((await this.currentYear()) ?? "");
    const classes = await this.prisma.classes.findMany({
      where: session ? { academic_year: session } : {},
      include: { _count: { select: { subjects: true, timetable: true } } },
    });
    const classIds = classes.map((c) => c.id);

    // Duplicate roll numbers within the same class.
    const dupRolls = classIds.length
      ? await this.prisma.$queryRaw<{ class_id: string; roll_no: string; n: bigint }[]>`
          SELECT class_id, roll_no, COUNT(*)::bigint AS n
          FROM public.students
          WHERE roll_no IS NOT NULL AND class_id = ANY(${classIds}::uuid[])
          GROUP BY class_id, roll_no
          HAVING COUNT(*) > 1
          ORDER BY n DESC
          LIMIT 25`
      : [];

    // Teacher double-booked: same teacher, same day, overlapping times.
    const teacherConflicts = classIds.length
      ? await this.prisma.$queryRaw<
          { teacher_id: string; day_of_week: number; a: string; b: string }[]
        >`
          SELECT t1.teacher_id, t1.day_of_week,
                 (t1.start_time || '-' || t1.end_time) AS a,
                 (t2.start_time || '-' || t2.end_time) AS b
          FROM public.timetable t1
          JOIN public.timetable t2
            ON t1.teacher_id = t2.teacher_id
           AND t1.day_of_week = t2.day_of_week
           AND t1.id < t2.id
           AND t1.start_time < t2.end_time
           AND t1.end_time > t2.start_time
          WHERE t1.teacher_id IS NOT NULL
            AND t1.class_id = ANY(${classIds}::uuid[])
          LIMIT 25`
      : [];

    // Room double-booked: same non-null room, same day, overlapping times.
    const roomConflicts = classIds.length
      ? await this.prisma.$queryRaw<{ room: string; day_of_week: number }[]>`
          SELECT t1.room, t1.day_of_week
          FROM public.timetable t1
          JOIN public.timetable t2
            ON t1.room = t2.room
           AND t1.day_of_week = t2.day_of_week
           AND t1.id < t2.id
           AND t1.start_time < t2.end_time
           AND t1.end_time > t2.start_time
          WHERE t1.room IS NOT NULL AND t1.room <> ''
            AND t1.class_id = ANY(${classIds}::uuid[])
          LIMIT 25`
      : [];

    // Class double-booked: same class in two places at once.
    const classConflicts = classIds.length
      ? await this.prisma.$queryRaw<{ class_id: string; day_of_week: number }[]>`
          SELECT t1.class_id, t1.day_of_week
          FROM public.timetable t1
          JOIN public.timetable t2
            ON t1.class_id = t2.class_id
           AND t1.day_of_week = t2.day_of_week
           AND t1.id < t2.id
           AND t1.start_time < t2.end_time
           AND t1.end_time > t2.start_time
          WHERE t1.class_id = ANY(${classIds}::uuid[])
          LIMIT 25`
      : [];

    const studentsWithoutClass = await this.prisma.students.count({
      where: { class_id: null, status: "active" },
    });
    const classesWithoutSubjects = classes.filter((c) => c._count.subjects === 0);
    const classesWithoutTimetable = classes.filter((c) => c._count.timetable === 0);

    const checks = [
      {
        key: "duplicate_rolls",
        label: "Duplicate roll numbers within a class",
        count: dupRolls.length,
        ok: dupRolls.length === 0,
        samples: dupRolls.map((d) => `roll ${d.roll_no} ×${Number(d.n)}`),
      },
      {
        key: "students_without_class",
        label: "Active students not assigned to a class",
        count: studentsWithoutClass,
        ok: studentsWithoutClass === 0,
        samples: [],
      },
      {
        key: "teacher_conflicts",
        label: "Teacher double-booked in the timetable",
        count: teacherConflicts.length,
        ok: teacherConflicts.length === 0,
        samples: teacherConflicts.slice(0, 10).map((c) => `day ${c.day_of_week}: ${c.a} vs ${c.b}`),
      },
      {
        key: "room_conflicts",
        label: "Room double-booked in the timetable",
        count: roomConflicts.length,
        ok: roomConflicts.length === 0,
        samples: roomConflicts.slice(0, 10).map((c) => `${c.room} (day ${c.day_of_week})`),
      },
      {
        key: "class_conflicts",
        label: "Class scheduled in two places at once",
        count: classConflicts.length,
        ok: classConflicts.length === 0,
        samples: [],
      },
      {
        key: "classes_without_subjects",
        label: "Class-sections with no subjects",
        count: classesWithoutSubjects.length,
        ok: classesWithoutSubjects.length === 0,
        samples: classesWithoutSubjects.slice(0, 10).map((c) => `${c.name} ${c.section ?? ""}`.trim()),
      },
      {
        key: "classes_without_timetable",
        label: "Class-sections with no timetable",
        count: classesWithoutTimetable.length,
        ok: classesWithoutTimetable.length === 0,
        samples: classesWithoutTimetable.slice(0, 10).map((c) => `${c.name} ${c.section ?? ""}`.trim()),
      },
    ];

    return {
      session,
      healthy: checks.every((c) => c.ok),
      issueCount: checks.filter((c) => !c.ok).length,
      checks,
    };
  }

  // ── Academic sessions ───────────────────────────────────────────────────────

  /** All sessions with live enrolled-student counts (via classes.academic_year). */
  async listSessions(actor: AuthUser) {
    this.requireAcademicAdmin(actor);
    const [sessions, counts] = await Promise.all([
      this.prisma.academic_sessions.findMany({ orderBy: { name: "desc" } }),
      this.prisma.$queryRaw<{ academic_year: string; students: bigint; sections: bigint }[]>`
        SELECT c.academic_year,
               COUNT(DISTINCT s.id)::bigint AS students,
               COUNT(DISTINCT c.id)::bigint AS sections
        FROM public.classes c
        LEFT JOIN public.students s ON s.class_id = c.id AND s.status = 'active'
        WHERE c.academic_year IS NOT NULL
        GROUP BY c.academic_year`,
    ]);
    const byYear = new Map(
      counts.map((c) => [c.academic_year, { students: Number(c.students), sections: Number(c.sections) }]),
    );
    return sessions.map((s) => ({
      ...s,
      students: byYear.get(s.name)?.students ?? 0,
      sections: byYear.get(s.name)?.sections ?? 0,
    }));
  }

  async createSession(
    actor: AuthUser,
    input: {
      name: string;
      start_date?: string | null;
      end_date?: string | null;
      status?: string;
      board?: string | null;
      curriculum?: string | null;
    },
  ) {
    this.requireAcademicAdmin(actor);
    try {
      const row = await this.prisma.academic_sessions.create({
        data: {
          name: input.name,
          start_date: input.start_date ? new Date(input.start_date) : null,
          end_date: input.end_date ? new Date(input.end_date) : null,
          status: input.status || "upcoming",
          board: input.board || null,
          curriculum: input.curriculum || null,
        },
      });
      return { id: row.id };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
        throw new ConflictException("A session with that name already exists.");
      throw e;
    }
  }

  async updateSession(
    actor: AuthUser,
    id: string,
    input: {
      name?: string;
      start_date?: string | null;
      end_date?: string | null;
      status?: string;
      board?: string | null;
      curriculum?: string | null;
      promotion_locked?: boolean;
    },
  ) {
    this.requireAcademicAdmin(actor);
    const existing = await this.prisma.academic_sessions.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Session not found");
    try {
      await this.prisma.academic_sessions.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.start_date !== undefined
            ? { start_date: input.start_date ? new Date(input.start_date) : null }
            : {}),
          ...(input.end_date !== undefined
            ? { end_date: input.end_date ? new Date(input.end_date) : null }
            : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.board !== undefined ? { board: input.board || null } : {}),
          ...(input.curriculum !== undefined ? { curriculum: input.curriculum || null } : {}),
          ...(input.promotion_locked !== undefined
            ? { promotion_locked: input.promotion_locked }
            : {}),
          updated_at: new Date(),
        },
      });
      return { ok: true };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
        throw new ConflictException("A session with that name already exists.");
      throw e;
    }
  }

  /** Flip which session is current — exactly one row keeps is_current. */
  async setCurrentSession(actor: AuthUser, id: string) {
    this.requireAcademicAdmin(actor);
    const target = await this.prisma.academic_sessions.findUnique({ where: { id } });
    if (!target) throw new NotFoundException("Session not found");
    if (target.status === "archived")
      throw new BadRequestException("Archived sessions cannot be made current.");
    await this.prisma.$transaction([
      this.prisma.academic_sessions.updateMany({
        where: { is_current: true },
        data: { is_current: false, updated_at: new Date() },
      }),
      this.prisma.academic_sessions.update({
        where: { id },
        data: { is_current: true, status: "active", updated_at: new Date() },
      }),
    ]);
    return { ok: true };
  }

  async setSessionStatus(actor: AuthUser, id: string, status: string) {
    this.requireAcademicAdmin(actor);
    if (!["active", "upcoming", "archived", "locked"].includes(status))
      throw new BadRequestException("Invalid session status");
    const existing = await this.prisma.academic_sessions.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Session not found");
    if (status === "archived" && existing.is_current)
      throw new BadRequestException("The current session cannot be archived. Set another current first.");
    await this.prisma.academic_sessions.update({
      where: { id },
      data: { status, updated_at: new Date() },
    });
    return { ok: true };
  }

  /**
   * Clone a session into a new academic year — copies the session's board/
   * curriculum and replicates its class-sections (name/section/capacity/room,
   * no students) so the new year is ready for enrolment. Additive: refuses if
   * the target already has classes.
   */
  async cloneSession(actor: AuthUser, id: string, newName: string) {
    this.requireAcademicAdmin(actor);
    const source = await this.prisma.academic_sessions.findUnique({ where: { id } });
    if (!source) throw new NotFoundException("Session not found");
    const existingTarget = await this.prisma.academic_sessions.findUnique({
      where: { name: newName },
    });
    if (existingTarget) throw new ConflictException("A session with that name already exists.");
    const targetHasClasses = await this.prisma.classes.count({
      where: { academic_year: newName },
    });
    if (targetHasClasses > 0)
      throw new ConflictException("The target year already has classes; clone aborted.");

    const sourceClasses = await this.prisma.classes.findMany({
      where: { academic_year: source.name },
      select: { name: true, section: true, capacity: true, room: true, class_teacher_id: true },
    });
    const created = await this.prisma.$transaction(async (tx) => {
      const session = await tx.academic_sessions.create({
        data: {
          name: newName,
          status: "upcoming",
          board: source.board,
          curriculum: source.curriculum,
        },
      });
      if (sourceClasses.length) {
        await tx.classes.createMany({
          data: sourceClasses.map((c) => ({
            name: c.name,
            section: c.section,
            academic_year: newName,
            capacity: c.capacity,
            room: c.room,
            class_teacher_id: c.class_teacher_id,
          })),
        });
      }
      return session;
    });
    return { id: created.id, clonedClasses: sourceClasses.length };
  }

  // ── Classrooms / rooms ──────────────────────────────────────────────────────

  /** Rooms with live utilisation (class-sections + weekly timetable slots using the room). */
  async listRooms(actor: AuthUser) {
    this.requireAcademicAdmin(actor);
    const [rooms, classUse, slotUse] = await Promise.all([
      this.prisma.classrooms.findMany({ orderBy: { room_number: "asc" } }),
      this.prisma.classes.groupBy({
        by: ["room"],
        where: { room: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.timetable.groupBy({
        by: ["room"],
        where: { room: { not: null } },
        _count: { _all: true },
      }),
    ]);
    const classByRoom = new Map(classUse.map((c) => [c.room, c._count._all]));
    const slotByRoom = new Map(slotUse.map((c) => [c.room, c._count._all]));
    return rooms.map((r) => ({
      ...r,
      assignedClasses: classByRoom.get(r.room_number) ?? 0,
      weeklySlots: slotByRoom.get(r.room_number) ?? 0,
    }));
  }

  private mapRoomInput(input: RoomInput) {
    return {
      room_number: input.room_number,
      name: input.name || null,
      capacity: input.capacity ?? 40,
      floor: input.floor || null,
      building: input.building || null,
      room_type: input.room_type || "classroom",
      is_smart: input.is_smart ?? false,
      has_projector: input.has_projector ?? false,
    };
  }

  async createRoom(actor: AuthUser, input: RoomInput) {
    this.requireAcademicAdmin(actor);
    try {
      const row = await this.prisma.classrooms.create({ data: this.mapRoomInput(input) });
      return { id: row.id };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
        throw new ConflictException("A room with that number already exists.");
      throw e;
    }
  }

  async updateRoom(actor: AuthUser, id: string, input: RoomInput) {
    this.requireAcademicAdmin(actor);
    const existing = await this.prisma.classrooms.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Room not found");
    try {
      await this.prisma.classrooms.update({
        where: { id },
        data: {
          ...this.mapRoomInput(input),
          ...(input.is_active !== undefined ? { is_active: input.is_active } : {}),
          updated_at: new Date(),
        },
      });
      return { ok: true };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
        throw new ConflictException("A room with that number already exists.");
      throw e;
    }
  }

  /** Delete a room. Refused while it is still referenced by classes or timetable. */
  async deleteRoom(actor: AuthUser, id: string) {
    this.requireAcademicAdmin(actor);
    const room = await this.prisma.classrooms.findUnique({ where: { id } });
    if (!room) throw new NotFoundException("Room not found");
    const [inClasses, inSlots] = await Promise.all([
      this.prisma.classes.count({ where: { room: room.room_number } }),
      this.prisma.timetable.count({ where: { room: room.room_number } }),
    ]);
    if (inClasses + inSlots > 0)
      throw new ConflictException(
        "This room is still assigned to classes or timetable slots; disable it instead.",
      );
    await this.prisma.classrooms.delete({ where: { id } });
    return { ok: true };
  }

  // ── Elective offerings + enrolment (seats + waitlist) ───────────────────────

  async listElectiveOfferings(actor: AuthUser, session?: string) {
    this.requireAcademicAdmin(actor);
    const where = session && session !== "all" ? { session } : {};
    const [offerings, counts] = await Promise.all([
      this.prisma.elective_offerings.findMany({ where, orderBy: { name: "asc" } }),
      this.prisma.elective_enrollments.groupBy({ by: ["offering_id", "status"], _count: { _all: true } }),
    ]);
    const byOffering = new Map<string, { enrolled: number; waitlisted: number }>();
    for (const c of counts) {
      const cur = byOffering.get(c.offering_id) ?? { enrolled: 0, waitlisted: 0 };
      if (c.status === "enrolled") cur.enrolled += c._count._all;
      if (c.status === "waitlisted") cur.waitlisted += c._count._all;
      byOffering.set(c.offering_id, cur);
    }
    return offerings.map((o) => {
      const c = byOffering.get(o.id) ?? { enrolled: 0, waitlisted: 0 };
      return {
        ...o,
        enrolled: c.enrolled,
        waitlisted: c.waitlisted,
        seatsLeft: Math.max(0, o.seat_capacity - c.enrolled),
      };
    });
  }

  async createElectiveOffering(actor: AuthUser, input: ElectiveOfferingInput) {
    this.requireAcademicAdmin(actor);
    if (input.subject_id) {
      const s = await this.prisma.subjects.findUnique({ where: { id: input.subject_id } });
      if (!s) throw new NotFoundException("Subject not found");
    }
    const row = await this.prisma.elective_offerings.create({
      data: {
        name: input.name,
        code: input.code || null,
        description: input.description || null,
        session: input.session || (await this.currentYear()),
        grade_level: input.grade_level || null,
        seat_capacity: input.seat_capacity ?? 30,
        subject_id: input.subject_id || null,
      },
    });
    return { id: row.id };
  }

  async updateElectiveOffering(actor: AuthUser, id: string, input: ElectiveOfferingInput) {
    this.requireAcademicAdmin(actor);
    const existing = await this.prisma.elective_offerings.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Elective not found");
    await this.prisma.elective_offerings.update({
      where: { id },
      data: {
        name: input.name,
        code: input.code || null,
        description: input.description || null,
        session: input.session || existing.session,
        grade_level: input.grade_level || null,
        seat_capacity: input.seat_capacity ?? existing.seat_capacity,
        subject_id: input.subject_id || null,
        ...(input.is_active !== undefined ? { is_active: input.is_active } : {}),
        updated_at: new Date(),
      },
    });
    return { ok: true };
  }

  async deleteElectiveOffering(actor: AuthUser, id: string) {
    this.requireAcademicAdmin(actor);
    const existing = await this.prisma.elective_offerings.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Elective not found");
    await this.prisma.elective_offerings.delete({ where: { id } }); // cascades enrolments
    return { ok: true };
  }

  async listElectiveEnrollments(actor: AuthUser, offeringId: string) {
    this.requireAcademicAdmin(actor);
    const rows = await this.prisma.elective_enrollments.findMany({
      where: { offering_id: offeringId },
      orderBy: { enrolled_at: "asc" },
    });
    const students = await this.prisma.students.findMany({
      where: { id: { in: rows.map((r) => r.student_id) } },
      select: { id: true, admission_no: true, roll_no: true, profiles: { select: { full_name: true } } },
    });
    const sn = new Map(students.map((s) => [s.id, s]));
    return rows.map((r) => {
      const s = sn.get(r.student_id);
      return {
        id: r.id,
        studentId: r.student_id,
        studentName: s?.profiles?.full_name ?? "—",
        admissionNo: s?.admission_no ?? null,
        rollNo: s?.roll_no ?? null,
        status: r.status,
        enrolledAt: r.enrolled_at,
      };
    });
  }

  /** Enrol a student — takes a seat if available, else joins the waitlist. */
  async enrollElective(actor: AuthUser, offeringId: string, studentId: string) {
    this.requireAcademicAdmin(actor);
    const offering = await this.prisma.elective_offerings.findUnique({ where: { id: offeringId } });
    if (!offering) throw new NotFoundException("Elective not found");
    const student = await this.prisma.students.findUnique({ where: { id: studentId } });
    if (!student) throw new NotFoundException("Student not found");
    const existing = await this.prisma.elective_enrollments.findUnique({
      where: { offering_id_student_id: { offering_id: offeringId, student_id: studentId } },
    });
    if (existing && existing.status !== "dropped")
      throw new ConflictException("That student is already enrolled or waitlisted.");
    const enrolledCount = await this.prisma.elective_enrollments.count({
      where: { offering_id: offeringId, status: "enrolled" },
    });
    const status = enrolledCount < offering.seat_capacity ? "enrolled" : "waitlisted";
    if (existing) {
      await this.prisma.elective_enrollments.update({
        where: { id: existing.id },
        data: { status, enrolled_at: new Date() },
      });
    } else {
      await this.prisma.elective_enrollments.create({
        data: { offering_id: offeringId, student_id: studentId, status },
      });
    }
    return { ok: true, status };
  }

  /** Drop an enrolment; if it freed a seat, auto-promote the oldest waitlisted student. */
  async dropElective(actor: AuthUser, enrollmentId: string) {
    this.requireAcademicAdmin(actor);
    const enrollment = await this.prisma.elective_enrollments.findUnique({ where: { id: enrollmentId } });
    if (!enrollment) throw new NotFoundException("Enrolment not found");
    const wasEnrolled = enrollment.status === "enrolled";
    await this.prisma.elective_enrollments.delete({ where: { id: enrollmentId } });
    let promoted: string | null = null;
    if (wasEnrolled) {
      const next = await this.prisma.elective_enrollments.findFirst({
        where: { offering_id: enrollment.offering_id, status: "waitlisted" },
        orderBy: { enrolled_at: "asc" },
      });
      if (next) {
        await this.prisma.elective_enrollments.update({
          where: { id: next.id },
          data: { status: "enrolled" },
        });
        promoted = next.student_id;
      }
    }
    return { ok: true, promoted };
  }

  // ── Timetable builder + conflict detection ──────────────────────────────────

  /**
   * Find scheduling conflicts for a proposed slot: same day + overlapping time
   * where the teacher, the room, or the class is already booked. Excludes the
   * row being edited. Returns a per-type conflict summary with samples.
   */
  private async findTimetableConflicts(
    input: { day_of_week: number; start_time: string; end_time: string; teacher_id?: string | null; room?: string | null; class_id: string },
    excludeId?: string,
  ) {
    const teacher = input.teacher_id ?? null;
    const room = input.room && input.room.trim() ? input.room : null;
    const exclude = excludeId ?? null;
    const rows = await this.prisma.$queryRaw<
      { id: string; kind: string; label: string }[]
    >`
      SELECT t.id,
             CASE
               WHEN ${teacher}::uuid IS NOT NULL AND t.teacher_id = ${teacher}::uuid THEN 'teacher'
               WHEN ${room}::text IS NOT NULL AND t.room = ${room}::text THEN 'room'
               ELSE 'class'
             END AS kind,
             (c.name || ' ' || COALESCE(c.section, '') || ' · ' ||
              to_char(t.start_time, 'HH24:MI') || '-' || to_char(t.end_time, 'HH24:MI')) AS label
      FROM public.timetable t
      JOIN public.classes c ON c.id = t.class_id
      WHERE t.day_of_week = ${input.day_of_week}
        AND t.start_time < ${input.end_time}::time
        AND t.end_time > ${input.start_time}::time
        AND (${exclude}::uuid IS NULL OR t.id <> ${exclude}::uuid)
        AND (
          (${teacher}::uuid IS NOT NULL AND t.teacher_id = ${teacher}::uuid)
          OR (${room}::text IS NOT NULL AND t.room = ${room}::text)
          OR t.class_id = ${input.class_id}::uuid
        )`;
    const byKind = { teacher: [] as string[], room: [] as string[], class: [] as string[] };
    for (const r of rows) (byKind as any)[r.kind].push(r.label);
    return byKind;
  }

  async checkTimetableConflicts(actor: AuthUser, input: TimetableSlotInput, excludeId?: string) {
    this.requireAcademicAdmin(actor);
    const c = await this.findTimetableConflicts(input, excludeId);
    return {
      hasConflict: c.teacher.length + c.room.length + c.class.length > 0,
      conflicts: c,
    };
  }

  private conflictMessage(c: { teacher: string[]; room: string[]; class: string[] }) {
    const parts: string[] = [];
    if (c.teacher.length) parts.push(`Teacher busy (${c.teacher[0]})`);
    if (c.room.length) parts.push(`Room busy (${c.room[0]})`);
    if (c.class.length) parts.push(`Class busy (${c.class[0]})`);
    return parts.join("; ");
  }

  private async validateSlot(input: TimetableSlotInput) {
    if (input.day_of_week < 0 || input.day_of_week > 6)
      throw new BadRequestException("day_of_week must be 0–6");
    if (!(input.start_time < input.end_time))
      throw new BadRequestException("End time must be after start time");
    const cls = await this.prisma.classes.findUnique({ where: { id: input.class_id } });
    if (!cls) throw new NotFoundException("Class not found");
    if (input.subject_id) {
      const s = await this.prisma.subjects.findUnique({ where: { id: input.subject_id } });
      if (!s) throw new NotFoundException("Subject not found");
      if (s.class_id !== input.class_id)
        throw new BadRequestException("That subject does not belong to the class.");
    }
    if (input.teacher_id) {
      const t = await this.prisma.profiles.findUnique({ where: { id: input.teacher_id } });
      if (!t) throw new NotFoundException("Teacher not found");
    }
  }

  async createTimetableSlot(actor: AuthUser, input: TimetableSlotInput) {
    this.requireAcademicAdmin(actor);
    await this.validateSlot(input);
    const conflicts = await this.findTimetableConflicts(input);
    if (conflicts.teacher.length + conflicts.room.length + conflicts.class.length > 0)
      throw new ConflictException(this.conflictMessage(conflicts));
    const row = await this.prisma.timetable.create({
      data: {
        class_id: input.class_id,
        subject_id: input.subject_id || null,
        teacher_id: input.teacher_id || null,
        day_of_week: input.day_of_week,
        start_time: new Date(`1970-01-01T${input.start_time}:00Z`),
        end_time: new Date(`1970-01-01T${input.end_time}:00Z`),
        room: input.room || null,
      },
    });
    return { id: row.id };
  }

  async updateTimetableSlot(actor: AuthUser, id: string, input: TimetableSlotInput) {
    this.requireAcademicAdmin(actor);
    const existing = await this.prisma.timetable.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Slot not found");
    await this.validateSlot(input);
    const conflicts = await this.findTimetableConflicts(input, id);
    if (conflicts.teacher.length + conflicts.room.length + conflicts.class.length > 0)
      throw new ConflictException(this.conflictMessage(conflicts));
    await this.prisma.timetable.update({
      where: { id },
      data: {
        class_id: input.class_id,
        subject_id: input.subject_id || null,
        teacher_id: input.teacher_id || null,
        day_of_week: input.day_of_week,
        start_time: new Date(`1970-01-01T${input.start_time}:00Z`),
        end_time: new Date(`1970-01-01T${input.end_time}:00Z`),
        room: input.room || null,
      },
    });
    return { ok: true };
  }

  async deleteTimetableSlot(actor: AuthUser, id: string) {
    this.requireAcademicAdmin(actor);
    const existing = await this.prisma.timetable.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Slot not found");
    await this.prisma.timetable.delete({ where: { id } });
    return { ok: true };
  }

  // ── Teacher ↔ subject assignment & workload ─────────────────────────────────

  /** Assignments for a class (or teacher), with teacher / subject / class names. */
  async listTeacherSubjects(actor: AuthUser, classId?: string, teacherId?: string) {
    this.requireAcademicAdmin(actor);
    const rows = await this.prisma.teacher_subjects.findMany({
      where: { ...(classId ? { class_id: classId } : {}), ...(teacherId ? { teacher_id: teacherId } : {}) },
      orderBy: { created_at: "asc" },
    });
    const [teachers, subjects, classes] = await Promise.all([
      this.prisma.profiles.findMany({
        where: { id: { in: [...new Set(rows.map((r) => r.teacher_id))] } },
        select: { id: true, full_name: true },
      }),
      this.prisma.subjects.findMany({
        where: { id: { in: [...new Set(rows.map((r) => r.subject_id))] } },
        select: { id: true, name: true, code: true, weekly_periods: true },
      }),
      this.prisma.classes.findMany({
        where: { id: { in: [...new Set(rows.map((r) => r.class_id))] } },
        select: { id: true, name: true, section: true },
      }),
    ]);
    const tn = new Map(teachers.map((t) => [t.id, t.full_name]));
    const sn = new Map(subjects.map((s) => [s.id, s]));
    const cn = new Map(classes.map((c) => [c.id, c]));
    return rows.map((r) => {
      const c = cn.get(r.class_id);
      const s = sn.get(r.subject_id);
      return {
        id: r.id,
        teacherId: r.teacher_id,
        teacherName: tn.get(r.teacher_id) ?? "—",
        classId: r.class_id,
        className: c ? `${c.name} ${c.section ?? ""}`.trim() : "—",
        subjectId: r.subject_id,
        subjectName: s?.name ?? "—",
        subjectCode: s?.code ?? null,
        weeklyPeriods: s?.weekly_periods ?? 0,
        role: r.role,
      };
    });
  }

  async assignTeacherSubject(
    actor: AuthUser,
    input: { teacher_id: string; class_id: string; subject_id: string; role?: string },
  ) {
    this.requireAcademicAdmin(actor);
    const subject = await this.prisma.subjects.findUnique({ where: { id: input.subject_id } });
    if (!subject) throw new NotFoundException("Subject not found");
    if (subject.class_id !== input.class_id)
      throw new BadRequestException("That subject does not belong to the selected class.");
    const teacher = await this.prisma.profiles.findUnique({ where: { id: input.teacher_id } });
    if (!teacher) throw new NotFoundException("Teacher not found");
    try {
      const row = await this.prisma.teacher_subjects.create({
        data: {
          teacher_id: input.teacher_id,
          class_id: input.class_id,
          subject_id: input.subject_id,
          role: input.role || "subject_teacher",
        },
      });
      return { id: row.id };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
        throw new ConflictException("That teacher is already assigned to this subject.");
      throw e;
    }
  }

  async unassignTeacherSubject(actor: AuthUser, id: string) {
    this.requireAcademicAdmin(actor);
    const existing = await this.prisma.teacher_subjects.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Assignment not found");
    await this.prisma.teacher_subjects.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * Per-teacher workload for a session: subject-assignment count, planned weekly
   * periods (sum of assigned subjects' weekly_periods), scheduled timetable slots,
   * and remaining capacity against a soft weekly cap.
   */
  async teacherWorkload(actor: AuthUser, year?: string) {
    this.requireAcademicAdmin(actor);
    const WEEKLY_CAP = 40;
    const session = year && year !== "all" ? year : ((await this.currentYear()) ?? "");
    const classes = await this.prisma.classes.findMany({
      where: session ? { academic_year: session } : {},
      select: { id: true },
    });
    const classIds = classes.map((c) => c.id);
    if (!classIds.length) return { session, cap: WEEKLY_CAP, teachers: [] };

    const [assignments, subjects, slots] = await Promise.all([
      this.prisma.teacher_subjects.findMany({ where: { class_id: { in: classIds } } }),
      this.prisma.subjects.findMany({
        where: { class_id: { in: classIds } },
        select: { id: true, weekly_periods: true },
      }),
      this.prisma.timetable.groupBy({
        by: ["teacher_id"],
        where: { class_id: { in: classIds }, teacher_id: { not: null } },
        _count: { _all: true },
      }),
    ]);
    const periodsBySubject = new Map(subjects.map((s) => [s.id, s.weekly_periods]));
    const slotsByTeacher = new Map(slots.map((s) => [s.teacher_id, s._count._all]));

    const byTeacher = new Map<string, { assignments: number; plannedPeriods: number }>();
    for (const a of assignments) {
      const cur = byTeacher.get(a.teacher_id) ?? { assignments: 0, plannedPeriods: 0 };
      cur.assignments += 1;
      cur.plannedPeriods += periodsBySubject.get(a.subject_id) ?? 0;
      byTeacher.set(a.teacher_id, cur);
    }
    // include teachers who only appear in the timetable
    for (const [tid] of slotsByTeacher) if (tid && !byTeacher.has(tid)) byTeacher.set(tid, { assignments: 0, plannedPeriods: 0 });

    const ids = [...byTeacher.keys()];
    const profs = await this.prisma.profiles.findMany({
      where: { id: { in: ids } },
      select: { id: true, full_name: true },
    });
    const name = new Map(profs.map((p) => [p.id, p.full_name]));
    return {
      session,
      cap: WEEKLY_CAP,
      teachers: ids
        .map((id) => {
          const w = byTeacher.get(id)!;
          const scheduled = slotsByTeacher.get(id) ?? 0;
          return {
            teacherId: id,
            teacherName: name.get(id) ?? "—",
            assignments: w.assignments,
            plannedPeriods: w.plannedPeriods,
            scheduledPeriods: scheduled,
            remaining: Math.max(0, WEEKLY_CAP - scheduled),
            overloaded: scheduled > WEEKLY_CAP,
          };
        })
        .sort((a, b) => b.scheduledPeriods - a.scheduledPeriods),
    };
  }
}
