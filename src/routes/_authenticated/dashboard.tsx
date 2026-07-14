import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell, PageHeader } from "@/components/app-shell";
import { QueryError, StatCardsSkeleton } from "@/components/query-states";
import { useCurrentUser } from "@/hooks/use-current-user";
import { apiFetch, apiGet } from "@/lib/api/client";
import { CHART, CHART_SUCCESS, CHART_DANGER, CHART_INFO, chartColor } from "@/lib/chart";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { KpiTile, SectionLabel } from "@/components/dashboard/kpi";
import { inrShort } from "@/lib/money";
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
// Themed chart palette — resolves to --chart-1..5 and adapts to dark mode.
const DONUT_COLORS = CHART;

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
  const {
    data: dash,
    isLoading: dashLoading,
    isError: dashError,
    refetch: dashRefetch,
  } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: () => apiGet<any>("/reports/admin-dashboard"),
  });

  // Single comprehensive endpoint (ports the ~13 client-side aggregations).
  // Derive the original variable shapes so the JSX below is unchanged.
  const data = dash
    ? {
        studentCount: dash.studentCount,
        teacherCount: dash.teacherCount,
        staffCount: dash.staffCount,
        classCount: dash.classCount,
        dueTotal: dash.dueTotal,
        collectedMonth: dash.collectedMonth,
        pendingCount: dash.pendingCount,
      }
    : undefined;
  const extras = dash
    ? {
        expenseMonth: dash.expenseMonth,
        payrollMonth: dash.payrollMonth,
        openComplaints: dash.openComplaints,
        openJobs: dash.openJobs,
        attPct: dash.attPct,
        staffAttPct: dash.staffAttPct,
        attSampled: dash.attSampled,
        staffAttSampled: dash.staffAttSampled,
      }
    : undefined;
  const efficiency = dash?.efficiency as { thisPct: number; lastPct: number } | undefined;
  const trend = dash?.trend as any[] | undefined;
  const byGrade = dash?.byGrade as any[] | undefined;
  const enrollByGrade = dash?.enrollByGrade as any[] | undefined;
  const staffMix = dash?.staffMix as { teaching: any[]; byDept: any[] } | undefined;
  const attTrend = dash?.attTrend as any[] | undefined;
  const paymentMix = (dash?.paymentMix as any[] | undefined) ?? [];
  const upcoming = dash?.upcoming as any[] | undefined;
  const defaulters = dash?.defaulters as any[] | undefined;
  const activity = dash?.activity as { at: string; text: string; tone: string }[] | undefined;

  const netPosition =
    (data?.collectedMonth ?? 0) - (extras?.expenseMonth ?? 0) - (extras?.payrollMonth ?? 0);
  const netPositive = netPosition >= 0;
  const effDelta = (efficiency?.thisPct ?? 0) - (efficiency?.lastPct ?? 0);

  // KPI command-strip deltas & sparklines (period-over-period movement).
  const attPct = extras?.attPct ?? 0;
  const attDelta = attPct - (dash?.attYesterdayPct ?? 0);
  const prevMo = dash?.collectedPrevMonth ?? 0;
  const incomeDelta = prevMo ? (((data?.collectedMonth ?? 0) - prevMo) / prevMo) * 100 : null;
  const attSpark = (attTrend ?? []).slice(-14).map((d: any) => d.students as number);
  const incomeSpark = (trend ?? []).map((t: any) => t.revenue as number);
  const newStu = dash?.newStudentsMonth ?? 0;
  const newStf = dash?.newStaffMonth ?? 0;
  const leavesToday = dash?.leavesToday ?? 0;
  const pendingLeaves = dash?.pendingLeaves ?? 0;
  const collectedToday = dash?.collectedToday ?? 0;
  const collectedTodayCount = dash?.collectedTodayCount ?? 0;

  if (dashError) {
    return (
      <>
        <PageHeader
          title={`Welcome ${fullName.split(" ")[0]}`}
          subtitle="Overview of your school's operations."
        />
        <QueryError
          title="Couldn't load the dashboard"
          hint="The overview data didn't come through. Check your connection and retry."
          onRetry={dashRefetch}
        />
      </>
    );
  }

  if (dashLoading) {
    return (
      <>
        <PageHeader
          title={`Welcome ${fullName.split(" ")[0]}`}
          subtitle="Overview of your school's operations."
        />
        <div className="space-y-4">
          <StatCardsSkeleton count={3} />
          <StatCardsSkeleton count={3} />
          <StatCardsSkeleton count={4} />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={`Welcome ${fullName.split(" ")[0]}`}
        subtitle="Overview of your school's operations."
      />
      {/* KPI command strip — dense, analytics-driven, with deltas and live/critical chips. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <KpiTile
          label="Students"
          value={String(data?.studentCount ?? 0)}
          to="/students"
          delta={{
            text: `${newStu > 0 ? "+" : ""}${newStu}`,
            dir: newStu > 0 ? "up" : "flat",
            sub: "this month",
          }}
        />
        <KpiTile
          label="Staff"
          value={String(data?.staffCount ?? 0)}
          to="/hr/staff"
          delta={{
            text: `${newStf > 0 ? "+" : ""}${newStf}`,
            dir: newStf > 0 ? "up" : "flat",
            sub: "new joins",
          }}
        />
        <KpiTile
          label="Attendance"
          value={`${attPct.toFixed(1)}%`}
          to="/attendance-overview"
          spark={attSpark}
          delta={{
            text: `${Math.abs(attDelta).toFixed(1)} pts`,
            dir: attDelta >= 0 ? "up" : "down",
            sub: "vs yest",
          }}
        />
        <KpiTile
          label="Collected today"
          value={inrShort(collectedToday)}
          tone="violet"
          chip={{ label: "Live", tone: "live" }}
          delta={
            collectedTodayCount
              ? { text: String(collectedTodayCount), sub: "receipts" }
              : undefined
          }
        />
        <KpiTile
          label="Fees due"
          value={inrShort(data?.dueTotal ?? 0)}
          tone="coral"
          chip={{ label: "Critical", tone: "critical" }}
          delta={{ text: String(data?.pendingCount ?? 0), sub: "students" }}
        />
        <KpiTile
          label="Income (MTD)"
          value={inrShort(data?.collectedMonth ?? 0)}
          to="/finance"
          spark={incomeSpark}
          delta={
            incomeDelta != null
              ? {
                  text: `${Math.abs(incomeDelta).toFixed(0)}%`,
                  dir: incomeDelta >= 0 ? "up" : "down",
                  sub: "vs last mo",
                }
              : undefined
          }
        />
        <KpiTile
          label="Leaves today"
          value={String(leavesToday)}
          to="/hr/leave"
          delta={
            pendingLeaves
              ? { text: String(pendingLeaves), dir: "flat", sub: "pending" }
              : undefined
          }
        />
        <KpiTile
          label="Collection rate"
          value={`${(efficiency?.thisPct ?? 0).toFixed(0)}%`}
          to="/fees"
          delta={{
            text: `${Math.abs(effDelta).toFixed(1)} pts`,
            dir: effDelta >= 0 ? "up" : "down",
            sub: "vs last term",
          }}
        />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
        <QuickAction to="/users" icon={UserPlus} label="Add User" />
        <QuickAction to="/students" icon={GraduationCap} label="Admit Student" />
        <QuickAction to="/announcements" icon={Megaphone} label="Post Notice" />
        <QuickAction to="/holidays" icon={CalendarPlus} label="Add Holiday" />
      </div>

      {/* Extended metrics, grouped by domain so the grid isn't one undifferentiated wall. */}
      <SectionLabel>Finance</SectionLabel>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
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
      </div>

      <SectionLabel>Staff</SectionLabel>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <MiniCard
          icon={Users}
          label="Total Staff"
          value={String(data?.staffCount ?? 0)}
          sub="all categories"
          href="/hr/staff"
        />
        <MiniCard
          icon={CheckCircle2}
          label="Staff attendance"
          value={`${(extras?.staffAttPct ?? 0).toFixed(1)}%`}
          sub={`${extras?.staffAttSampled ?? 0} marked`}
          href="/hr/attendance"
        />
        <MiniCard
          icon={Briefcase}
          label="Open positions"
          value={String(extras?.openJobs ?? 0)}
          sub="recruitment"
          href="/hr/recruitment"
        />
      </div>

      <SectionLabel>Operations</SectionLabel>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <MiniCard
          icon={ClipboardCheck}
          label="Attendance today"
          value={`${(extras?.attPct ?? 0).toFixed(1)}%`}
          sub={`${extras?.attSampled ?? 0} marked`}
          href="/attendance-overview"
        />
        <MiniCard
          icon={MessageSquareWarning}
          label="Open complaints"
          value={String(extras?.openComplaints ?? 0)}
          sub="awaiting response"
          href="/complaints"
          tint="text-amber-600"
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
                  stroke={CHART_SUCCESS}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  name="Revenue"
                />
                <Line
                  type="monotone"
                  dataKey="expenses"
                  stroke={CHART_DANGER}
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
                <Bar dataKey="collected" stackId="a" fill={CHART_SUCCESS} name="Collected" />
                <Bar dataKey="outstanding" stackId="a" fill={CHART_DANGER} name="Outstanding" />
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
                <Bar dataKey="count" fill={CHART_INFO} radius={[6, 6, 0, 0]} name="Students" />
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
                    <Cell key={i} fill={chartColor(i)} />
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
                  stroke={CHART_INFO}
                  strokeWidth={2}
                  dot={false}
                  name="Students"
                />
                <Line
                  type="monotone"
                  dataKey="staff"
                  stroke={chartColor(4)}
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
    queryFn: () => apiGet<any>("/reports/teacher-dashboard"),
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
      const d = await apiGet<any>("/reports/student-dashboard");
      if (!d) return null;
      // Derive week bars + today's classes from the returned raw arrays
      // (same client-side computation as before).
      const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
      const attendance = (d.attendance ?? []) as { date: string; status: string }[];
      const weekBars = Array.from({ length: 5 }, (_, i) => {
        const day = addDays(weekStart, i);
        const rec = attendance.find((a) => isSameDay(new Date(a.date), day));
        const pct = rec ? (rec.status === "present" ? 100 : rec.status === "late" ? 60 : 0) : 0;
        return { label: format(day, "EEE"), pct, status: rec?.status ?? null };
      });
      const todayDow = new Date().getDay();
      const todayClasses = (d.timetable ?? []).filter((t: any) => t.day_of_week === todayDow);
      return { ...d, weekBars, todayClasses };
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
            <Link to="/timetable" className="text-sm text-primary">
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
    queryFn: () => apiGet<any>("/reports/parent-dashboard"),
  });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const fees = (data?.fees ?? []) as any[];
  const children = (data?.children ?? []) as any[];
  const totalAnnual = fees.reduce((s: number, f: any) => s + Number(f.amount_due), 0);
  const totalPaid = fees.reduce((s: number, f: any) => s + Number(f.amount_paid), 0);
  const outstanding = totalAnnual - totalPaid;
  const openItems = fees.filter((f: any) => f.status !== "paid");
  const overdue = openItems.filter((f: any) => new Date(f.due_date) < today);
  const overdueAmt = overdue.reduce(
    (s: number, f: any) => s + Number(f.amount_due) - Number(f.amount_paid),
    0,
  );
  const next = openItems
    .filter((f: any) => new Date(f.due_date) >= today)
    .sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())[0];

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
                <Link to="/students/$studentId" params={{ studentId: child.id }}>
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
            <Link to="/students" className="underline">
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

  const { data: self } = useQuery({
    queryKey: ["me-teacher-self", user?.id],
    enabled: !!user,
    queryFn: () => apiGet<{ teacher: { id: string } | null; today: any }>("/attendance/my-teacher"),
  });
  const teacher = self?.teacher ?? null;
  const todayRow = self?.today ?? null;

  const markMut = useMutation({
    mutationFn: async (status: "present" | "half_day" | "wfh") => {
      const res = await apiFetch("/attendance/mark-self", {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      if (!res) throw new Error("Not authenticated");
    },
    onSuccess: () => {
      toast.success("Attendance marked");
      qc.invalidateQueries({ queryKey: ["me-teacher-self", user?.id] });
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
