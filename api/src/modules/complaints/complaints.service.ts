import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../infra/database/prisma.service";
import type { AuthUser } from "../../common/decorators/current-user.decorator";

/**
 * RLS translation (api/db/rls-policies-extracted.csv):
 *   complaints: c_admin_all -> admin; c_teacher_own -> raiser sees their own
 *               (qual is raised_by = uid — applies to ANY raiser role, not just
 *               teachers, matching how the app files parent complaints too);
 *               c_parent_read -> parent sees complaints about their children
 *   complaint_messages: cm_admin_all; cm_read -> raiser-or-admin via parent complaint
 */
@Injectable()
export class ComplaintsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private scope(actor: AuthUser): Prisma.complaintsWhereInput | null {
    if (actor.roles.includes("admin")) return {};
    const or: Prisma.complaintsWhereInput[] = [{ raised_by: actor.id }];
    if (actor.roles.includes("parent")) {
      or.push({ students: { parent_student: { some: { parent_id: actor.id } } } });
    }
    return { OR: or };
  }

  async list(actor: AuthUser, page = 1, pageSize = 50, status?: string) {
    const scope = this.scope(actor);
    if (scope === null) return { total: 0, page, pageSize, rows: [] };
    const where: Prisma.complaintsWhereInput = {
      AND: [scope, status ? { status } : {}],
    };
    const [total, rows] = await Promise.all([
      this.prisma.complaints.count({ where }),
      this.prisma.complaints.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          students: {
            select: { admission_no: true, profiles: { select: { full_name: true } } },
          },
        },
      }),
    ]);
    return {
      total,
      page,
      pageSize,
      rows: rows.map((c) => ({
        id: c.id,
        subject: c.subject,
        body: c.body,
        severity: c.severity,
        status: c.status,
        studentId: c.student_id,
        studentName: c.students?.profiles?.full_name ?? null,
        admissionNo: c.students?.admission_no ?? null,
        raisedBy: c.raised_by,
        escalatedToAdmin: c.escalated_to_admin,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      })),
    };
  }

  async create(
    actor: AuthUser,
    data: { studentId: string; subject: string; body: string; severity?: string },
  ) {
    // Raising a complaint = an insert with raised_by = self (c_teacher_own WITH CHECK).
    const row = await this.prisma.complaints.create({
      data: {
        student_id: data.studentId,
        raised_by: actor.id,
        subject: data.subject,
        body: data.body,
        severity: data.severity ?? "low",
      },
    });
    return { id: row.id };
  }

  async updateStatus(actor: AuthUser, id: string, status: string) {
    // Status workflow transitions are admin-only (c_admin_all is the only UPDATE policy
    // beyond the raiser's own rows; keep resolution authority with admin).
    if (!actor.roles.includes("admin")) throw new ForbiddenException();
    await this.prisma.complaints.update({ where: { id }, data: { status } });
    return { ok: true };
  }

  /** Load a complaint the actor is allowed to see, or 404 (RLS invisibility). */
  private async visibleComplaint(actor: AuthUser, complaintId: string) {
    const scope = this.scope(actor);
    if (scope === null) throw new NotFoundException();
    const complaint = await this.prisma.complaints.findFirst({
      where: { AND: [{ id: complaintId }, scope] },
    });
    if (!complaint) throw new NotFoundException();
    return complaint;
  }

  async messages(actor: AuthUser, complaintId: string) {
    await this.visibleComplaint(actor, complaintId);
    const rows = await this.prisma.complaint_messages.findMany({
      where: { complaint_id: complaintId },
      orderBy: { created_at: "asc" },
    });
    // sender_id -> users (auth); names live in public.profiles by id.
    const senderIds = Array.from(new Set(rows.map((m) => m.sender_id)));
    const profs = senderIds.length
      ? await this.prisma.profiles.findMany({
          where: { id: { in: senderIds } },
          select: { id: true, full_name: true },
        })
      : [];
    const name = new Map(profs.map((p) => [p.id, p.full_name]));
    return rows.map((m) => ({
      id: m.id,
      senderId: m.sender_id,
      senderName: name.get(m.sender_id) ?? null,
      body: m.body,
      createdAt: m.created_at,
    }));
  }

  /** cm_read/cm_admin — anyone who can see the thread can reply; bumps updated_at. */
  async addMessage(actor: AuthUser, complaintId: string, body: string) {
    await this.visibleComplaint(actor, complaintId);
    const row = await this.prisma.complaint_messages.create({
      data: { complaint_id: complaintId, sender_id: actor.id, body },
    });
    await this.prisma.complaints.update({
      where: { id: complaintId },
      data: { updated_at: new Date() },
    });
    return { id: row.id };
  }

  /** Escalate to admin — the raiser (or admin) can flag a thread for attention. */
  async escalate(actor: AuthUser, complaintId: string) {
    await this.visibleComplaint(actor, complaintId);
    await this.prisma.complaints.update({
      where: { id: complaintId },
      data: { escalated_to_admin: true },
    });
    return { ok: true };
  }
}
