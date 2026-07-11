import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../../infra/database/prisma.service";
import type { AuthUser } from "../../common/decorators/current-user.decorator";

/**
 * Progress notes hub (admin + teacher).
 * RLS (api/db/rls-policies-extracted.csv):
 *   progress_notes: pn_admin_all (admin ALL); pn_teacher_own (teacher ALL where
 *     teacher_id = auth.uid()); pn_parent_read (parent reads children's).
 * The hub is an admin/teacher tool: admin sees every note, a teacher their own.
 */
@Injectable()
export class ProgressService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private requireStaff(actor: AuthUser) {
    if (!actor.roles.includes("admin") && !actor.roles.includes("teacher"))
      throw new ForbiddenException();
  }

  /** Students the caller can note on — admin: all; teacher: their classes' students. */
  async students(actor: AuthUser) {
    this.requireStaff(actor);
    let where = {};
    if (!actor.roles.includes("admin")) {
      const tc = await this.prisma.teacher_classes.findMany({
        where: { teacher_id: actor.id },
        select: { class_id: true },
      });
      const classIds = tc.map((t) => t.class_id);
      if (classIds.length === 0) return [];
      where = { class_id: { in: classIds } };
    }
    const rows = await this.prisma.students.findMany({
      where,
      orderBy: { admission_no: "asc" },
      take: 2000,
      select: {
        id: true,
        admission_no: true,
        roll_no: true,
        profiles: { select: { full_name: true } },
        classes: { select: { name: true, section: true } },
      },
    });
    return rows.map((s) => ({
      id: s.id,
      admission_no: s.admission_no,
      roll_no: s.roll_no,
      full_name: s.profiles?.full_name ?? null,
      className: s.classes
        ? `${s.classes.name}${s.classes.section ? ` ${s.classes.section}` : ""}`
        : null,
    }));
  }

  /** Recent progress notes — admin: all; teacher: own. */
  async notes(actor: AuthUser) {
    this.requireStaff(actor);
    const where = actor.roles.includes("admin") ? {} : { teacher_id: actor.id };
    const rows = await this.prisma.progress_notes.findMany({
      where,
      orderBy: { note_date: "desc" },
      take: 50,
      include: {
        students: { select: { admission_no: true, profiles: { select: { full_name: true } } } },
      },
    });
    return rows.map((n) => ({
      id: n.id,
      student_id: n.student_id,
      note: n.note,
      tone: n.tone,
      note_date: n.note_date ? n.note_date.toISOString().slice(0, 10) : null,
      student_name: n.students?.profiles?.full_name ?? null,
      admission_no: n.students?.admission_no ?? null,
    }));
  }

  async addNote(actor: AuthUser, input: { student_id: string; note: string; tone?: string }) {
    this.requireStaff(actor);
    if (!input.student_id) throw new ForbiddenException("Pick a student.");
    if (!input.note?.trim()) throw new ForbiddenException("A note is required.");
    const row = await this.prisma.progress_notes.create({
      data: {
        student_id: input.student_id,
        teacher_id: actor.id, // pn_teacher_own requires teacher_id = auth.uid()
        note: input.note,
        tone: input.tone || "neutral",
      },
    });
    return { id: row.id };
  }
}
