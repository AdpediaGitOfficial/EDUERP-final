import { Inject, Injectable, NotFoundException } from "@nestjs/common";
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

  async listClasses(_actor: AuthUser) {
    const rows = await this.prisma.classes.findMany({
      orderBy: [{ name: "asc" }, { section: "asc" }],
      include: { _count: { select: { students: true } } },
    });
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      section: c.section,
      academicYear: c.academic_year,
      studentCount: c._count.students,
    }));
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
