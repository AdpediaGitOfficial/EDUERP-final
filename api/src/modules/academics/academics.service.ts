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

  // ── Academic command centre: live dashboard + data-integrity audit ──────────
  private requireAcademicAdmin(actor: AuthUser) {
    if (!actor.roles.some((r) => r === "admin" || r === "principal" || r === "coordinator"))
      throw new ForbiddenException();
  }

  /**
   * The "current" session. There is no sessions entity yet (Phase 2), so we resolve
   * it as the academic_year whose classes hold the most active students — the live
   * session in practice — falling back to the latest year string when none enrol.
   */
  private async currentYear(): Promise<string | null> {
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
        ? this.prisma.subjects.count({ where: { class_id: { in: classIds } } })
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
}
