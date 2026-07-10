import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../infra/database/prisma.service";
import type { AuthUser } from "../../common/decorators/current-user.decorator";

/**
 * RLS translation (api/db/rls-policies-extracted.csv):
 *   announcements: ann_audience_read — admin sees all; otherwise audience='all',
 *     audience matches the caller's role, or audience='class' and the caller is
 *     linked to that class as student/parent/teacher (all three EXISTS branches).
 *     ann_admin_write -> admin CRUD; ann_teacher_insert -> teacher create;
 *     ann_author_delete -> author deletes own.
 *   broadcasts: b_admin_all; b_teacher_own (sender); b_recipients_read.
 *   broadcast_recipients: br_admin_all; br_user_read/update (own rows).
 *   holidays: hol_read_auth (true); hol_admin_write.
 */
@Injectable()
export class CommunicationService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listAnnouncements(actor: AuthUser, page = 1, pageSize = 50) {
    let where: Prisma.announcementsWhereInput = {};
    if (!actor.roles.includes("admin")) {
      const or: Prisma.announcementsWhereInput[] = [{ audience: "all" }];
      if (actor.roles.includes("teacher")) {
        or.push({ audience: "teachers" });
        or.push({
          audience: "class",
          classes: { teacher_classes: { some: { teacher_id: actor.id } } },
        });
      }
      if (actor.roles.includes("student")) {
        or.push({ audience: "students" });
        or.push({ audience: "class", classes: { students: { some: { profile_id: actor.id } } } });
      }
      if (actor.roles.includes("parent")) {
        or.push({ audience: "parents" });
        or.push({
          audience: "class",
          classes: { students: { some: { parent_student: { some: { parent_id: actor.id } } } } },
        });
      }
      where = { OR: or };
    }
    const [total, rows] = await Promise.all([
      this.prisma.announcements.count({ where }),
      this.prisma.announcements.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { classes: { select: { name: true, section: true } } },
      }),
    ]);
    return {
      total,
      page,
      pageSize,
      rows: rows.map((a) => ({
        id: a.id,
        title: a.title,
        body: a.body,
        audience: a.audience,
        classId: a.class_id,
        className: a.classes ? `${a.classes.name} ${a.classes.section ?? ""}`.trim() : null,
        authorId: a.author_id,
        createdAt: a.created_at,
      })),
    };
  }

  async createAnnouncement(
    actor: AuthUser,
    data: { title: string; body: string; audience?: string; classId?: string },
  ) {
    // ann_admin_write | ann_teacher_insert
    if (!actor.roles.some((r) => r === "admin" || r === "teacher")) throw new ForbiddenException();
    const row = await this.prisma.announcements.create({
      data: {
        title: data.title,
        body: data.body,
        audience: (data.audience ?? "all") as never,
        class_id: data.classId ?? null,
        author_id: actor.id,
      },
    });
    return { id: row.id };
  }

  async deleteAnnouncement(actor: AuthUser, id: string) {
    // ann_admin_write | ann_author_delete
    const row = await this.prisma.announcements.findUnique({ where: { id } });
    if (!row) return { ok: true };
    if (!actor.roles.includes("admin") && row.author_id !== actor.id)
      throw new ForbiddenException();
    await this.prisma.announcements.delete({ where: { id } });
    return { ok: true };
  }

  async listBroadcasts(actor: AuthUser, page = 1, pageSize = 50) {
    let where: Prisma.broadcastsWhereInput;
    if (actor.roles.includes("admin")) where = {};
    else {
      where = {
        OR: [{ sender_id: actor.id }, { broadcast_recipients: { some: { user_id: actor.id } } }],
      };
    }
    const [total, rows] = await Promise.all([
      this.prisma.broadcasts.count({ where }),
      this.prisma.broadcasts.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { total, page, pageSize, rows };
  }

  async listHolidays(_actor: AuthUser) {
    // hol_read_auth: true
    return this.prisma.holidays.findMany({ orderBy: { start_date: "asc" } });
  }
}
