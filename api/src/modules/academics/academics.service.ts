import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../infra/database/prisma.service";
import type { AuthUser } from "../../common/decorators/current-user.decorator";

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
    });
    return rows.map((s) => ({ id: s.id, classId: s.class_id, name: s.name, code: s.code }));
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
}
