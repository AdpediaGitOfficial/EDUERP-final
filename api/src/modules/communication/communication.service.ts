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

  // ==== Notifications center (the caller's own inbox rows) =================
  // Built on broadcast_recipients (br_user_read/update own rows): fee-due
  // notices, targeted broadcasts, and anything else routed through
  // NotificationsService.notify() land here as per-user rows with a read flag.

  /** The caller's most recent notifications, newest first, with a read flag. */
  async myNotifications(actor: AuthUser, limit = 20) {
    const rows = await this.prisma.broadcast_recipients.findMany({
      where: { user_id: actor.id },
      orderBy: { created_at: "desc" },
      take: Math.min(Math.max(limit, 1), 50),
      include: {
        broadcasts: {
          select: { subject: true, body: true, created_at: true, audience_type: true },
        },
      },
    });
    return rows.map((r) => ({
      id: r.id, // recipient-row id — mark-read targets this
      broadcastId: r.broadcast_id,
      subject: r.broadcasts?.subject ?? null,
      body: r.broadcasts?.body ?? null,
      audienceType: r.broadcasts?.audience_type ?? null,
      createdAt: r.broadcasts?.created_at ?? r.created_at,
      read: !!r.read_at,
    }));
  }

  /** Unread count for the caller — drives the bell badge. */
  async unreadCount(actor: AuthUser) {
    const count = await this.prisma.broadcast_recipients.count({
      where: { user_id: actor.id, read_at: null },
    });
    return { count };
  }

  /** Mark one of the caller's own notifications read (br_user_update own rows). */
  async markNotificationRead(actor: AuthUser, recipientId: string) {
    const res = await this.prisma.broadcast_recipients.updateMany({
      where: { id: recipientId, user_id: actor.id, read_at: null },
      data: { read_at: new Date() },
    });
    return { updated: res.count };
  }

  /** Mark all of the caller's unread notifications read. */
  async markAllNotificationsRead(actor: AuthUser) {
    const res = await this.prisma.broadcast_recipients.updateMany({
      where: { user_id: actor.id, read_at: null },
      data: { read_at: new Date() },
    });
    return { updated: res.count };
  }

  async listHolidays(_actor: AuthUser) {
    // hol_read_auth: true
    return this.prisma.holidays.findMany({ orderBy: { start_date: "asc" } });
  }

  async createHoliday(
    actor: AuthUser,
    data: {
      name: string;
      description?: string;
      startDate: string;
      endDate?: string;
      type?: string;
    },
  ) {
    // hol_admin_write
    if (!actor.roles.includes("admin")) throw new ForbiddenException();
    const row = await this.prisma.holidays.create({
      data: {
        name: data.name,
        description: data.description || null,
        start_date: new Date(data.startDate),
        end_date: new Date(data.endDate || data.startDate),
        type: (data.type ?? "holiday") as never,
      },
    });
    return { id: row.id };
  }

  // ==== Broadcast outbox + send (b_admin_all / b_teacher_own) ==============
  /** Sent broadcasts with per-message recipient + read stats. */
  async outbox(actor: AuthUser) {
    const isAdmin = actor.roles.includes("admin");
    if (!isAdmin && !actor.roles.includes("teacher")) throw new ForbiddenException();
    const where: Prisma.broadcastsWhereInput = isAdmin ? {} : { sender_id: actor.id };
    const rows = await this.prisma.broadcasts.findMany({
      where,
      orderBy: { created_at: "desc" },
      take: 50,
      include: { _count: { select: { broadcast_recipients: true } } },
    });
    const ids = rows.map((r) => r.id);
    const readByBroadcast = new Map<string, number>();
    if (ids.length) {
      const grouped = await this.prisma.broadcast_recipients.groupBy({
        by: ["broadcast_id"],
        where: { broadcast_id: { in: ids }, read_at: { not: null } },
        _count: { _all: true },
      });
      for (const g of grouped) readByBroadcast.set(g.broadcast_id as string, g._count._all);
    }
    return rows.map((b) => ({
      id: b.id,
      subject: b.subject,
      body: b.body,
      audience_type: b.audience_type,
      created_at: b.created_at ? b.created_at.toISOString() : null,
      recipientCount: b._count.broadcast_recipients,
      readCount: readByBroadcast.get(b.id) ?? 0,
    }));
  }

  /**
   * Send a broadcast. Resolves the audience to recipient user-ids and stores a
   * constraint-valid audience_type (all_parents | all_staff | class | user).
   * The old client used all_teachers/everyone, which violate
   * broadcasts_audience_type_check — mapped here to all_staff / user.
   */
  async sendBroadcast(
    actor: AuthUser,
    input: { audience: string; classId?: string; subject: string; body: string },
  ) {
    const isAdmin = actor.roles.includes("admin");
    if (!isAdmin && !actor.roles.includes("teacher")) throw new ForbiddenException();
    if (!input.subject?.trim() || !input.body?.trim())
      throw new ForbiddenException("Subject and message are required.");

    const parentIds = async () =>
      (await this.prisma.user_roles.findMany({ where: { role: "parent" as never } })).map(
        (r) => r.user_id,
      );
    const teacherIds = async () =>
      (await this.prisma.user_roles.findMany({ where: { role: "teacher" as never } })).map(
        (r) => r.user_id,
      );

    let userIds: string[] = [];
    let audienceType: string;
    let audienceRef: string | null = null;

    switch (input.audience) {
      case "all_parents":
        userIds = await parentIds();
        audienceType = "all_parents";
        break;
      case "all_teachers":
        userIds = await teacherIds();
        audienceType = "all_staff";
        break;
      case "everyone":
        userIds = [...(await parentIds()), ...(await teacherIds())];
        audienceType = "user";
        break;
      case "class": {
        if (!input.classId) throw new ForbiddenException("Pick a class.");
        const students = await this.prisma.students.findMany({
          where: { class_id: input.classId },
          select: { id: true },
        });
        const sIds = students.map((s) => s.id);
        if (sIds.length) {
          const ps = await this.prisma.parent_student.findMany({
            where: { student_id: { in: sIds } },
            select: { parent_id: true },
          });
          userIds = ps.map((p) => p.parent_id);
        }
        audienceType = "class";
        audienceRef = input.classId;
        break;
      }
      default:
        throw new ForbiddenException("Unknown audience.");
    }

    // Only real auth accounts can receive (broadcast_recipients.user_id -> auth.users).
    const unique = Array.from(new Set(userIds)).filter(Boolean);
    const accounts = unique.length
      ? await this.prisma.users.findMany({ where: { id: { in: unique } }, select: { id: true } })
      : [];
    const recipients = accounts.map((a) => a.id);

    const broadcast = await this.prisma.broadcasts.create({
      data: {
        sender_id: actor.id,
        audience_type: audienceType,
        audience_ref: audienceRef,
        subject: input.subject,
        body: input.body,
        ...(recipients.length
          ? { broadcast_recipients: { create: recipients.map((user_id) => ({ user_id })) } }
          : {}),
      },
    });
    return { id: broadcast.id, recipients: recipients.length };
  }
}
