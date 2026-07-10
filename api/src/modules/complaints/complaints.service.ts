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
          students: { select: { profiles: { select: { full_name: true } } } },
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
        raisedBy: c.raised_by,
        createdAt: c.created_at,
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

  async messages(actor: AuthUser, complaintId: string) {
    const scope = this.scope(actor);
    const complaint = await this.prisma.complaints.findFirst({
      where: { AND: [{ id: complaintId }, scope ?? {}] },
    });
    if (!complaint) throw new NotFoundException();
    const rows = await this.prisma.complaint_messages.findMany({
      where: { complaint_id: complaintId },
      orderBy: { created_at: "asc" },
    });
    return rows.map((m) => ({
      id: m.id,
      senderId: m.sender_id,
      body: m.body,
      createdAt: m.created_at,
    }));
  }
}
