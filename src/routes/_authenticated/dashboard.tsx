import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell, PageHeader } from "@/components/app-shell";
import { useCurrentUser } from "@/hooks/use-current-user";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  UserPlus,
  CalendarPlus,
  Megaphone,
  GraduationCap,
  Clock,
  MapPin,
  ClipboardCheck,
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  Home,
  AlertTriangle,
  Users,
  Wallet,
  TrendingUp,
  TrendingDown,
  MessageSquareWarning,
  Briefcase,
  Cake,
  Activity,
  IndianRupee,
  Send,
} from "lucide-react";
import { format, startOfWeek, addDays, isSameDay } from "date-fns";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";

const money = (n: number) => `₹${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const DONUT_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899"];

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function StatCard({
  label,
  value,
  subtitle,
  tone,
}: {
  label: string;
  value: string;
  subtitle?: string;
  tone: "sky" | "indigo" | "violet" | "coral";
}) {
  const bg = {
    sky: "bg-stat-sky text-stat-sky-foreground",
    indigo: "bg-stat-indigo text-stat-indigo-foreground",
    violet: "bg-stat-violet text-stat-violet-foreground",
    coral: "bg-stat-coral text-stat-coral-foreground",
  }[tone];
  return (
    <div className={`rounded-2xl p-5 ${bg}`}>
      <div className="text-sm opacity-80">{label}</div>
      <div className="font-display text-4xl font-semibold mt-2">{value}</div>
      {subtitle && <div className="text-xs opacity-75 mt-2">{subtitle}</div>}
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "sky" | "indigo" | "violet" | "coral";
}) {
  const bg = {
    sky: "bg-stat-sky text-stat-sky-foreground",
    indigo: "bg-stat-indigo text-stat-indigo-foreground",
    violet: "bg-stat-violet text-stat-violet-foreground",
    coral: "bg-stat-coral text-stat-coral-foreground",
  }[tone];
  return (
    <div className={`rounded-2xl p-3 ${bg}`}>
      <div className="text-[11px] opacity-80 truncate">{label}</div>
      <div className="font-display text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}

function Dashboard() {
  const { user } = useCurrentUser();
  return (
    <AppShell>
      {user?.primaryRole === "admin" && <AdminDashboard fullName={user.fullName} />}
      {user?.primaryRole === "teacher" && <TeacherDashboard fullName={user.fullName} />}
      {user?.primaryRole === "student" && (
        <StudentDashboard userId={user.id} fullName={user.fullName} />
      )}
      {user?.primaryRole === "parent" && (
        <ParentDashboard userId={user.id} fullName={user.fullName} />
      )}
      {user && !user.primaryRole && (
        <div className="p-8">
          <p>No role assigned yet. Contact your administrator.</p>
        </div>
      )}
    </AppShell>
  );
}

function AdminDashboard({ fullName }: { fullName: string }) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const monthStart = new Date(y, m, 1).toISOString();
  const todayStr = now.toISOString().slice(0, 10);
  const yr = `${y}–${y + 1}`;

  const { data } = useQuery({
    queryKey: ["admin-dashboard-core"],
    queryFn: async () => {
      const [students, teachers, staffAll, classes, fees, payments] = await Promise.all([
        supabase.from("students").select("id", { count: "exact", head: true }),
        supabase
          .from("teachers")
          .select("id", { count: "exact", head: true })
          .eq("status", "active"),
        supabase.from("staff").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("classes").select("id", { count: "exact", head: true }),
        supabase.from("fee_assignments").select("amount_due,amount_paid,status"),
        supabase.from("payments").select("amount,status,paid_at,method").gte("paid_at", monthStart),
      ]);
      const dueTotal = (fees.data ?? []).reduce(
        (s, f) => s + Number(f.amount_due) - Number(f.amount_paid || 0),
        0,
      );
      const collectedMonth = (payments.data ?? [])
        .filter((p: any) => p.status === "successful")
        .reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
      const pendingCount = (fees.data ?? []).filter((f) => f.status !== "paid").length;
      return {
        studentCount: students.count ?? 0,
        teacherCount: teachers.count ?? 0,
        staffCount: staffAll.count ?? 0,
        classCount: classes.count ?? 0,
        dueTotal,
        collectedMonth,
        pendingCount,
        paymentsThisMonth: payments.data ?? [],
      };
    },
  });

  const { data: extras } = useQuery({
    queryKey: ["admin-dashboard-extras", todayStr],
    queryFn: async () => {
      const [expenses, payroll, complaints, jobs, attToday, staffAttToday] = await Promise.all([
        supabase
          .from("expenses")
          .select("amount,expense_date")
          .gte("expense_date", monthStart.slice(0, 10)),
        supabase
          .from("payroll_runs")
          .select("net_salary,status,month")
          .gte("month", monthStart.slice(0, 10)),
        supabase
          .from("complaints")
          .select("id", { count: "exact", head: true })
          .eq("status", "open"),
        supabase
          .from("job_openings")
          .select("id", { count: "exact", head: true })
          .eq("status", "open"),
        supabase.from("attendance").select("status").eq("date", todayStr),
        supabase.from("teacher_attendance").select("status").eq("date", todayStr),
      ]);
      const expenseMonth = (expenses.data ?? []).reduce(
        (s: number, e: any) => s + Number(e.amount || 0),
        0,
      );
      const payrollMonth = (payroll.data ?? [])
        .filter((p: any) => p.status === "paid")
        .reduce((s: number, p: any) => s + Number(p.net_salary || 0), 0);
      const attRows = attToday.data ?? [];
      const attPct = attRows.length
        ? (attRows.filter((r: any) => r.status === "present" || r.status === "late").length /
            attRows.length) *
          100
        : 0;
      const stRows = staffAttToday.data ?? [];
      const staffAttPct = stRows.length
        ? (stRows.filter((r: any) => r.status === "present" || r.status === "late").length /
            stRows.length) *
          100
        : 0;
      return {
        expenseMonth,
        payrollMonth,
        openComplaints: complaints.count ?? 0,
        openJobs: jobs.count ?? 0,
        attPct,
        staffAttPct,
        attSampled: attRows.length,
        staffAttSampled: stRows.length,
      };
    },
  });

  // Fee collection efficiency (this term vs last term)
  const { data: efficiency } = useQuery({
    queryKey: ["admin-dashboard-efficiency"],
    queryFn: async () => {
      const thisTerm =
        m < 6
          ? { from: new Date(y, 0, 1), to: new Date(y, 5, 30, 23, 59, 59) }
          : { from: new Date(y, 6, 1), to: new Date(y, 11, 31, 23, 59, 59) };
      const lastTerm =
        m < 6
          ? { from: new Date(y - 1, 6, 1), to: new Date(y - 1, 11, 31, 23, 59, 59) }
          : { from: new Date(y, 0, 1), to: new Date(y, 5, 30, 23, 59, 59) };
      const [pays, fees] = await Promise.all([
        supabase
          .from("payments")
          .select("amount,paid_at,status")
          .eq("status", "successful")
          .gte("paid_at", lastTerm.from.toISOString()),
        supabase.from("fee_assignments").select("amount_due"),
      ]);
      const invoiced =
        (fees.data ?? []).reduce((s: number, f: any) => s + Number(f.amount_due || 0), 0) || 1;
      const inR = (d: string, r: any) => d && new Date(d) >= r.from && new Date(d) <= r.to;
      const cThis = (pays.data ?? [])
        .filter((p: any) => inR(p.paid_at, thisTerm))
        .reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
      const cLast = (pays.data ?? [])
        .filter((p: any) => inR(p.paid_at, lastTerm))
        .reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
      return { thisPct: (cThis / invoiced) * 100, lastPct: (cLast / invoiced) * 100 };
    },
  });

  // 6-month Revenue vs Expenses trend
  const { data: trend } = useQuery({
    queryKey: ["admin-dashboard-trend"],
    queryFn: async () => {
      const from = new Date(y, m - 5, 1).toISOString();
      const [pays, exps] = await Promise.all([
        supabase
          .from("payments")
          .select("amount,paid_at,status")
          .gte("paid_at", from)
          .eq("status", "successful"),
        supabase
          .from("expenses")
          .select("amount,expense_date")
          .gte("expense_date", from.slice(0, 10)),
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
      for (const p of pays.data ?? []) {
        const b = buckets.find((x) => x.key === (p.paid_at ?? "").slice(0, 7));
        if (b) b.revenue += Number(p.amount || 0);
      }
      for (const e of exps.data ?? []) {
        const b = buckets.find((x) => x.key === (e.expense_date ?? "").slice(0, 7));
        if (b) b.expenses += Number(e.amount || 0);
      }
      return buckets;
    },
  });

  // Fee collection by grade
  const { data: byGrade } = useQuery({
    queryKey: ["admin-dashboard-by-grade"],
    queryFn: async () => {
      const { data } = await supabase
        .from("fee_assignments")
        .select("amount_due,amount_paid,students!inner(classes(name))")
        .limit(20000);
      const map = new Map<string, { grade: string; collected: number; outstanding: number }>();
      for (const r of (data ?? []) as any[]) {
        const g = r.students?.classes?.name || "—";
        const cur = map.get(g) ?? { grade: g, collected: 0, outstanding: 0 };
        cur.collected += Number(r.amount_paid || 0);
        cur.outstanding += Math.max(0, Number(r.amount_due || 0) - Number(r.amount_paid || 0));
        map.set(g, cur);
      }
      return Array.from(map.values()).sort((a, b) =>
        a.grade.localeCompare(b.grade, undefined, { numeric: true }),
      );
    },
  });

  // Enrollment by grade (RPC-backed to avoid 1000-row limit)
  const { data: enrollByGrade } = useQuery({
    queryKey: ["admin-dashboard-enroll-grade"],
    queryFn: async () => {
      const { data: classes } = await supabase.from("classes").select("id,name");
      const ids = (classes ?? []).map((c: any) => c.id);
      if (!ids.length) return [];
      const { data: stats } = await supabase.rpc("get_class_stats", { _class_ids: ids as any });
      const byName = new Map<string, number>();
      for (const s of (stats ?? []) as any[]) {
        const nm = (classes ?? []).find((c: any) => c.id === s.class_id)?.name || "—";
        byName.set(nm, (byName.get(nm) ?? 0) + Number(s.student_count || 0));
      }
      return Array.from(byName.entries())
        .map(([grade, count]) => ({ grade, count }))
        .sort((a, b) => a.grade.localeCompare(b.grade, undefined, { numeric: true }));
    },
  });

  // Staff composition
  const { data: staffMix } = useQuery({
    queryKey: ["admin-dashboard-staffmix"],
    queryFn: async () => {
      const { data } = await supabase
        .from("staff")
        .select("department,designation")
        .eq("status", "active")
        .limit(5000);
      const rows = data ?? [];
      const teachers = rows.filter(
        (r: any) => r.designation === "Teacher" || r.designation === "Senior Teacher",
      ).length;
      const nonTeaching = rows.length - teachers;
      const byDept = new Map<string, number>();
      for (const r of rows as any[])
        byDept.set(r.department || "—", (byDept.get(r.department || "—") ?? 0) + 1);
      return {
        teaching: [
          { name: "Teaching", value: teachers },
          { name: "Non-teaching", value: nonTeaching },
        ],
        byDept: Array.from(byDept.entries())
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value),
      };
    },
  });

  // Attendance trend (last 30 days)
  const { data: attTrend } = useQuery({
    queryKey: ["admin-dashboard-att-trend"],
    queryFn: async () => {
      const from = new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
      const [stu, stf] = await Promise.all([
        supabase.from("attendance").select("date,status").gte("date", from).limit(50000),
        supabase.from("teacher_attendance").select("date,status").gte("date", from).limit(5000),
      ]);
      const days: { date: string; students: number; staff: number }[] = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
        days.push({ date: d.slice(5), students: 0, staff: 0 });
      }
      const pct = (rows: any[], d: string) => {
        const on = rows.filter((r) => r.date === d);
        if (!on.length) return 0;
        return (
          (on.filter((r) => r.status === "present" || r.status === "late").length / on.length) * 100
        );
      };
      for (const b of days) {
        const full = new Date().toISOString().slice(0, 4) + "-" + b.date;
        b.students = Math.round(pct(stu.data ?? [], full));
        b.staff = Math.round(pct(stf.data ?? [], full));
      }
      return days;
    },
  });

  // Payment mode breakdown (this month)
  const paymentMix = (() => {
    const rows = data?.paymentsThisMonth ?? [];
    const map = new Map<string, number>();
    for (const p of rows as any[]) {
      if (p.status !== "successful") continue;
      const k = (p.method || "other").toString();
      map.set(k, (map.get(k) ?? 0) + Number(p.amount || 0));
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  })();

  // Upcoming holidays
  const { data: upcoming } = useQuery({
    queryKey: ["admin-dashboard-holidays"],
    queryFn: async () =>
      (
        await supabase
          .from("holidays")
          .select("id,name,start_date,end_date,type")
          .gte("start_date", todayStr)
          .order("start_date")
          .limit(5)
      ).data ?? [],
  });

  // Fee defaulters
  const { data: defaulters } = useQuery({
    queryKey: ["admin-dashboard-defaulters"],
    queryFn: async () => {
      const { data } = await supabase
        .from("fee_assignments")
        .select("id,amount_due,amount_paid,due_date,students(admission_no,profiles(full_name))")
        .neq("status", "paid")
        .lt("due_date", todayStr)
        .limit(200);
      return (data ?? [])
        .map((r: any) => ({
          id: r.id,
          name: r.students?.profiles?.full_name || r.students?.admission_no || "—",
          amount: Math.max(0, Number(r.amount_due || 0) - Number(r.amount_paid || 0)),
          days: Math.max(0, Math.floor((Date.now() - new Date(r.due_date).getTime()) / 86_400_000)),
        }))
        .filter((r: any) => r.amount > 0)
        .sort((a: any, b: any) => b.amount - a.amount)
        .slice(0, 5);
    },
  });

  // Recent activity feed — hybrid across admissions, payments, complaints, staff
  const { data: activity } = useQuery({
    queryKey: ["admin-dashboard-activity"],
    queryFn: async () => {
      const [adm, pay, com, stf] = await Promise.all([
        supabase
          .from("students")
          .select("id,admission_no,created_at,profile_id,profiles(full_name)")
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("payments")
          .select("id,amount,paid_at,students(profiles(full_name))")
          .eq("status", "successful")
          .order("paid_at", { ascending: false })
          .limit(5),
        supabase
          .from("complaints")
          .select("id,subject,created_at")
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("staff")
          .select("id,full_name,join_date,created_at")
          .order("created_at", { ascending: false })
          .limit(5),
      ]);
      const items: { at: string; kind: string; text: string; tone: string }[] = [];
      for (const s of adm.data ?? [])
        items.push({
          at: (s as any).created_at,
          kind: "admission",
          tone: "text-emerald-600",
          text: `New admission — ${(s as any).profiles?.full_name || (s as any).admission_no}`,
        });
      for (const p of pay.data ?? [])
        items.push({
          at: (p as any).paid_at,
          kind: "payment",
          tone: "text-blue-600",
          text: `Payment ${money(Number((p as any).amount))} — ${(p as any).students?.profiles?.full_name || "student"}`,
        });
      for (const c of com.data ?? [])
        items.push({
          at: (c as any).created_at,
          kind: "complaint",
          tone: "text-amber-600",
          text: `Complaint raised — ${(c as any).subject}`,
        });
      for (const s of stf.data ?? [])
        items.push({
          at: (s as any).created_at,
          kind: "staff",
          tone: "text-violet-600",
          text: `Staff joined — ${(s as any).full_name}`,
        });
      return items
        .filter((x) => x.at)
        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
        .slice(0, 10);
    },
  });

  const netPosition =
    (data?.collectedMonth ?? 0) - (extras?.expenseMonth ?? 0) - (extras?.payrollMonth ?? 0);
  const netPositive = netPosition >= 0;
  const effDelta = (efficiency?.thisPct ?? 0) - (efficiency?.lastPct ?? 0);

  return (
    <>
      <PageHeader
        title={`Welcome ${fullName.split(" ")[0]}`}
        subtitle="Overview of your school's operations."
      />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl overflow-hidden relative min-h-[240px] bg-[oklch(0.9_0.08_240)] p-6">
          <div className="absolute top-4 right-4 rounded-xl bg-white/80 backdrop-blur px-4 py-2 flex items-center gap-2">
            <CalendarPlus className="size-4 text-primary" />
            <div className="text-xs">
              <div className="text-muted-foreground">Academic Year</div>
              <div className="font-semibold">{yr}</div>
            </div>
          </div>
          <svg
            viewBox="0 0 400 200"
            className="absolute bottom-0 left-0 w-full"
            preserveAspectRatio="none"
          >
            <path
              d="M0,150 Q100,90 200,120 T400,110 L400,200 L0,200 Z"
              fill="oklch(0.75 0.15 145)"
              opacity="0.7"
            />
            <path
              d="M0,170 Q100,130 200,150 T400,140 L400,200 L0,200 Z"
              fill="oklch(0.65 0.15 145)"
            />
            <circle cx="320" cy="60" r="16" fill="oklch(0.85 0.15 80)" />
            <polygon points="120,155 130,130 140,155" fill="oklch(0.45 0.15 275)" />
            <polygon points="260,158 270,128 280,158" fill="oklch(0.45 0.15 275)" />
            <circle cx="180" cy="150" r="6" fill="oklch(0.6 0.15 25)" />
            <rect x="177" y="150" width="6" height="15" fill="oklch(0.5 0.15 275)" />
            <circle cx="210" cy="145" r="6" fill="oklch(0.55 0.15 240)" />
            <rect x="207" y="145" width="6" height="18" fill="oklch(0.55 0.15 240)" />
          </svg>
        </div>
        <div className="grid grid-cols-1 gap-4">
          <StatCard
            label="Total Students"
            value={String(data?.studentCount ?? 0)}
            subtitle="enrolled"
            tone="sky"
          />
          <StatCard
            label="Teachers"
            value={String(data?.teacherCount ?? 0)}
            subtitle="teaching staff"
            tone="indigo"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
        <StatCard
          label="Collected this month"
          value={`₹${(data?.collectedMonth ?? 0).toFixed(2)}`}
          subtitle="revenue"
          tone="violet"
        />
        <StatCard
          label="Pending Dues"
          value={`₹${(data?.dueTotal ?? 0).toFixed(2)}`}
          subtitle={`${data?.pendingCount ?? 0} outstanding`}
          tone="coral"
        />
        <StatCard
          label="Sections"
          value={String(data?.classCount ?? 0)}
          subtitle="classes running"
          tone="indigo"
        />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
        <QuickAction to="/users" icon={UserPlus} label="Add User" />
        <QuickAction to="/students" icon={GraduationCap} label="Admit Student" />
        <QuickAction to="/announcements" icon={Megaphone} label="Post Notice" />
        <QuickAction to="/holidays" icon={CalendarPlus} label="Add Holiday" />
      </div>

      {/* Extended stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
        <MiniCard
          icon={Users}
          label="Total Staff"
          value={String(data?.staffCount ?? 0)}
          sub="all categories"
          href="/hr/staff"
        />
        <MiniCard
          icon={Wallet}
          label="Expenses (month)"
          value={money(extras?.expenseMonth ?? 0)}
          sub="operating"
          href="/finance/expenses"
        />
        <MiniCard
          icon={netPositive ? TrendingUp : TrendingDown}
          label="Net Position (month)"
          value={money(netPosition)}
          sub="revenue − expenses − payroll"
          href="/finance"
          tint={netPositive ? "text-emerald-600" : "text-red-600"}
        />
        <MiniCard
          icon={effDelta >= 0 ? TrendingUp : TrendingDown}
          label="Fee Collection Rate"
          value={`${(efficiency?.thisPct ?? 0).toFixed(1)}%`}
          sub={`${effDelta >= 0 ? "+" : ""}${effDelta.toFixed(1)} pts vs last term`}
          href="/fees"
          tint={effDelta >= 0 ? "text-emerald-600" : "text-red-600"}
        />
        <MiniCard
          icon={ClipboardCheck}
          label="Attendance today"
          value={`${(extras?.attPct ?? 0).toFixed(1)}%`}
          sub={`${extras?.attSampled ?? 0} marked`}
          href="/attendance-overview"
        />
        <MiniCard
          icon={CheckCircle2}
          label="Staff attendance"
          value={`${(extras?.staffAttPct ?? 0).toFixed(1)}%`}
          sub={`${extras?.staffAttSampled ?? 0} marked`}
          href="/hr/attendance"
        />
        <MiniCard
          icon={MessageSquareWarning}
          label="Open complaints"
          value={String(extras?.openComplaints ?? 0)}
          sub="awaiting response"
          href="/complaints"
          tint="text-amber-600"
        />
        <MiniCard
          icon={Briefcase}
          label="Open positions"
          value={String(extras?.openJobs ?? 0)}
          sub="recruitment"
          href="/hr/recruitment"
        />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
        <Card className="p-4 rounded-2xl lg:col-span-2">
          <div className="flex items-center justify-between mb-2">
            <div className="font-medium">Revenue vs Expenses (6 months)</div>
            <div className="text-xs text-muted-foreground">
              Successful payments vs operating expenses
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend ?? []} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="label" fontSize={12} />
                <YAxis
                  fontSize={12}
                  tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                  width={60}
                />
                <Tooltip formatter={(v: any) => money(Number(v))} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  name="Revenue"
                />
                <Line
                  type="monotone"
                  dataKey="expenses"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  name="Expenses"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-4 rounded-2xl">
          <div className="font-medium mb-2">Payment modes (month)</div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={paymentMix}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={80}
                  innerRadius={45}
                  label={(e: any) => e.name}
                >
                  {paymentMix.map((_, i) => (
                    <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: any) => money(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <Card className="p-4 rounded-2xl">
          <div className="font-medium mb-2">Fee collection by grade</div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byGrade ?? []}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="grade" fontSize={11} />
                <YAxis
                  fontSize={11}
                  tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                  width={60}
                />
                <Tooltip formatter={(v: any) => money(Number(v))} />
                <Legend />
                <Bar dataKey="collected" stackId="a" fill="#10b981" name="Collected" />
                <Bar dataKey="outstanding" stackId="a" fill="#ef4444" name="Outstanding" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-4 rounded-2xl">
          <div className="font-medium mb-2">Enrollment by grade</div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={enrollByGrade ?? []}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="grade" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Bar dataKey="count" fill="#3b82f6" radius={[6, 6, 0, 0]} name="Students" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Charts row 3 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <Card className="p-4 rounded-2xl">
          <div className="font-medium mb-2">Staff composition</div>
          <div className="h-64 grid grid-cols-2 gap-2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={staffMix?.teaching ?? []}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={70}
                  innerRadius={38}
                  label={(e: any) => `${e.name} ${e.value}`}
                >
                  {(staffMix?.teaching ?? []).map((_, i) => (
                    <Cell key={i} fill={DONUT_COLORS[i]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={staffMix?.byDept ?? []}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={70}
                  innerRadius={38}
                >
                  {(staffMix?.byDept ?? []).map((_, i) => (
                    <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-4 rounded-2xl">
          <div className="font-medium mb-2">Attendance (last 30 days)</div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={attTrend ?? []}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="date" fontSize={10} />
                <YAxis fontSize={11} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                <Tooltip formatter={(v: any) => `${v}%`} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="students"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  name="Students"
                />
                <Line
                  type="monotone"
                  dataKey="staff"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  dot={false}
                  name="Staff"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Info panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4 mb-6">
        <Card className="p-4 rounded-2xl">
          <div className="flex items-center justify-between mb-3">
            <div className="font-medium flex items-center gap-2">
              <CalendarDays className="size-4 text-primary" />
              Upcoming holidays
            </div>
            <Link to="/holidays" className="text-xs text-primary hover:underline">
              All
            </Link>
          </div>
          <ul className="space-y-2 text-sm">
            {(upcoming ?? []).map((h: any) => (
              <li
                key={h.id}
                className="flex items-center justify-between border-b last:border-0 pb-2 last:pb-0"
              >
                <div>
                  <div className="font-medium">{h.name}</div>
                  <div className="text-xs text-muted-foreground capitalize">{h.type}</div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {format(new Date(h.start_date), "d MMM")}
                </div>
              </li>
            ))}
            {(!upcoming || upcoming.length === 0) && (
              <li className="text-sm text-muted-foreground">No upcoming holidays.</li>
            )}
          </ul>
        </Card>

        <Card className="p-4 rounded-2xl">
          <div className="flex items-center justify-between mb-3">
            <div className="font-medium flex items-center gap-2">
              <AlertTriangle className="size-4 text-amber-600" />
              Top fee defaulters
            </div>
            <Link to="/fees" className="text-xs text-primary hover:underline">
              View all
            </Link>
          </div>
          <ul className="space-y-2 text-sm">
            {(defaulters ?? []).map((d: any) => (
              <li
                key={d.id}
                className="flex items-center justify-between border-b last:border-0 pb-2 last:pb-0"
              >
                <div>
                  <div className="font-medium truncate">{d.name}</div>
                  <div className="text-xs text-muted-foreground">{d.days} days overdue</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="font-semibold text-amber-700">{money(d.amount)}</div>
                  <Button asChild size="sm" variant="outline" className="h-7 px-2">
                    <Link to="/communication">
                      <Send className="size-3" />
                    </Link>
                  </Button>
                </div>
              </li>
            ))}
            {(!defaulters || defaulters.length === 0) && (
              <li className="text-sm text-muted-foreground">No overdue accounts.</li>
            )}
          </ul>
        </Card>

        <Card className="p-4 rounded-2xl">
          <div className="flex items-center justify-between mb-3">
            <div className="font-medium flex items-center gap-2">
              <Activity className="size-4 text-primary" />
              Recent activity
            </div>
          </div>
          <ul className="space-y-2 text-sm max-h-72 overflow-auto">
            {(activity ?? []).map((a, i) => (
              <li
                key={i}
                className="flex items-start justify-between gap-2 border-b last:border-0 pb-2 last:pb-0"
              >
                <div className={`text-sm ${a.tone}`}>{a.text}</div>
                <div className="text-[11px] text-muted-foreground whitespace-nowrap">
                  {format(new Date(a.at), "d MMM HH:mm")}
                </div>
              </li>
            ))}
            {(!activity || activity.length === 0) && (
              <li className="text-sm text-muted-foreground">No recent activity.</li>
            )}
          </ul>
        </Card>
      </div>
    </>
  );
}

function MiniCard({
  icon: Icon,
  label,
  value,
  sub,
  href,
  tint,
}: {
  icon: any;
  label: string;
  value: string;
  sub?: string;
  href?: string;
  tint?: string;
}) {
  const body = (
    <Card className="p-4 rounded-2xl hover:shadow-md transition h-full">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">{label}</div>
        <Icon className={`size-4 ${tint ?? "text-primary"}`} />
      </div>
      <div className={`text-2xl font-semibold mt-1 ${tint ?? ""}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>}
    </Card>
  );
  return href ? (
    <Link to={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

function QuickAction({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: typeof UserPlus;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="rounded-2xl bg-card border p-5 hover:shadow-md hover:-translate-y-0.5 transition flex flex-col items-center gap-2"
    >
      <Icon className="size-5 text-primary" />
      <span className="text-sm font-medium">{label}</span>
    </Link>
  );
}

function TeacherDashboard({ fullName }: { fullName: string }) {
  return <TeacherDashboardView fullName={fullName} />;
}

const EMPLOYEE_ID_MAP: Record<string, { empId: string; designation: string }> = {
  "anjali.nair@school.edu": { empId: "TCH-1008", designation: "Mathematics Teacher" },
};

function TeacherDashboardView({ fullName }: { fullName: string }) {
  const { user } = useCurrentUser();
  const { data } = useQuery({
    enabled: !!user,
    queryKey: ["teacher-dash", user?.id],
    queryFn: async () => {
      const today = format(new Date(), "yyyy-MM-dd");
      const { data: tc } = await supabase
        .from("teacher_classes")
        .select("class_id, classes(id, name, section)")
        .eq("teacher_id", user!.id);
      const classIds = (tc ?? []).map((r) => r.class_id);
      const classes = (tc ?? []).map((r: any) => r.classes).filter(Boolean);

      const [
        subjRes,
        studRes,
        ttRes,
        annRes,
        hwRes,
        hwByClassRes,
        examRes,
        attTodayRes,
        teacherRes,
      ] = await Promise.all([
        classIds.length
          ? supabase
              .from("subjects")
              .select("id,name,class_id,classes(name,section)")
              .in("class_id", classIds)
          : Promise.resolve({ data: [] as any[] }),
        classIds.length
          ? supabase.from("students").select("id, class_id, gender").in("class_id", classIds)
          : Promise.resolve({ data: [] as any[] }),
        classIds.length
          ? supabase
              .from("timetable")
              .select(
                "id, day_of_week, start_time, end_time, room, class_id, subjects(name), classes(name, section)",
              )
              .eq("teacher_id", user!.id)
              .order("start_time")
          : Promise.resolve({ data: [] as any[] }),
        supabase
          .from("announcements")
          .select("id,title,body,created_at")
          .order("created_at", { ascending: false })
          .limit(4),
        supabase
          .from("homework")
          .select("id", { count: "exact", head: true })
          .eq("teacher_id", user!.id)
          .eq("status", "active"),
        classIds.length
          ? supabase
              .from("homework")
              .select("class_id")
              .eq("teacher_id", user!.id)
              .eq("status", "active")
          : Promise.resolve({ data: [] as any[] }),
        classIds.length
          ? supabase
              .from("exams")
              .select("id,name,exam_date,class_id,classes(name,section)")
              .in("class_id", classIds)
              .gte("exam_date", today)
              .order("exam_date")
          : Promise.resolve({ data: [] as any[] }),
        classIds.length
          ? supabase
              .from("attendance")
              .select("class_id")
              .in("class_id", classIds)
              .eq("date", today)
          : Promise.resolve({ data: [] as any[] }),
        supabase
          .from("teachers" as never)
          .select("full_name,email,subject,status,phone,qualification")
          .eq("email", user!.email ?? "")
          .maybeSingle(),
      ]);

      const todayDow = new Date().getDay();
      const todaySchedule = (ttRes.data ?? []).filter((t: any) => t.day_of_week === todayDow);
      const attendedClassIds = new Set(((attTodayRes.data as any[]) ?? []).map((r) => r.class_id));
      const attendancePending = classIds.filter((id) => !attendedClassIds.has(id)).length;

      const teacherSubject = (teacherRes as any).data?.subject as string | undefined;
      const allSubjects = (subjRes.data ?? []) as any[];
      const mySubjects = teacherSubject
        ? allSubjects.filter((s) => (s.name ?? "").toLowerCase() === teacherSubject.toLowerCase())
        : allSubjects;

      const students = (studRes.data ?? []) as any[];
      const hwByClass = (hwByClassRes.data ?? []) as { class_id: string }[];
      const examsByClass = (examRes.data ?? []) as any[];

      const classStats = classes.map((c: any) => {
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
          homeworkPending: hwByClass.filter((h) => h.class_id === c.id).length,
          upcomingExams: examsByClass.filter((e) => e.class_id === c.id).length,
        };
      });

      return {
        classes,
        classStats,
        classCount: classIds.length,
        subjects: mySubjects,
        subjectCount: mySubjects.length,
        studentCount: students.length,
        todaySchedule,
        announcements: annRes.data ?? [],
        homeworkPending: (hwRes as any).count ?? 0,
        upcomingExams: examsByClass,
        attendancePending,
        teacher: (teacherRes as any).data ?? null,
      };
    },
  });

  const first = fullName.split(" ")[0];
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const periodStatus = (start: string, end: string): { label: string; cls: string } => {
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    const s = sh * 60 + sm;
    const e = eh * 60 + em;
    if (nowMin < s) return { label: "Upcoming", cls: "bg-sky-100 text-sky-700 border-sky-200" };
    if (nowMin >= s && nowMin <= e)
      return { label: "Ongoing", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" };
    return { label: "Completed", cls: "bg-muted text-muted-foreground border-border" };
  };
  const todayCount = data?.todaySchedule.length ?? 0;
  const identity = EMPLOYEE_ID_MAP[user?.email ?? ""] ?? {
    empId: "TCH-" + (user?.id ?? "").slice(0, 4).toUpperCase(),
    designation: data?.teacher?.subject ? `${data.teacher.subject} Teacher` : "Teacher",
  };

  return (
    <>
      <PageHeader
        title={`Welcome ${first}`}
        subtitle={`You have ${todayCount} class${todayCount === 1 ? "" : "es"} scheduled today.`}
      />

      <SelfAttendanceCard />

      {/* Profile + KPIs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="rounded-2xl p-6 lg:col-span-1 bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20">
          <div className="flex items-start gap-4">
            <div className="size-14 rounded-2xl bg-primary text-primary-foreground grid place-items-center text-xl font-semibold">
              {fullName
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-display text-lg font-semibold truncate">{fullName}</div>
              <div className="text-xs text-muted-foreground">
                {identity.empId} · {identity.designation}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Badge
                  variant="secondary"
                  className="bg-emerald-100 text-emerald-700 border-0 capitalize"
                >
                  {data?.teacher?.status ?? "active"}
                </Badge>
                {data?.teacher?.qualification && (
                  <span className="text-[11px] text-muted-foreground truncate">
                    {data.teacher.qualification}
                  </span>
                )}
              </div>
            </div>
          </div>
        </Card>
        <div className="lg:col-span-2 grid grid-cols-2 gap-4">
          <StatCard
            label="My Subjects"
            value={String(data?.subjectCount ?? 0)}
            subtitle="assigned"
            tone="sky"
          />
          <StatCard
            label="My Classes"
            value={String(data?.classCount ?? 0)}
            subtitle="teaching"
            tone="indigo"
          />
          <StatCard
            label="Total Students"
            value={String(data?.studentCount ?? 0)}
            subtitle="in your classes"
            tone="violet"
          />
          <StatCard
            label="Periods Today"
            value={String(todayCount)}
            subtitle="scheduled"
            tone="coral"
          />
        </div>
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
        <Card className="rounded-2xl p-5">
          <div className="text-xs text-muted-foreground">Attendance Pending</div>
          <div className="font-display text-3xl font-semibold mt-1">
            {data?.attendancePending ?? 0}{" "}
            <span className="text-sm font-normal text-muted-foreground">classes</span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">not marked today</div>
        </Card>
        <Card className="rounded-2xl p-5">
          <div className="text-xs text-muted-foreground">Assignments Pending Review</div>
          <div className="font-display text-3xl font-semibold mt-1">
            {data?.homeworkPending ?? 0}
          </div>
          <div className="text-xs text-muted-foreground mt-1">active homework</div>
        </Card>
        <Card className="rounded-2xl p-5">
          <div className="text-xs text-muted-foreground">Upcoming Exams</div>
          <div className="font-display text-3xl font-semibold mt-1">
            {data?.upcomingExams.length ?? 0}
          </div>
          <div className="text-xs text-muted-foreground mt-1">scheduled next</div>
        </Card>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
        <QuickAction to="/attendance" icon={ClipboardCheck} label="Mark Attendance" />
        <QuickAction to="/gradebook" icon={BookOpenCheck} label="Enter Marks" />
        <QuickAction to="/students" icon={GraduationCap} label="My Students" />
        <QuickAction to="/timetable" icon={CalendarDays} label="My Timetable" />
      </div>

      {/* Today's schedule with status + subjects/classes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        <Card className="rounded-2xl p-5 lg:col-span-2">
          <div className="font-display font-semibold mb-4">Today's Schedule</div>
          <div className="space-y-2">
            {todayCount === 0 && (
              <div className="rounded-xl border border-dashed py-12 text-center text-muted-foreground">
                <Clock className="size-6 mx-auto mb-2 opacity-60" />
                <div className="font-medium">No classes today</div>
                <div className="text-xs">Enjoy the day off.</div>
              </div>
            )}
            {(data?.todaySchedule ?? []).map((t: any, idx: number) => {
              const st = periodStatus(t.start_time, t.end_time);
              return (
                <div key={t.id} className="flex items-center gap-3 rounded-xl border p-3">
                  <div className="rounded-lg bg-secondary size-10 grid place-items-center text-xs font-semibold">
                    P{idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">
                      {t.subjects?.name ?? "Class"} · {t.classes?.name}
                      {t.classes?.section && ` - ${t.classes.section}`}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5">
                      <span className="flex items-center gap-1">
                        <Clock className="size-3" /> {t.start_time?.slice(0, 5)} –{" "}
                        {t.end_time?.slice(0, 5)}
                      </span>
                      {t.room && (
                        <span className="flex items-center gap-1">
                          <MapPin className="size-3" /> {t.room}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={`text-[11px] px-2 py-1 rounded-md border ${st.cls}`}>
                    {st.label}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="rounded-2xl p-5">
            <div className="font-display font-semibold mb-3">My Subjects</div>
            <ul className="space-y-2 text-sm">
              {(data?.subjects ?? []).map((s: any) => (
                <li key={s.id} className="flex items-center justify-between gap-3 min-w-0">
                  <span className="font-medium truncate">{s.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {s.classes?.name}
                    {s.classes?.section && ` · ${s.classes.section}`}
                  </span>
                </li>
              ))}
              {(data?.subjects ?? []).length === 0 && (
                <li className="text-sm text-muted-foreground">No subjects assigned.</li>
              )}
            </ul>
          </Card>
          <Card className="rounded-2xl p-5">
            <div className="font-display font-semibold mb-3">My Classes</div>
            <div className="space-y-3">
              {(data?.classStats ?? []).length === 0 && (
                <div className="text-sm text-muted-foreground">No classes assigned.</div>
              )}
              {(data?.classStats ?? []).map((c: any) => (
                <div key={c.id} className="rounded-xl border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-sm">
                      {c.name}
                      {c.section && ` · ${c.section}`}
                    </div>
                    <Badge variant="secondary" className="text-[10px]">
                      {c.subject}
                    </Badge>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-muted-foreground">
                    <div>
                      <div className="font-semibold text-foreground text-sm">{c.total}</div>Students
                    </div>
                    <div>
                      <div className="font-semibold text-foreground text-sm">{c.boys}</div>Boys
                    </div>
                    <div>
                      <div className="font-semibold text-foreground text-sm">{c.girls}</div>Girls
                    </div>
                    <div>
                      <div
                        className={`font-semibold text-sm ${c.attendanceMarked ? "text-emerald-600" : "text-amber-600"}`}
                      >
                        {c.attendanceMarked ? "Marked" : "Pending"}
                      </div>
                      Attendance
                    </div>
                    <div>
                      <div className="font-semibold text-foreground text-sm">
                        {c.homeworkPending}
                      </div>
                      Homework
                    </div>
                    <div>
                      <div className="font-semibold text-foreground text-sm">{c.upcomingExams}</div>
                      Exams
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Upcoming exams + Announcements */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <Card className="rounded-2xl p-5">
          <div className="font-display font-semibold mb-3">Upcoming Exams</div>
          <div className="space-y-2">
            {(data?.upcomingExams ?? []).length === 0 && (
              <div className="text-sm text-muted-foreground">No exams scheduled.</div>
            )}
            {(data?.upcomingExams ?? []).map((e: any) => (
              <div key={e.id} className="flex items-center justify-between border rounded-xl p-3">
                <div>
                  <div className="font-medium text-sm">{e.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {e.classes?.name}
                    {e.classes?.section && ` · ${e.classes.section}`}
                  </div>
                </div>
                <div className="text-xs font-medium text-primary">
                  {format(new Date(e.exam_date), "MMM d")}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="rounded-2xl p-5">
          <div className="font-display font-semibold mb-3">Announcements</div>
          <div className="space-y-2">
            {(data?.announcements ?? []).length === 0 && (
              <div className="text-sm text-muted-foreground">No announcements.</div>
            )}
            {(data?.announcements ?? []).map((a: any) => (
              <div key={a.id} className="border-l-2 border-primary pl-3">
                <div className="font-medium text-sm">{a.title}</div>
                <div className="text-xs text-muted-foreground line-clamp-2">{a.body}</div>
                <div className="text-[10px] text-muted-foreground mt-1">
                  {format(new Date(a.created_at), "MMM d, yyyy")}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}

function StudentDashboard({ userId, fullName }: { userId: string; fullName: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["student-dash", userId],
    queryFn: async () => {
      const { data: student } = await supabase
        .from("students")
        .select("id, roll_no, admission_no, class_id, classes(name, section, academic_year)")
        .eq("profile_id", userId)
        .maybeSingle();
      if (!student) return null;

      const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
      const weekStartStr = format(weekStart, "yyyy-MM-dd");
      const termStart = format(addDays(new Date(), -120), "yyyy-MM-dd");
      const today = format(new Date(), "yyyy-MM-dd");

      const [attRes, resRes, ttRes, annRes, hwRes, subjRes, examRes] = await Promise.all([
        supabase
          .from("attendance")
          .select("date,status")
          .eq("student_id", student.id)
          .gte("date", termStart)
          .order("date"),
        supabase
          .from("exam_results")
          .select("marks_obtained, exams(max_marks, name)")
          .eq("student_id", student.id),
        student.class_id
          ? supabase
              .from("timetable")
              .select("id, day_of_week, start_time, end_time, room, subjects(name)")
              .eq("class_id", student.class_id)
              .order("start_time")
          : Promise.resolve({ data: [] as any[] }),
        supabase
          .from("announcements")
          .select("id,title,body,created_at")
          .order("created_at", { ascending: false })
          .limit(4),
        student.class_id
          ? supabase
              .from("homework")
              .select("id,title,due_date,priority,subject_id,subjects(name)")
              .eq("class_id", student.class_id)
          : Promise.resolve({ data: [] as any[] }),
        student.class_id
          ? supabase.from("subjects").select("id,name").eq("class_id", student.class_id)
          : Promise.resolve({ data: [] as any[] }),
        student.class_id
          ? supabase
              .from("exams")
              .select("id,name,exam_date,subjects(name)")
              .eq("class_id", student.class_id)
              .gte("exam_date", today)
              .order("exam_date")
              .limit(5)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const attendance = attRes.data ?? [];
      const presentDays = attendance.filter(
        (a) => a.status === "present" || a.status === "late",
      ).length;
      const totalDays = attendance.length;
      const attendancePct = totalDays ? Math.round((presentDays / totalDays) * 100) : 0;

      const weekBars = Array.from({ length: 5 }, (_, i) => {
        const day = addDays(weekStart, i);
        const rec = attendance.find((a) => isSameDay(new Date(a.date), day));
        const pct = rec ? (rec.status === "present" ? 100 : rec.status === "late" ? 60 : 0) : 0;
        return { label: format(day, "EEE"), pct, status: rec?.status ?? null };
      });

      const results = resRes.data ?? [];
      const avgPct = results.length
        ? Math.round(
            results.reduce(
              (s: number, r: any) =>
                s + (Number(r.marks_obtained) / Number(r.exams?.max_marks || 100)) * 100,
              0,
            ) / results.length,
          )
        : 0;

      const todayDow = new Date().getDay();
      const todayClasses = (ttRes.data ?? []).filter((t: any) => t.day_of_week === todayDow);

      // Homework aggregates
      const homework = (hwRes.data ?? []) as any[];
      const hwIds = homework.map((h) => h.id);
      const { data: subs } = hwIds.length
        ? await supabase
            .from("homework_submissions")
            .select("homework_id,status")
            .in("homework_id", hwIds)
            .eq("student_id", student.id)
        : { data: [] as any[] };
      const subMap = new Map((subs ?? []).map((s: any) => [s.homework_id, s.status]));
      let pendingHw = 0,
        overdueHw = 0,
        completedHw = 0;
      for (const h of homework) {
        const st = subMap.get(h.id);
        if (st === "submitted" || st === "reviewed") completedHw += 1;
        else if (st === "overdue" || new Date(h.due_date) < new Date(today)) overdueHw += 1;
        else pendingHw += 1;
      }

      return {
        student,
        attendancePct,
        presentDays,
        totalDays,
        weekBars,
        avgPct,
        examCount: results.length,
        todayClasses,
        announcements: annRes.data ?? [],
        subjectsCount: (subjRes.data ?? []).length,
        pendingHw,
        overdueHw,
        completedHw,
        upcomingExams: (examRes.data ?? []) as any[],
      };
    },
  });

  const first = fullName.split(" ")[0];
  const cls = data?.student?.classes as any;
  const gradeLine = cls
    ? `${cls.name}${cls.section ? ` - ${cls.section}` : ""} · keep up the great work!`
    : "keep up the great work!";
  const yr = cls?.academic_year ?? `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;

  if (isLoading || !data) {
    return (
      <>
        <PageHeader title={`Welcome ${first}`} subtitle={gradeLine} />
        <Card className="p-8 rounded-2xl text-muted-foreground">Loading your dashboard…</Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title={`Welcome ${first}`} subtitle={gradeLine} />
      {/* Quick stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        <MiniStat label="Today's Classes" value={String(data.todayClasses.length)} tone="sky" />
        <MiniStat label="Subjects" value={String(data.subjectsCount)} tone="indigo" />
        <MiniStat label="Pending" value={String(data.pendingHw)} tone="violet" />
        <MiniStat label="Overdue" value={String(data.overdueHw)} tone="coral" />
        <MiniStat label="Upcoming Tests" value={String(data.upcomingExams.length)} tone="indigo" />
        <MiniStat label="Attendance" value={`${data.attendancePct}%`} tone="sky" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl overflow-hidden relative min-h-[240px] bg-[oklch(0.9_0.08_240)] p-6">
          <div className="absolute top-4 right-4 rounded-xl bg-white/85 backdrop-blur px-4 py-2 flex items-center gap-2">
            <CalendarPlus className="size-4 text-primary" />
            <div className="text-xs">
              <div className="text-muted-foreground">Academic Year</div>
              <div className="font-semibold">{yr}</div>
            </div>
          </div>
          <svg
            viewBox="0 0 400 200"
            className="absolute bottom-0 left-0 w-full"
            preserveAspectRatio="none"
          >
            <path
              d="M0,150 Q100,90 200,120 T400,110 L400,200 L0,200 Z"
              fill="oklch(0.75 0.15 145)"
              opacity="0.7"
            />
            <path
              d="M0,170 Q100,130 200,150 T400,140 L400,200 L0,200 Z"
              fill="oklch(0.65 0.15 145)"
            />
            <circle cx="320" cy="60" r="16" fill="oklch(0.85 0.15 80)" />
            <polygon points="120,155 130,130 140,155" fill="oklch(0.45 0.15 275)" />
            <polygon points="260,158 270,128 280,158" fill="oklch(0.45 0.15 275)" />
            <circle cx="180" cy="150" r="6" fill="oklch(0.6 0.15 25)" />
            <rect x="177" y="150" width="6" height="15" fill="oklch(0.5 0.15 275)" />
            <circle cx="210" cy="145" r="6" fill="oklch(0.55 0.15 240)" />
            <rect x="207" y="145" width="6" height="18" fill="oklch(0.55 0.15 240)" />
          </svg>
        </div>
        <div className="grid grid-cols-1 gap-4">
          <StatCard
            label="Attendance"
            value={`${data.attendancePct}%`}
            subtitle={`${data.presentDays}/${data.totalDays} days`}
            tone="sky"
          />
          <StatCard
            label="Avg Score"
            value={`${data.avgPct}%`}
            subtitle="across exams"
            tone="indigo"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <StatCard
          label="Exams Taken"
          value={String(data.examCount)}
          subtitle="this term"
          tone="violet"
        />
        <StatCard
          label="Roll No"
          value={data.student?.roll_no ?? data.student?.admission_no ?? "—"}
          subtitle={cls ? `${cls.name}${cls.section ? `-${cls.section}` : ""}` : ""}
          tone="coral"
        />
      </div>

      {/* Assignments + Upcoming Tests */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <Card className="rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="font-display font-semibold">Daily Tasks</div>
            <Link to="/assignments" className="text-sm text-primary">
              View all
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl border p-3">
              <div className="text-2xl font-display font-semibold">{data.pendingHw}</div>
              <div className="text-xs text-muted-foreground">Pending</div>
            </div>
            <div className="rounded-xl border p-3">
              <div className="text-2xl font-display font-semibold text-destructive">
                {data.overdueHw}
              </div>
              <div className="text-xs text-muted-foreground">Overdue</div>
            </div>
            <div className="rounded-xl border p-3">
              <div className="text-2xl font-display font-semibold text-primary">
                {data.completedHw}
              </div>
              <div className="text-xs text-muted-foreground">Completed</div>
            </div>
          </div>
        </Card>
        <Card className="rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="font-display font-semibold">Upcoming Tests</div>
            <Badge variant="secondary">{data.upcomingExams.length}</Badge>
          </div>
          <div className="space-y-2">
            {data.upcomingExams.length === 0 && (
              <div className="text-sm text-muted-foreground py-4 text-center">
                No tests scheduled.
              </div>
            )}
            {data.upcomingExams.map((e: any) => (
              <div key={e.id} className="flex items-center justify-between rounded-xl border p-3">
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{e.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {e.subjects?.name ?? "General"}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground shrink-0">
                  {format(new Date(e.exam_date), "MMM d")}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
        <Card className="rounded-2xl p-5">
          <div className="text-center font-display font-semibold mb-4">Attendance</div>
          <AttendanceDonut
            pct={data.attendancePct}
            present={data.presentDays}
            total={data.totalDays}
          />
        </Card>
        <Card className="rounded-2xl p-5 md:col-span-2">
          <div className="font-display font-semibold mb-4">My Attendance — this week</div>
          <WeekBars bars={data.weekBars} />
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <Card className="rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="font-display font-semibold">Today's Classes</div>
            <Link to="/classes" className="text-sm text-primary">
              Full timetable
            </Link>
          </div>
          <div className="space-y-2">
            {data.todayClasses.length === 0 && (
              <div className="text-sm text-muted-foreground py-6 text-center">
                No classes scheduled today.
              </div>
            )}
            {data.todayClasses.map((t: any) => (
              <div key={t.id} className="flex items-center gap-3 rounded-xl border p-3">
                <div className="rounded-lg bg-secondary size-10 grid place-items-center">
                  <Clock className="size-4 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="font-medium">{t.subjects?.name ?? "Class"}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <span>
                      {t.start_time?.slice(0, 5)} – {t.end_time?.slice(0, 5)}
                    </span>
                    {t.room && (
                      <span className="flex items-center gap-1">
                        <MapPin className="size-3" /> {t.room}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card className="rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="font-display font-semibold">Announcements</div>
            <Badge variant="secondary">ALL</Badge>
          </div>
          <div className="space-y-3">
            {data.announcements.length === 0 && (
              <div className="text-sm text-muted-foreground py-6 text-center">
                No announcements.
              </div>
            )}
            {data.announcements.map((a: any) => (
              <div key={a.id} className="border-l-2 border-primary pl-3">
                <div className="font-medium text-sm">{a.title}</div>
                <div className="text-xs text-muted-foreground line-clamp-2">{a.body}</div>
                <div className="text-[10px] text-muted-foreground mt-1">
                  {format(new Date(a.created_at), "MMM d, yyyy")}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}

function AttendanceDonut({ pct, present, total }: { pct: number; present: number; total: number }) {
  const r = 56;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <div className="relative size-40 mx-auto">
      <svg viewBox="0 0 140 140" className="size-40 -rotate-90">
        <circle cx="70" cy="70" r={r} fill="none" stroke="oklch(0.92 0.02 250)" strokeWidth="14" />
        <circle
          cx="70"
          cy="70"
          r={r}
          fill="none"
          stroke="oklch(0.75 0.15 55)"
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-display text-3xl font-semibold">{pct}%</div>
        <div className="text-xs text-muted-foreground">
          {present}/{total} days
        </div>
      </div>
    </div>
  );
}

function WeekBars({ bars }: { bars: { label: string; pct: number; status: string | null }[] }) {
  const max = 100;
  return (
    <div className="flex items-end gap-4 h-40 px-2">
      {bars.map((b) => (
        <div key={b.label} className="flex-1 flex flex-col items-center gap-2">
          <div className="text-xs text-muted-foreground">{b.pct}%</div>
          <div className="w-full bg-secondary rounded-full h-32 flex items-end overflow-hidden">
            <div
              className="w-full rounded-full transition-all"
              style={{
                height: `${(b.pct / max) * 100}%`,
                background:
                  b.status === "present"
                    ? "oklch(0.55 0.15 145)"
                    : b.status === "late"
                      ? "oklch(0.75 0.15 80)"
                      : b.status === "absent"
                        ? "oklch(0.65 0.2 25)"
                        : "oklch(0.55 0.15 275)",
              }}
            />
          </div>
          <div className="text-xs text-muted-foreground">{b.label}</div>
        </div>
      ))}
    </div>
  );
}

function ParentDashboard({ userId, fullName }: { userId: string; fullName: string }) {
  const inr = (n: number) =>
    `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const { data } = useQuery({
    queryKey: ["parent-dash", userId],
    queryFn: async () => {
      const { data: links } = await supabase
        .from("parent_student")
        .select("student_id")
        .eq("parent_id", userId);
      const ids = (links ?? []).map((l) => l.student_id);
      if (ids.length === 0) return { children: [], fees: [], attMap: {}, hwMap: {}, perfMap: {} };
      const since = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
        .toISOString()
        .slice(0, 10);
      const classIdsRes = await supabase
        .from("students")
        .select("id, admission_no, class_id, profiles(full_name), classes(name,section)")
        .in("id", ids);
      const kids = classIdsRes.data ?? [];
      const classIds = kids.map((k: any) => k.class_id).filter(Boolean);
      const [{ data: fees }, { data: att }, { data: hw }, { data: subs }, { data: results }] =
        await Promise.all([
          supabase
            .from("fee_assignments")
            .select("student_id, title, due_date, amount_due, amount_paid, status")
            .in("student_id", ids),
          supabase
            .from("attendance")
            .select("student_id,status,date")
            .in("student_id", ids)
            .gte("date", since),
          classIds.length
            ? supabase.from("homework").select("id,class_id,due_date")
            : Promise.resolve({ data: [] as any[] }),
          supabase
            .from("homework_submissions")
            .select("student_id,homework_id,submitted_at")
            .in("student_id", ids),
          supabase
            .from("exam_results")
            .select("student_id,marks_obtained,exams(max_marks)")
            .in("student_id", ids),
        ]);
      const attMap: Record<string, { total: number; present: number }> = {};
      for (const r of att ?? []) {
        const m = (attMap[r.student_id] ||= { total: 0, present: 0 });
        m.total += 1;
        if (r.status === "present" || r.status === "late") m.present += 1;
      }
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const hwMap: Record<
        string,
        { total: number; submitted: number; missed: number; pending: number }
      > = {};
      const subsByStudent: Record<string, Set<string>> = {};
      const subDates: Record<string, Map<string, string>> = {};
      for (const s of subs ?? []) {
        (subsByStudent[s.student_id] ||= new Set()).add(s.homework_id);
        (subDates[s.student_id] ||= new Map()).set(s.homework_id, s.submitted_at as any);
      }
      for (const k of kids as any[]) {
        const classHw = (hw ?? []).filter((h: any) => h.class_id === k.class_id);
        const submittedSet = subsByStudent[k.id] ?? new Set();
        let submitted = 0,
          missed = 0,
          pending = 0;
        for (const h of classHw) {
          const due = h.due_date ? new Date(h.due_date) : null;
          if (submittedSet.has(h.id)) submitted += 1;
          else if (due && due < today) missed += 1;
          else pending += 1;
        }
        hwMap[k.id] = { total: classHw.length, submitted, missed, pending };
      }
      const perfMap: Record<string, { got: number; max: number }> = {};
      for (const r of (results as any[]) ?? []) {
        const m = (perfMap[r.student_id] ||= { got: 0, max: 0 });
        m.got += Number(r.marks_obtained) || 0;
        m.max += Number(r.exams?.max_marks) || 0;
      }
      return { children: kids, fees: fees ?? [], attMap, hwMap, perfMap };
    },
  });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const fees = data?.fees ?? [];
  const children = data?.children ?? [];
  const totalAnnual = fees.reduce((s, f) => s + Number(f.amount_due), 0);
  const totalPaid = fees.reduce((s, f) => s + Number(f.amount_paid), 0);
  const outstanding = totalAnnual - totalPaid;
  const openItems = fees.filter((f) => f.status !== "paid");
  const overdue = openItems.filter((f) => new Date(f.due_date) < today);
  const overdueAmt = overdue.reduce((s, f) => s + Number(f.amount_due) - Number(f.amount_paid), 0);
  const next = openItems
    .filter((f) => new Date(f.due_date) >= today)
    .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())[0];

  return (
    <>
      <PageHeader
        title={`Hi ${fullName.split(" ")[0]}`}
        subtitle={`Family dashboard · ${children.length} child${children.length === 1 ? "" : "ren"}`}
      />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <StatCard label="Total annual" value={inr(totalAnnual)} tone="indigo" />
        <StatCard label="Total paid" value={inr(totalPaid)} tone="violet" />
        <StatCard label="Outstanding" value={inr(outstanding)} tone="coral" />
        <StatCard
          label="Upcoming"
          value={next ? inr(Number(next.amount_due) - Number(next.amount_paid)) : "—"}
          subtitle={next ? format(new Date(next.due_date), "MMM d") : "All clear"}
          tone="sky"
        />
        <StatCard label="Overdue" value={inr(overdueAmt)} tone="coral" />
        <StatCard
          label="Next due"
          value={next ? format(new Date(next.due_date), "MMM d") : "—"}
          tone="indigo"
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {children.map((child: any) => {
          const cf = fees.filter((f) => f.student_id === child.id);
          const cAnnual = cf.reduce((s, f) => s + Number(f.amount_due), 0);
          const cPaid = cf.reduce((s, f) => s + Number(f.amount_paid), 0);
          const cOut = cAnnual - cPaid;
          const cNext = cf
            .filter((f) => f.status !== "paid")
            .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())[0];
          const pct = cAnnual > 0 ? Math.round((cPaid / cAnnual) * 100) : 0;
          const att = data?.attMap[child.id];
          const attPct = att && att.total ? Math.round((att.present / att.total) * 100) : null;
          const hw = data?.hwMap[child.id];
          const perf = data?.perfMap[child.id];
          const perfPct = perf && perf.max ? Math.round((perf.got / perf.max) * 100) : null;
          return (
            <Card key={child.id} className="p-5 rounded-2xl">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="size-11 rounded-xl bg-stat-indigo text-stat-indigo-foreground grid place-items-center shrink-0">
                    <GraduationCap className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-display font-semibold truncate">
                      {child.profiles?.full_name}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      Adm. {child.admission_no || "—"}
                      {child.classes
                        ? ` · ${child.classes.name}${child.classes.section ? ` · ${child.classes.section}` : ""}`
                        : ""}
                    </div>
                  </div>
                </div>
                <Badge variant="secondary" className="shrink-0">
                  {pct}% paid
                </Badge>
              </div>
              {/* Academic widgets */}
              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="rounded-xl border p-3">
                  <div className="text-[10px] uppercase text-muted-foreground flex items-center gap-1">
                    <ClipboardCheck className="size-3" />
                    Attendance
                  </div>
                  <div
                    className={`font-semibold text-lg ${attPct == null ? "text-muted-foreground" : attPct >= 85 ? "text-emerald-600" : attPct >= 70 ? "text-amber-600" : "text-red-600"}`}
                  >
                    {attPct == null ? "—" : `${attPct}%`}
                  </div>
                  <div className="text-[10px] text-muted-foreground">this month</div>
                </div>
                <div className="rounded-xl border p-3">
                  <div className="text-[10px] uppercase text-muted-foreground flex items-center gap-1">
                    <BookOpenCheck className="size-3" />
                    Performance
                  </div>
                  <div className="font-semibold text-lg">
                    {perfPct == null ? "—" : `${perfPct}%`}
                  </div>
                  <div className="text-[10px] text-muted-foreground">across exams</div>
                </div>
                <div className="rounded-xl border p-3">
                  <div className="text-[10px] uppercase text-muted-foreground">Homework</div>
                  <div className="font-semibold text-lg">
                    <span className="text-emerald-600">{hw?.submitted ?? 0}</span>
                    <span className="text-muted-foreground mx-1">/</span>
                    <span className="text-red-600">{hw?.missed ?? 0}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground">done / missed</div>
                </div>
              </div>

              {/* Fee summary */}
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-secondary/60 p-2">
                  <div className="text-[10px] uppercase text-muted-foreground">Annual</div>
                  <div className="font-semibold text-sm">{inr(cAnnual)}</div>
                </div>
                <div className="rounded-xl bg-secondary/60 p-2">
                  <div className="text-[10px] uppercase text-muted-foreground">Paid</div>
                  <div className="font-semibold text-sm text-emerald-600">{inr(cPaid)}</div>
                </div>
                <div className="rounded-xl bg-secondary/60 p-2">
                  <div className="text-[10px] uppercase text-muted-foreground">Due</div>
                  <div className="font-semibold text-sm text-amber-600">{inr(cOut)}</div>
                </div>
              </div>
              {cNext && (
                <div className="mt-3 text-xs text-muted-foreground">
                  Next: <span className="font-medium text-foreground">{cNext.title}</span> ·{" "}
                  {inr(Number(cNext.amount_due) - Number(cNext.amount_paid))} due{" "}
                  {format(new Date(cNext.due_date), "MMM d, yyyy")}
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Link to="/children/$studentId" params={{ studentId: child.id }}>
                  <Badge variant="default" className="cursor-pointer">
                    Full report →
                  </Badge>
                </Link>
                <Link to="/fees">
                  <Badge variant="secondary" className="cursor-pointer">
                    Fees & pay →
                  </Badge>
                </Link>
              </div>
            </Card>
          );
        })}
        {children.length === 0 && (
          <Card className="p-8 rounded-2xl md:col-span-2 text-center text-muted-foreground">
            No children linked yet.{" "}
            <Link to="/children" className="underline">
              Link a child
            </Link>{" "}
            to see fees.
          </Card>
        )}
      </div>
    </>
  );
}

function SelfAttendanceCard() {
  const { user } = useCurrentUser();
  const qc = useQueryClient();
  const today = format(new Date(), "yyyy-MM-dd");

  const { data: teacher } = useQuery({
    queryKey: ["me-teacher-self", user?.id],
    enabled: !!user,
    queryFn: async () =>
      (
        await supabase
          .from("teachers")
          .select("id, email")
          .ilike("email", user!.email ?? "")
          .maybeSingle()
      ).data,
  });

  const { data: todayRow } = useQuery({
    queryKey: ["me-attn-today", teacher?.id, today],
    enabled: !!teacher,
    queryFn: async () =>
      (
        await supabase
          .from("teacher_attendance")
          .select("*")
          .eq("teacher_id", teacher!.id)
          .eq("date", today)
          .maybeSingle()
      ).data,
  });

  const markMut = useMutation({
    mutationFn: async (status: "present" | "half_day" | "wfh") => {
      const { error } = await supabase.from("teacher_attendance").insert({
        teacher_id: teacher!.id,
        date: today,
        status,
        marked_by: "self",
        marked_by_user: user!.id,
        check_in_time: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Attendance marked");
      qc.invalidateQueries({ queryKey: ["me-attn-today", teacher?.id, today] });
      qc.invalidateQueries({ queryKey: ["me-attn", teacher?.id] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to mark"),
  });

  if (!teacher) return null;

  const now = new Date();
  const pastCutoff = now.getHours() >= 10;

  if (todayRow) {
    const label =
      todayRow.status === "present"
        ? "Present"
        : todayRow.status === "half_day"
          ? "Half Day"
          : todayRow.status === "wfh"
            ? "Work From Home"
            : todayRow.status === "late"
              ? "Late"
              : todayRow.status === "absent"
                ? "Absent"
                : todayRow.status === "leave"
                  ? "Leave"
                  : String(todayRow.status);
    const time = todayRow.check_in_time
      ? new Date(todayRow.check_in_time).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;
    return (
      <Card className="rounded-2xl p-5 mb-4 border-emerald-200 bg-emerald-50/50">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="size-6 text-emerald-600" />
            <div>
              <div className="text-xs text-muted-foreground">Today · {today}</div>
              <div className="font-medium">
                Marked: {label}
                {time ? ` at ${time}` : ""}
              </div>
              {todayRow.marked_by && todayRow.marked_by !== "self" && (
                <div className="text-xs text-amber-700 mt-0.5">
                  Adjusted by {todayRow.marked_by}
                </div>
              )}
            </div>
          </div>
          <Badge className="bg-emerald-100 text-emerald-700 border-0">Locked for today</Badge>
        </div>
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl p-5 mb-4">
      {pastCutoff && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm px-3 py-2 mb-3">
          <AlertTriangle className="size-4" />
          You haven't marked today's attendance.
        </div>
      )}
      <div className="font-display font-semibold mb-1">Mark My Attendance</div>
      <div className="text-xs text-muted-foreground mb-3">
        Once per day · For Absent or Leave, apply through the Leave module.
      </div>
      <div className="flex gap-2 flex-wrap">
        <Button
          onClick={() => markMut.mutate("present")}
          disabled={markMut.isPending}
          className="gap-2"
        >
          <CheckCircle2 className="size-4" /> Present
        </Button>
        <Button
          onClick={() => markMut.mutate("half_day")}
          disabled={markMut.isPending}
          variant="outline"
          className="gap-2"
        >
          <Clock className="size-4" /> Half Day
        </Button>
        <Button
          onClick={() => markMut.mutate("wfh")}
          disabled={markMut.isPending}
          variant="outline"
          className="gap-2"
        >
          <Home className="size-4" /> Work From Home
        </Button>
      </div>
    </Card>
  );
}
