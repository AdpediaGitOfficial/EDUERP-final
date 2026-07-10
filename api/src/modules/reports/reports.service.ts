import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../../infra/database/prisma.service";
import type { AuthUser } from "../../common/decorators/current-user.decorator";

/**
 * Reports/Analytics + Audit.
 * Dashboard aggregates were previously computed client-side from RLS-scoped
 * Supabase queries; here they are explicit admin-scoped aggregates (the admin
 * dashboard is the only consumer of the school-wide numbers).
 * permission_audit_log: pa_admin_read -> admin only.
 */
@Injectable()
export class ReportsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async adminDashboard(actor: AuthUser) {
    if (!actor.roles.includes("admin")) throw new ForbiddenException();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [students, teachers, staff, classes, feeAgg, attendanceToday, openComplaints] =
      await Promise.all([
        this.prisma.students.count({ where: { status: "active" } }),
        this.prisma.teachers.count({ where: { status: "active" } }),
        this.prisma.staff.count({ where: { status: "active" } }),
        this.prisma.classes.count(),
        this.prisma.fee_assignments.aggregate({ _sum: { amount_due: true, amount_paid: true } }),
        this.prisma.attendance.groupBy({
          by: ["status"],
          where: { date: today },
          _count: { _all: true },
        }),
        this.prisma.complaints.count({ where: { status: "open" } }),
      ]);
    return {
      students,
      teachers,
      staff,
      classes,
      fees: {
        due: feeAgg._sum.amount_due ?? 0,
        collected: feeAgg._sum.amount_paid ?? 0,
      },
      attendanceToday: Object.fromEntries(attendanceToday.map((r) => [r.status, r._count._all])),
      openComplaints,
    };
  }

  async auditLog(actor: AuthUser, page = 1, pageSize = 50) {
    // pa_admin_read
    if (!actor.roles.includes("admin")) throw new ForbiddenException();
    const [total, rows] = await Promise.all([
      this.prisma.permission_audit_log.count(),
      this.prisma.permission_audit_log.findMany({
        orderBy: { created_at: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { total, page, pageSize, rows };
  }
}
