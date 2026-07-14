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
    const [upcoming, defaulterRows, recentAdmissions, recentPayments0, recentComplaints] =
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
          take: 6,
          select: {
            id: true,
            amount: true,
            paid_at: true,
            method: true,
            students: {
              select: {
                profiles: { select: { full_name: true } },
                classes: { select: { name: true, section: true } },
              },
            },
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
      ...recentPayments0.map((p) => ({
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

    // ---- KPI "today" pulse + period-over-period deltas ----
    // Operational tiles (collected today, leaves today) and the deltas that let
    // each KPI show movement (▲/▼ vs the prior period) instead of a flat number.
    const tomorrow = new Date(y, m, now.getDate() + 1);
    const prevMonthStart = new Date(y, m - 1, 1);
    const yesterday = new Date(y, m, now.getDate() - 1);
    const [
      collectedTodayAgg,
      collectedPrevMonthAgg,
      newStudentsMonth,
      newStaffMonth,
      leavesToday,
      pendingLeaves,
      attYesterday,
    ] = await Promise.all([
      this.prisma.payments.aggregate({
        where: { paid_at: { gte: today, lt: tomorrow }, status: "successful" },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.payments.aggregate({
        where: { paid_at: { gte: prevMonthStart, lt: monthStart }, status: "successful" },
        _sum: { amount: true },
      }),
      this.prisma.students.count({ where: { created_at: { gte: monthStart } } }),
      this.prisma.staff.count({ where: { created_at: { gte: monthStart } } }),
      this.prisma.leave_requests.count({
        where: { status: "approved", start_date: { lte: today }, end_date: { gte: today } },
      }),
      this.prisma.leave_requests.count({ where: { status: "pending" } }),
      this.prisma.attendance.groupBy({
        by: ["status"],
        where: { date: yesterday },
        _count: { _all: true },
      }),
    ]);
    const collectedToday = num(collectedTodayAgg._sum.amount);
    const collectedTodayCount = collectedTodayAgg._count._all;
    const collectedPrevMonth = num(collectedPrevMonthAgg._sum.amount);
    const attYesterdayPct = pctPresent(attYesterday).pct;

    // Upcoming birthdays (today + next 6 days) — students (dob on student_details,
    // which has no Prisma relation, so resolved in a second lookup) plus staff.
    const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const dayKeys = new Map<number, number>();
    for (let i = 0; i < 7; i++) {
      const d = new Date(y, m, now.getDate() + i);
      dayKeys.set(d.getMonth() * 100 + d.getDate(), i);
    }
    const daysAwayOf = (d: Date | null) =>
      d ? dayKeys.get(d.getUTCMonth() * 100 + d.getUTCDate()) : undefined;
    const dateLabelOf = (d: Date) => `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;

    const [detailRows, staffBdayRows] = await Promise.all([
      this.prisma.student_details.findMany({
        where: { dob: { not: null } },
        select: { student_id: true, dob: true },
      }),
      this.prisma.staff.findMany({
        where: { dob: { not: null }, status: "active" },
        select: { id: true, full_name: true, dob: true, designation: true },
      }),
    ]);
    const matchedStudents = detailRows
      .map((r) => ({ id: r.student_id, dob: r.dob as Date, daysAway: daysAwayOf(r.dob) }))
      .filter((x): x is { id: string; dob: Date; daysAway: number } => x.daysAway !== undefined);
    const stuMeta = matchedStudents.length
      ? await this.prisma.students.findMany({
          where: { id: { in: matchedStudents.map((x) => x.id) } },
          select: {
            id: true,
            profiles: { select: { full_name: true } },
            classes: { select: { name: true, section: true } },
          },
        })
      : [];
    const stuById = new Map(stuMeta.map((s) => [s.id, s]));
    const birthdays = [
      ...matchedStudents.map((x) => {
        const meta = stuById.get(x.id);
        return {
          id: x.id,
          kind: "student" as const,
          name: meta?.profiles?.full_name ?? "Student",
          sub: meta?.classes
            ? `${meta.classes.name}${meta.classes.section ? " · " + meta.classes.section : ""}`
            : "Student",
          dateLabel: dateLabelOf(x.dob),
          daysAway: x.daysAway,
          isToday: x.daysAway === 0,
        };
      }),
      ...staffBdayRows.flatMap((s) => {
        const daysAway = daysAwayOf(s.dob);
        if (daysAway === undefined) return [];
        return [
          {
            id: s.id,
            kind: "staff" as const,
            name: s.full_name,
            sub: s.designation ?? "Staff",
            dateLabel: dateLabelOf(s.dob as Date),
            daysAway,
            isToday: daysAway === 0,
          },
        ];
      }),
    ]
      .sort((a, b) => a.daysAway - b.daysAway)
      .slice(0, 8);

    // Fees card: whole-year demand vs collected (not just this month).
    const annualDemand = feeRows.reduce((s, f) => s + num(f.amount_due), 0);
    const collectedTotal = feeRows.reduce((s, f) => s + num(f.amount_paid), 0);
    const feeSummary = {
      annualDemand,
      collected: collectedTotal,
      pending: dueTotal,
      collectionPct: annualDemand ? (collectedTotal / annualDemand) * 100 : 0,
    };
    const recentPayments = recentPayments0.map((p) => ({
      id: p.id,
      name: p.students?.profiles?.full_name ?? "A student",
      className: p.students?.classes
        ? `${p.students.classes.name}${p.students.classes.section ? " · " + p.students.classes.section : ""}`
        : null,
      method: p.method ?? null,
      amount: num(p.amount),
      at: p.paid_at,
    }));

    return {
      feeSummary,
      recentPayments,
      birthdays,
      studentCount,
      teacherCount,
      staffCount,
      classCount,
      dueTotal,
      pendingCount,
      collectedMonth,
      collectedToday,
      collectedTodayCount,
      collectedPrevMonth,
      newStudentsMonth,
      newStaffMonth,
      leavesToday,
      pendingLeaves,
      attYesterdayPct,
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

  /** Teacher dashboard: assigned classes, per-class stats, today's schedule, etc. */
  async teacherDashboard(actor: AuthUser) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayDow = new Date().getDay();

    const tc = await this.prisma.teacher_classes.findMany({
      where: { teacher_id: actor.id },
      select: { class_id: true, classes: { select: { id: true, name: true, section: true } } },
    });
    const classIds = tc.map((r) => r.class_id);
    const classes = tc.map((r) => r.classes).filter(Boolean) as {
      id: string;
      name: string;
      section: string | null;
    }[];

    const teacher = await this.prisma.teachers.findFirst({
      where: { email: { equals: actor.email, mode: "insensitive" } },
      select: {
        full_name: true,
        email: true,
        subject: true,
        status: true,
        phone: true,
        qualification: true,
      },
    });
    const teacherSubject = teacher?.subject ?? undefined;

    const [subjects, students, timetable, announcements, hwActive, examsUpcoming, attToday] =
      await Promise.all([
        classIds.length
          ? this.prisma.subjects.findMany({
              where: { class_id: { in: classIds } },
              select: { id: true, name: true, class_id: true },
            })
          : [],
        classIds.length
          ? this.prisma.students.findMany({
              where: { class_id: { in: classIds } },
              select: { id: true, class_id: true, gender: true },
            })
          : [],
        classIds.length
          ? this.prisma.timetable.findMany({
              where: { teacher_id: actor.id },
              orderBy: { start_time: "asc" },
              select: {
                id: true,
                day_of_week: true,
                start_time: true,
                end_time: true,
                room: true,
                class_id: true,
                subjects: { select: { name: true } },
                classes: { select: { name: true, section: true } },
              },
            })
          : [],
        this.prisma.announcements.findMany({
          orderBy: { created_at: "desc" },
          take: 4,
          select: { id: true, title: true, body: true, created_at: true },
        }),
        this.prisma.homework.findMany({
          where: { teacher_id: actor.id, status: "active" },
          select: { id: true, class_id: true },
        }),
        classIds.length
          ? this.prisma.exams.findMany({
              where: { class_id: { in: classIds }, exam_date: { gte: today } },
              orderBy: { exam_date: "asc" },
              select: {
                id: true,
                name: true,
                exam_date: true,
                class_id: true,
                classes: { select: { name: true, section: true } },
              },
            })
          : [],
        classIds.length
          ? this.prisma.attendance.findMany({
              where: { class_id: { in: classIds }, date: today },
              select: { class_id: true },
              distinct: ["class_id"],
            })
          : [],
      ]);

    const attendedClassIds = new Set(attToday.map((r) => r.class_id));
    const attendancePending = classIds.filter((id) => !attendedClassIds.has(id)).length;
    const mySubjects = teacherSubject
      ? subjects.filter((s) => (s.name ?? "").toLowerCase() === teacherSubject.toLowerCase())
      : subjects;

    const classStats = classes.map((c) => {
      const cs = students.filter((s) => s.class_id === c.id);
      return {
        id: c.id,
        name: c.name,
        section: c.section,
        total: cs.length,
        boys: cs.filter((s) => s.gender === "male").length,
        girls: cs.filter((s) => s.gender === "female").length,
        subject: teacherSubject ?? "—",
        attendanceMarked: attendedClassIds.has(c.id),
        homeworkPending: hwActive.filter((h) => h.class_id === c.id).length,
        upcomingExams: examsUpcoming.filter((e) => e.class_id === c.id).length,
      };
    });

    return {
      classes,
      classStats,
      classCount: classIds.length,
      subjects: mySubjects,
      subjectCount: mySubjects.length,
      studentCount: students.length,
      todaySchedule: timetable.filter((t) => t.day_of_week === todayDow),
      timetable,
      announcements,
      homeworkPending: hwActive.length,
      upcomingExams: examsUpcoming,
      attendancePending,
      teacher,
    };
  }

  /** Student dashboard: own attendance, results, timetable, homework status. */
  async studentDashboard(actor: AuthUser) {
    const student = await this.prisma.students.findFirst({
      where: { profile_id: actor.id },
      select: {
        id: true,
        roll_no: true,
        admission_no: true,
        class_id: true,
        classes: { select: { name: true, section: true, academic_year: true } },
      },
    });
    if (!student) return null;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const termStart = new Date(now.getTime() - 120 * 86_400_000);

    const [attendance, results, timetable, announcements, homework, subjects, examsUpcoming] =
      await Promise.all([
        this.prisma.attendance.findMany({
          where: { student_id: student.id, date: { gte: termStart } },
          orderBy: { date: "asc" },
          select: { date: true, status: true },
        }),
        this.prisma.exam_results.findMany({
          where: { student_id: student.id },
          select: { marks_obtained: true, exams: { select: { max_marks: true, name: true } } },
        }),
        student.class_id
          ? this.prisma.timetable.findMany({
              where: { class_id: student.class_id },
              orderBy: { start_time: "asc" },
              select: {
                id: true,
                day_of_week: true,
                start_time: true,
                end_time: true,
                room: true,
                subjects: { select: { name: true } },
              },
            })
          : [],
        this.prisma.announcements.findMany({
          orderBy: { created_at: "desc" },
          take: 4,
          select: { id: true, title: true, body: true, created_at: true },
        }),
        student.class_id
          ? this.prisma.homework.findMany({
              where: { class_id: student.class_id },
              select: {
                id: true,
                title: true,
                due_date: true,
                subject_id: true,
                subjects: { select: { name: true } },
              },
            })
          : [],
        student.class_id
          ? this.prisma.subjects.findMany({
              where: { class_id: student.class_id },
              select: { id: true, name: true },
            })
          : [],
        student.class_id
          ? this.prisma.exams.findMany({
              where: { class_id: student.class_id, exam_date: { gte: today } },
              orderBy: { exam_date: "asc" },
              take: 5,
              select: {
                id: true,
                name: true,
                exam_date: true,
                subjects: { select: { name: true } },
              },
            })
          : [],
      ]);

    const presentDays = attendance.filter(
      (a) => a.status === "present" || a.status === "late",
    ).length;
    const totalDays = attendance.length;
    const attendancePct = totalDays ? Math.round((presentDays / totalDays) * 100) : 0;
    const avgPct = results.length
      ? Math.round(
          results.reduce(
            (s, r) => s + (Number(r.marks_obtained) / Number(r.exams?.max_marks || 100)) * 100,
            0,
          ) / results.length,
        )
      : 0;

    const hwIds = homework.map((h) => h.id);
    const subs = hwIds.length
      ? await this.prisma.homework_submissions.findMany({
          where: { homework_id: { in: hwIds }, student_id: student.id },
          select: { homework_id: true, status: true },
        })
      : [];
    const subMap = new Map(subs.map((s) => [s.homework_id, s.status]));
    let pendingHw = 0,
      overdueHw = 0,
      completedHw = 0;
    for (const h of homework) {
      const st = subMap.get(h.id);
      if (st === "submitted" || st === "reviewed") completedHw += 1;
      else if (st === "overdue" || (h.due_date && h.due_date < today)) overdueHw += 1;
      else pendingHw += 1;
    }

    return {
      student,
      attendance,
      attendancePct,
      presentDays,
      totalDays,
      avgPct,
      examCount: results.length,
      timetable,
      announcements,
      subjectsCount: subjects.length,
      pendingHw,
      overdueHw,
      completedHw,
      upcomingExams: examsUpcoming,
    };
  }

  /** Parent dashboard: per-child fee/attendance/homework/performance summary. */
  async parentDashboard(actor: AuthUser) {
    const links = await this.prisma.parent_student.findMany({
      where: { parent_id: actor.id },
      select: { student_id: true },
    });
    const ids = links.map((l) => l.student_id);
    if (ids.length === 0) return { children: [], fees: [], attMap: {}, hwMap: {}, perfMap: {} };

    const now = new Date();
    const since = new Date(now.getFullYear(), now.getMonth(), 1);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const kids = await this.prisma.students.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        admission_no: true,
        class_id: true,
        profiles: { select: { full_name: true } },
        classes: { select: { name: true, section: true } },
      },
    });
    const classIds = kids.map((k) => k.class_id).filter((x): x is string => !!x);

    const [fees, att, hw, subs, results] = await Promise.all([
      this.prisma.fee_assignments.findMany({
        where: { student_id: { in: ids } },
        select: {
          student_id: true,
          title: true,
          due_date: true,
          amount_due: true,
          amount_paid: true,
          status: true,
        },
      }),
      this.prisma.attendance.findMany({
        where: { student_id: { in: ids }, date: { gte: since } },
        select: { student_id: true, status: true },
      }),
      classIds.length
        ? this.prisma.homework.findMany({
            where: { class_id: { in: classIds } },
            select: { id: true, class_id: true, due_date: true },
          })
        : [],
      this.prisma.homework_submissions.findMany({
        where: { student_id: { in: ids } },
        select: { student_id: true, homework_id: true },
      }),
      this.prisma.exam_results.findMany({
        where: { student_id: { in: ids } },
        select: { student_id: true, marks_obtained: true, exams: { select: { max_marks: true } } },
      }),
    ]);

    const attMap: Record<string, { total: number; present: number }> = {};
    for (const r of att) {
      const m = (attMap[r.student_id] ||= { total: 0, present: 0 });
      m.total += 1;
      if (r.status === "present" || r.status === "late") m.present += 1;
    }
    const subsByStudent: Record<string, Set<string>> = {};
    for (const s of subs) (subsByStudent[s.student_id] ||= new Set()).add(s.homework_id);
    const hwMap: Record<
      string,
      { total: number; submitted: number; missed: number; pending: number }
    > = {};
    for (const k of kids) {
      const classHw = hw.filter((h) => h.class_id === k.class_id);
      const submittedSet = subsByStudent[k.id] ?? new Set();
      let submitted = 0,
        missed = 0,
        pending = 0;
      for (const h of classHw) {
        if (submittedSet.has(h.id)) submitted += 1;
        else if (h.due_date && h.due_date < today) missed += 1;
        else pending += 1;
      }
      hwMap[k.id] = { total: classHw.length, submitted, missed, pending };
    }
    const perfMap: Record<string, { got: number; max: number }> = {};
    for (const r of results) {
      const m = (perfMap[r.student_id] ||= { got: 0, max: 0 });
      m.got += Number(r.marks_obtained) || 0;
      m.max += Number(r.exams?.max_marks) || 0;
    }

    const children = kids.map((k) => ({
      id: k.id,
      admission_no: k.admission_no,
      class_id: k.class_id,
      profiles: { full_name: k.profiles?.full_name ?? null },
      classes: k.classes ? { name: k.classes.name, section: k.classes.section } : null,
    }));
    return { children, fees, attMap, hwMap, perfMap };
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

  private ymd(d: Date): string {
    return d.toISOString().slice(0, 10);
  }
  private ymdhm(d: Date): string {
    // "YYYY-MM-DD HH:mm" in UTC — matches the old client's display granularity.
    return d.toISOString().slice(0, 16).replace("T", " ");
  }
  private clsLabel(c: { name: string | null; section: string | null } | null): string {
    if (!c) return "";
    return `${c.name ?? ""}${c.section ? " " + c.section : ""}`;
  }

  /**
   * Raw datasets for the admin fee-collection report. The page does heavy
   * grade-level aggregation client-side; this returns the six slim tables it
   * needs (matching the old direct queries) so its render logic is untouched.
   */
  async feesReport(actor: AuthUser) {
    if (!actor.roles.includes("admin")) throw new ForbiddenException();
    const [classes, students, profiles, structures, fees, payments] = await Promise.all([
      this.prisma.classes.findMany({ select: { id: true, name: true, section: true } }),
      this.prisma.students.findMany({
        select: { id: true, class_id: true, profile_id: true, admission_date: true },
      }),
      this.prisma.profiles.findMany({ select: { id: true, full_name: true } }),
      this.prisma.fee_structures.findMany({
        select: { id: true, class_id: true, amount: true, frequency: true },
      }),
      this.prisma.fee_assignments.findMany({
        select: {
          student_id: true,
          amount_due: true,
          amount_paid: true,
          status: true,
          due_date: true,
        },
      }),
      this.prisma.payments.findMany({ select: { amount: true, paid_at: true } }),
    ]);
    const d = (x: Date | null | undefined) => (x ? x.toISOString().slice(0, 10) : null);
    const n = (x: unknown) => (x == null ? 0 : Number(x));
    return {
      classes,
      students: students.map((s) => ({
        id: s.id,
        class_id: s.class_id,
        profile_id: s.profile_id,
        admission_date: d(s.admission_date),
      })),
      profiles,
      structures: structures.map((s) => ({
        id: s.id,
        class_id: s.class_id,
        amount: n(s.amount),
        frequency: s.frequency,
      })),
      fees: fees.map((f) => ({
        student_id: f.student_id,
        amount_due: n(f.amount_due),
        amount_paid: n(f.amount_paid),
        status: f.status,
        due_date: d(f.due_date),
      })),
      payments: payments.map((p) => ({
        amount: n(p.amount),
        paid_at: p.paid_at?.toISOString() ?? null,
      })),
    };
  }

  /** Admin analytics — 30-day revenue + attendance-mix series and role split. */
  async analytics(actor: AuthUser) {
    if (!actor.roles.includes("admin")) throw new ForbiddenException();
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(start.getUTCDate() - 29);

    const [attendance, payments, roles] = await Promise.all([
      this.prisma.attendance.findMany({
        where: { date: { gte: start } },
        select: { date: true, status: true },
      }),
      this.prisma.payments.findMany({
        where: { paid_at: { gte: start }, status: "successful" },
        select: { amount: true, paid_at: true },
      }),
      this.prisma.user_roles.findMany({ select: { role: true } }),
    ]);

    // 30-day scaffolds keyed by YYYY-MM-DD
    const attDays = new Map<string, { present: number; absent: number; late: number }>();
    const revDays = new Map<string, number>();
    const order: string[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(start.getTime() + (29 - i) * 86_400_000);
      const key = this.ymd(d);
      order.push(key);
      attDays.set(key, { present: 0, absent: 0, late: 0 });
      revDays.set(key, 0);
    }
    for (const a of attendance) {
      const key = this.ymd(a.date);
      const bucket = attDays.get(key);
      if (!bucket) continue;
      if (a.status === "present") bucket.present++;
      else if (a.status === "absent") bucket.absent++;
      else if (a.status === "late") bucket.late++;
    }
    for (const p of payments) {
      const key = this.ymd(p.paid_at);
      if (revDays.has(key)) revDays.set(key, (revDays.get(key) ?? 0) + Number(p.amount));
    }
    const label = (key: string) =>
      new Date(`${key}T00:00:00Z`).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        timeZone: "UTC",
      });

    const attSeries = order.map((key) => ({ date: key, day: label(key), ...attDays.get(key)! }));
    const revenueSeries = order.map((key) => ({ day: label(key), amount: revDays.get(key) ?? 0 }));
    const roleCounts = new Map<string, number>();
    for (const r of roles) roleCounts.set(r.role, (roleCounts.get(r.role) ?? 0) + 1);
    const roleDist = Array.from(roleCounts.entries()).map(([name, value]) => ({ name, value }));

    return { attSeries, revenueSeries, roleDist, totalUsers: roles.length };
  }

  /** Report generator — one of four typed exports over a date range (admin). */
  async generator(actor: AuthUser, type: string, from: string, to: string) {
    if (!actor.roles.includes("admin")) throw new ForbiddenException();
    const day = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00.000Z`);
    const start = day(from);
    const endInclusive = new Date(day(to).getTime() + 86_400_000);

    if (type === "attendance") {
      const rows = await this.prisma.attendance.findMany({
        where: { date: { gte: start, lt: endInclusive } },
        orderBy: { date: "desc" },
        take: 5000,
        include: {
          students: { select: { admission_no: true, profiles: { select: { full_name: true } } } },
          classes: { select: { name: true, section: true } },
        },
      });
      return rows.map((r) => ({
        date: this.ymd(r.date),
        admission_no: r.students?.admission_no ?? null,
        student: r.students?.profiles?.full_name ?? null,
        class: this.clsLabel(r.classes),
        status: r.status,
      }));
    }
    if (type === "fees") {
      const rows = await this.prisma.payments.findMany({
        where: { paid_at: { gte: start, lt: endInclusive } },
        orderBy: { paid_at: "desc" },
        take: 5000,
        include: {
          students: { select: { admission_no: true, profiles: { select: { full_name: true } } } },
        },
      });
      return rows.map((r) => ({
        paid_at: this.ymdhm(r.paid_at),
        admission_no: r.students?.admission_no ?? null,
        student: r.students?.profiles?.full_name ?? null,
        amount: Number(r.amount),
        method: r.method,
        reference: r.reference,
      }));
    }
    if (type === "students") {
      const rows = await this.prisma.students.findMany({
        where: { admission_date: { gte: start, lt: endInclusive } },
        orderBy: { admission_date: "desc" },
        take: 5000,
        include: {
          profiles: { select: { full_name: true, email: true } },
          classes: { select: { name: true, section: true } },
        },
      });
      return rows.map((r) => ({
        admission_no: r.admission_no,
        roll_no: r.roll_no,
        name: r.profiles?.full_name ?? null,
        email: r.profiles?.email ?? null,
        class: this.clsLabel(r.classes),
        admission_date: this.ymd(r.admission_date),
      }));
    }
    if (type === "complaints") {
      const rows = await this.prisma.complaints.findMany({
        where: { created_at: { gte: start, lt: endInclusive } },
        orderBy: { created_at: "desc" },
        take: 5000,
        include: {
          students: { select: { admission_no: true, profiles: { select: { full_name: true } } } },
        },
      });
      return rows.map((r) => ({
        created_at: r.created_at ? this.ymdhm(r.created_at) : null,
        student: r.students?.profiles?.full_name ?? null,
        admission_no: r.students?.admission_no ?? null,
        subject: r.subject,
        severity: r.severity,
        status: r.status,
        escalated: r.escalated_to_admin ? "yes" : "no",
      }));
    }
    throw new ForbiddenException("Unknown report type.");
  }
}
