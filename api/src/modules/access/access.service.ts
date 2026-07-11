import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../../infra/database/prisma.service";
import type { AuthUser } from "../../common/decorators/current-user.decorator";

/**
 * Admin-only access-control + staff-monitoring surface.
 * RLS (api/db/rls-policies-extracted.csv):
 *   user_roles:           user_roles_admin_all / _read (admin) + read_own
 *   staff_permissions:    sp_admin_all (admin ALL) + sp_user_read (own)
 *   permission_audit_log: pa_admin_read / pa_admin_write (actor_id = auth.uid())
 * Every method here is admin-gated, matching the admin policies.
 */
@Injectable()
export class AccessService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private requireAdmin(actor: AuthUser) {
    if (!actor.roles.includes("admin")) throw new ForbiddenException();
  }

  /** Admin + teacher staff, each with their roles — the access-control left list. */
  async listStaff(actor: AuthUser) {
    this.requireAdmin(actor);
    const roleRows = await this.prisma.user_roles.findMany({
      where: { role: { in: ["admin", "teacher"] } },
      select: { user_id: true, role: true },
    });
    const ids = Array.from(new Set(roleRows.map((r) => r.user_id)));
    if (ids.length === 0) return [];
    const profiles = await this.prisma.profiles.findMany({
      where: { id: { in: ids } },
      select: { id: true, full_name: true, email: true },
      orderBy: { full_name: "asc" },
    });
    const roleMap = new Map<string, string[]>();
    for (const r of roleRows) {
      roleMap.set(r.user_id, [...(roleMap.get(r.user_id) ?? []), r.role]);
    }
    return profiles.map((p) => ({
      id: p.id,
      full_name: p.full_name,
      email: p.email,
      roles: roleMap.get(p.id) ?? [],
    }));
  }

  async listPermissions(actor: AuthUser, userId: string) {
    this.requireAdmin(actor);
    const rows = await this.prisma.staff_permissions.findMany({
      where: { user_id: userId },
      select: { permission_key: true, enabled: true },
    });
    return rows.map((r) => ({ permission_key: r.permission_key, enabled: r.enabled }));
  }

  async listAudit(actor: AuthUser, userId: string) {
    this.requireAdmin(actor);
    const rows = await this.prisma.permission_audit_log.findMany({
      where: { target_user_id: userId },
      orderBy: { created_at: "desc" },
      take: 50,
    });
    const actorIds = Array.from(new Set(rows.map((r) => r.actor_id)));
    const actors = actorIds.length
      ? await this.prisma.profiles.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, full_name: true },
        })
      : [];
    const actorMap = new Map(actors.map((a) => [a.id, a.full_name]));
    return rows.map((r) => ({
      id: r.id,
      permission_key: r.permission_key,
      old_value: r.old_value,
      new_value: r.new_value,
      created_at: r.created_at ? r.created_at.toISOString() : null,
      actor_name: actorMap.get(r.actor_id) ?? "—",
    }));
  }

  /** Toggle a permission + write the audit row, atomically (sp_admin_all + pa_admin_write). */
  async setPermission(actor: AuthUser, input: { userId: string; key: string; enabled: boolean }) {
    this.requireAdmin(actor);
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.staff_permissions.findFirst({
        where: { user_id: input.userId, permission_key: input.key },
      });
      const oldValue = existing?.enabled ?? false;
      if (existing) {
        await tx.staff_permissions.update({
          where: { id: existing.id },
          data: { enabled: input.enabled, updated_at: new Date() },
        });
      } else {
        await tx.staff_permissions.create({
          data: { user_id: input.userId, permission_key: input.key, enabled: input.enabled },
        });
      }
      await tx.permission_audit_log.create({
        data: {
          target_user_id: input.userId,
          actor_id: actor.id, // pa_admin_write requires actor_id = auth.uid()
          permission_key: input.key,
          old_value: oldValue,
          new_value: input.enabled,
        },
      });
      return { ok: true };
    });
  }

  /** Replace a user's role (single-role model), admin only (user_roles_admin_all). */
  async setRole(actor: AuthUser, input: { userId: string; role: string }) {
    this.requireAdmin(actor);
    await this.prisma.$transaction([
      this.prisma.user_roles.deleteMany({ where: { user_id: input.userId } }),
      this.prisma.user_roles.create({
        data: { user_id: input.userId, role: input.role as never },
      }),
    ]);
    return { ok: true };
  }

  /** Teacher directory with today's attendance-marking + recent-activity stats. */
  async monitoring(actor: AuthUser) {
    this.requireAdmin(actor);
    const teacherRoleRows = await this.prisma.user_roles.findMany({
      where: { role: "teacher" as never },
      select: { user_id: true },
    });
    const ids = Array.from(new Set(teacherRoleRows.map((r) => r.user_id)));
    if (ids.length === 0) return { totals: { total: 0, marked: 0, pending: 0 }, rows: [] };

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const tomorrow = new Date(today.getTime() + 86_400_000);

    const [profiles, attendanceToday, recentNotes, recentBroadcasts] = await Promise.all([
      this.prisma.profiles.findMany({
        where: { id: { in: ids } },
        select: { id: true, full_name: true, email: true, phone: true },
        orderBy: { full_name: "asc" },
      }),
      this.prisma.attendance.findMany({
        where: { date: { gte: today, lt: tomorrow } },
        select: { marked_by: true },
      }),
      this.prisma.progress_notes.findMany({
        orderBy: { created_at: "desc" },
        take: 200,
        select: { teacher_id: true },
      }),
      this.prisma.broadcasts.findMany({
        orderBy: { created_at: "desc" },
        take: 200,
        select: { sender_id: true, created_at: true },
      }),
    ]);

    const markedIds = new Set(attendanceToday.map((r) => r.marked_by).filter(Boolean) as string[]);
    const notesByTeacher = new Map<string, number>();
    for (const n of recentNotes) {
      if (n.teacher_id)
        notesByTeacher.set(n.teacher_id, (notesByTeacher.get(n.teacher_id) ?? 0) + 1);
    }
    const bcByTeacher = new Map<string, { count: number; last: string | null }>();
    for (const b of recentBroadcasts) {
      if (!b.sender_id) continue;
      const cur = bcByTeacher.get(b.sender_id) ?? { count: 0, last: null };
      cur.count += 1;
      const iso = b.created_at ? b.created_at.toISOString() : null;
      if (iso && (!cur.last || iso > cur.last)) cur.last = iso;
      bcByTeacher.set(b.sender_id, cur);
    }

    const rows = profiles.map((p) => ({
      id: p.id,
      full_name: p.full_name,
      email: p.email,
      phone: p.phone,
      markedToday: markedIds.has(p.id),
      notesCount: notesByTeacher.get(p.id) ?? 0,
      broadcastCount: bcByTeacher.get(p.id)?.count ?? 0,
      lastBroadcast: bcByTeacher.get(p.id)?.last ?? null,
    }));
    const marked = rows.filter((r) => r.markedToday).length;
    return { totals: { total: rows.length, marked, pending: rows.length - marked }, rows };
  }
}
