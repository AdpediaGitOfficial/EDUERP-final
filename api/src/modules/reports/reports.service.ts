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

  /**
   * Comprehensive admin dashboard aggregate — a server-side port of the ~12
   * client-side aggregation queries the AdminDashboard component ran against
   * Supabase (KPIs, 6-month revenue/expense trend, fee-by-grade, enrollment,
   * staff mix, 30-day attendance trend, defaulters, activity feed). Computed
   * once, admin-only. `now` is the server clock; all windows derive from it.
   */
  async adminDashboard(actor: AuthUser) {
    if (!actor.roles.includes("admin")) throw new ForbiddenException();
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const monthStart = new Date(y, m, 1);
    const today = new Date(y, m, now.getDate());
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const PRESENT = ["present", "late"];

    const [
      studentCount,
      teacherCount,
      staffCount,
      classCount,
      feeRows,
      monthPayments,
      monthExpenses,
      monthPayroll,
      openComplaints,
      openJobs,
      attToday,
      staffAttToday,
    ] = await Promise.all([
      this.prisma.students.count(),
      this.prisma.teachers.count({ where: { status: "active" } }),
      this.prisma.staff.count({ where: { status: "active" } }),
      this.prisma.classes.count(),
      this.prisma.fee_assignments.findMany({
        select: { amount_due: true, amount_paid: true, status: true },
      }),
      this.prisma.payments.findMany({
        where: { paid_at: { gte: monthStart }, status: "successful" },
        select: { amount: true, method: true },
      }),
      this.prisma.expenses.aggregate({
        where: { expense_date: { gte: monthStart } },
        _sum: { amount: true },
      }),
      this.prisma.payroll_runs.findMany({
        where: { month: { gte: monthStart }, status: "paid" },
        select: { net_salary: true },
      }),
      this.prisma.complaints.count({ where: { status: "open" } }),
      this.prisma.job_openings.count({ where: { status: "open" } }),
      this.prisma.attendance.groupBy({
        by: ["status"],
        where: { date: today },
        _count: { _all: true },
      }),
      this.prisma.teacher_attendance.groupBy({
        by: ["status"],
        where: { date: today },
        _count: { _all: true },
      }),
    ]);

    const num = (v: unknown) => Number(v ?? 0);
    const dueTotal = feeRows.reduce((s, f) => s + num(f.amount_due) - num(f.amount_paid), 0);
    const pendingCount = feeRows.filter((f) => f.status !== "paid").length;
    const collectedMonth = monthPayments.reduce((s, p) => s + num(p.amount), 0);
    const expenseMonth = num(monthExpenses._sum.amount);
    const payrollMonth = monthPayroll.reduce((s, p) => s + num(p.net_salary), 0);

    const pctPresent = (rows: { status: string; _count: { _all: number } }[]) => {
      const total = rows.reduce((s, r) => s + r._count._all, 0);
      if (!total) return { pct: 0, sampled: 0 };
      const present = rows
        .filter((r) => PRESENT.includes(r.status))
        .reduce((s, r) => s + r._count._all, 0);
      return { pct: (present / total) * 100, sampled: total };
    };
    const att = pctPresent(attToday);
    const staffAtt = pctPresent(staffAttToday);

    const paymentMix = Object.entries(
      monthPayments.reduce<Record<string, number>>((acc, p) => {
        const k = (p.method || "other").toString();
        acc[k] = (acc[k] ?? 0) + num(p.amount);
        return acc;
      }, {}),
    ).map(([name, value]) => ({ name, value }));

    // 6-month revenue vs expense trend.
    const trendFrom = new Date(y, m - 5, 1);
    const [trendPays, trendExps] = await Promise.all([
      this.prisma.payments.findMany({
        where: { paid_at: { gte: trendFrom }, status: "successful" },
        select: { amount: true, paid_at: true },
      }),
      this.prisma.expenses.findMany({
        where: { expense_date: { gte: trendFrom } },
        select: { amount: true, expense_date: true },
      }),
    ]);
    const buckets: { key: string; label: string; revenue: number; expenses: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(y, m - i, 1);
      buckets.push({
        key: d.toISOString().slice(0, 7),
        label: d.toLocaleString("en-IN", { month: "short" }),
        revenue: 0,
        expenses: 0,
      });
    }
    for (const p of trendPays) {
      const b = buckets.find((x) => x.key === (p.paid_at?.toISOString().slice(0, 7) ?? ""));
      if (b) b.revenue += num(p.amount);
    }
    for (const e of trendExps) {
      const b = buckets.find((x) => x.key === (e.expense_date?.toISOString().slice(0, 7) ?? ""));
      if (b) b.expenses += num(e.amount);
    }

    // Fee collection + enrollment by grade.
    const feeByGrade = await this.prisma.fee_assignments.findMany({
      select: {
        amount_due: true,
        amount_paid: true,
        students: { select: { classes: { select: { name: true } } } },
      },
    });
    const gradeMap = new Map<string, { grade: string; collected: number; outstanding: number }>();
    for (const r of feeByGrade) {
      const g = r.students?.classes?.name ?? "—";
      const cur = gradeMap.get(g) ?? { grade: g, collected: 0, outstanding: 0 };
      cur.collected += num(r.amount_paid);
      cur.outstanding += Math.max(0, num(r.amount_due) - num(r.amount_paid));
      gradeMap.set(g, cur);
    }
    const byGrade = [...gradeMap.values()].sort((a, b) =>
      a.grade.localeCompare(b.grade, undefined, { numeric: true }),
    );

    const enrollGrouped = await this.prisma.students.groupBy({
      by: ["class_id"],
      _count: { _all: true },
    });
    const classNames = await this.prisma.classes.findMany({ select: { id: true, name: true } });
    const nameById = new Map(classNames.map((c) => [c.id, c.name]));
    const enrollByName = new Map<string, number>();
    for (const g of enrollGrouped) {
      const nm = g.class_id ? (nameById.get(g.class_id) ?? "—") : "—";
      enrollByName.set(nm, (enrollByName.get(nm) ?? 0) + g._count._all);
    }
    const enrollByGrade = [...enrollByName.entries()]
      .map(([grade, count]) => ({ grade, count }))
      .sort((a, b) => a.grade.localeCompare(b.grade, undefined, { numeric: true }));

    // Staff composition.
    const staffRows = await this.prisma.staff.findMany({
      where: { status: "active" },
      select: { department: true, designation: true },
    });
    const teaching = staffRows.filter((r) =>
      ["Teacher", "Senior Teacher"].includes(r.designation ?? ""),
    ).length;
    const byDept = new Map<string, number>();
    for (const r of staffRows) {
      const d = r.department || "—";
      byDept.set(d, (byDept.get(d) ?? 0) + 1);
    }
    const staffMix = {
      teaching: [
        { name: "Teaching", value: teaching },
        { name: "Non-teaching", value: staffRows.length - teaching },
      ],
      byDept: [...byDept.entries()]
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value),
    };

    // 30-day attendance trend (students + staff).
    const trendStart = new Date(now.getTime() - 29 * 86_400_000);
    const [stuAtt, stfAtt] = await Promise.all([
      this.prisma.attendance.groupBy({
        by: ["date", "status"],
        where: { date: { gte: trendStart } },
        _count: { _all: true },
      }),
      this.prisma.teacher_attendance.groupBy({
        by: ["date", "status"],
        where: { date: { gte: trendStart } },
        _count: { _all: true },
      }),
    ]);
    const dayPct = (
      rows: { date: Date; status: string; _count: { _all: number } }[],
      dayIso: string,
    ) => {
      const on = rows.filter((r) => r.date.toISOString().slice(0, 10) === dayIso);
      const total = on.reduce((s, r) => s + r._count._all, 0);
      if (!total) return 0;
      const present = on
        .filter((r) => PRESENT.includes(r.status))
        .reduce((s, r) => s + r._count._all, 0);
      return Math.round((present / total) * 100);
    };
    const attTrend: { date: string; students: number; staff: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = iso(new Date(now.getTime() - i * 86_400_000));
      attTrend.push({ date: d.slice(5), students: dayPct(stuAtt, d), staff: dayPct(stfAtt, d) });
    }

    // Upcoming holidays, defaulters, activity feed.
    const [upcoming, defaulterRows, recentAdmissions, recentPayments, recentComplaints] =
      await Promise.all([
        this.prisma.holidays.findMany({
          where: { start_date: { gte: today } },
          orderBy: { start_date: "asc" },
          take: 5,
        }),
        this.prisma.fee_assignments.findMany({
          where: { status: { not: "paid" }, due_date: { lt: today } },
          take: 200,
          select: {
            id: true,
            amount_due: true,
            amount_paid: true,
            due_date: true,
            students: { select: { admission_no: true, profiles: { select: { full_name: true } } } },
          },
        }),
        this.prisma.students.findMany({
          orderBy: { created_at: "desc" },
          take: 5,
          select: {
            id: true,
            admission_no: true,
            created_at: true,
            profiles: { select: { full_name: true } },
          },
        }),
        this.prisma.payments.findMany({
          where: { status: "successful" },
          orderBy: { paid_at: "desc" },
          take: 5,
          select: {
            id: true,
            amount: true,
            paid_at: true,
            students: { select: { profiles: { select: { full_name: true } } } },
          },
        }),
        this.prisma.complaints.findMany({
          orderBy: { created_at: "desc" },
          take: 5,
          select: { id: true, subject: true, created_at: true },
        }),
      ]);
    const defaulters = defaulterRows
      .map((r) => ({
        id: r.id,
        name: r.students?.profiles?.full_name || r.students?.admission_no || "—",
        amount: Math.max(0, num(r.amount_due) - num(r.amount_paid)),
        days: r.due_date
          ? Math.max(0, Math.floor((now.getTime() - r.due_date.getTime()) / 86_400_000))
          : 0,
      }))
      .filter((r) => r.amount > 0)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
    const activity = [
      ...recentAdmissions.map((a) => ({
        kind: "admission" as const,
        tone: "text-stat-indigo",
        at: a.created_at,
        text: `${a.profiles?.full_name ?? a.admission_no} admitted`,
      })),
      ...recentPayments.map((p) => ({
        kind: "payment" as const,
        tone: "text-emerald-600",
        at: p.paid_at,
        text: `${p.students?.profiles?.full_name ?? "A student"} paid ₹${num(p.amount).toLocaleString("en-IN")}`,
      })),
      ...recentComplaints.map((c) => ({
        kind: "complaint" as const,
        tone: "text-amber-600",
        at: c.created_at,
        text: `Complaint: ${c.subject}`,
      })),
    ]
      .filter((e) => e.at)
      .sort((a, b) => new Date(b.at as Date).getTime() - new Date(a.at as Date).getTime())
      .slice(0, 8);

    // Fee-collection efficiency: this term vs last term, as % of total invoiced.
    const thisTerm =
      m < 6
        ? { from: new Date(y, 0, 1), to: new Date(y, 5, 30, 23, 59, 59) }
        : { from: new Date(y, 6, 1), to: new Date(y, 11, 31, 23, 59, 59) };
    const lastTerm =
      m < 6
        ? { from: new Date(y - 1, 6, 1), to: new Date(y - 1, 11, 31, 23, 59, 59) }
        : { from: new Date(y, 0, 1), to: new Date(y, 5, 30, 23, 59, 59) };
    const effPays = await this.prisma.payments.findMany({
      where: { status: "successful", paid_at: { gte: lastTerm.from } },
      select: { amount: true, paid_at: true },
    });
    const invoiced = feeRows.reduce((s, f) => s + num(f.amount_due), 0) || 1;
    const inR = (d: Date | null, r: { from: Date; to: Date }) => !!d && d >= r.from && d <= r.to;
    const cThis = effPays
      .filter((p) => inR(p.paid_at, thisTerm))
      .reduce((s, p) => s + num(p.amount), 0);
    const cLast = effPays
      .filter((p) => inR(p.paid_at, lastTerm))
      .reduce((s, p) => s + num(p.amount), 0);
    const efficiency = { thisPct: (cThis / invoiced) * 100, lastPct: (cLast / invoiced) * 100 };

    return {
      studentCount,
      teacherCount,
      staffCount,
      classCount,
      dueTotal,
      pendingCount,
      collectedMonth,
      expenseMonth,
      payrollMonth,
      openComplaints,
      openJobs,
      attPct: att.pct,
      attSampled: att.sampled,
      staffAttPct: staffAtt.pct,
      staffAttSampled: staffAtt.sampled,
      paymentMix,
      trend: buckets,
      byGrade,
      enrollByGrade,
      staffMix,
      attTrend,
      upcoming,
      defaulters,
      activity,
      efficiency,
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
