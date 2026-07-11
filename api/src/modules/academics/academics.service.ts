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
