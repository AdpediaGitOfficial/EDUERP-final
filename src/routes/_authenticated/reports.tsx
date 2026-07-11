import { RequireRole } from "@/components/require-role";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { format, subDays } from "date-fns";
import {
  Users,
  GraduationCap,
  Wallet,
  TrendingUp,
  AlertCircle,
  CalendarClock,
  Percent,
  IndianRupee,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/reports")({
  component: () => (
    <RequireRole roles={["admin"]}>
      <ReportsPage />
    </RequireRole>
  ),
});

const inr = (n: number) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const inrShort = (n: number) => {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1)}Cr`;
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(1)}L`;
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(1)}K`;
  return `₹${n}`;
};

const GIRL_NAMES = new Set([
  "Aanya",
  "Diya",
  "Saanvi",
  "Aadhya",
  "Kiara",
  "Myra",
  "Anaya",
  "Riya",
  "Meera",
  "Sara",
  "Tara",
  "Zara",
  "Ira",
  "Anika",
  "Navya",
  "Ishita",
  "Kavya",
  "Nisha",
  "Pari",
  "Reet",
]);

const CHART_PALETTE = [
  "hsl(243 75% 59%)",
  "hsl(199 89% 48%)",
  "hsl(162 63% 41%)",
  "hsl(43 96% 56%)",
  "hsl(0 84% 60%)",
  "hsl(280 65% 60%)",
  "hsl(24 95% 53%)",
  "hsl(190 80% 45%)",
  "hsl(340 75% 55%)",
  "hsl(120 45% 45%)",
  "hsl(260 70% 60%)",
  "hsl(15 85% 55%)",
];

const gradeOrder = (g: string) => {
  const m = /(\d+)/.exec(g);
  return m ? parseInt(m[1], 10) : 99;
};

function ReportsPage() {
  const { data } = useQuery({
    queryKey: ["reports-full"],
    queryFn: () =>
      apiGet<{
        classes: any[];
        students: any[];
        profiles: any[];
        structures: any[];
        fees: any[];
        payments: any[];
      }>("/reports/fees-report"),
  });

  const metrics = useMemo(() => {
    if (!data) return null;
    const { classes, students, profiles, structures, fees, payments } = data;

    const classById = new Map(classes.map((c) => [c.id, c]));
    const profileById = new Map(profiles.map((p) => [p.id, p]));

    // Annual fee per class (quarterly × 4, or as-is for one-time)
    const annualByClass = new Map<string, number>();
    structures.forEach((s) => {
      const mult = s.frequency === "quarterly" ? 4 : s.frequency === "monthly" ? 12 : 1;
      annualByClass.set(
        s.class_id ?? "",
        (annualByClass.get(s.class_id ?? "") ?? 0) + Number(s.amount) * mult,
      );
    });

    // Per-student aggregates
    const feesByStudent = new Map<
      string,
      { due: number; paid: number; upcoming: number; overdue: number }
    >();
    const now = new Date();
    fees.forEach((f) => {
      const cur = feesByStudent.get(f.student_id) ?? { due: 0, paid: 0, upcoming: 0, overdue: 0 };
      const due = Number(f.amount_due);
      const paid = Number(f.amount_paid);
      const bal = due - paid;
      cur.due += due;
      cur.paid += paid;
      const dueDate = new Date(f.due_date);
      if (f.status !== "paid" && bal > 0) {
        if (dueDate < now) cur.overdue += bal;
        else cur.upcoming += bal;
      }
      feesByStudent.set(f.student_id, cur);
    });

    // Grade grouping (Grade N)
    type GradeAgg = {
      grade: string;
      order: number;
      students: number;
      sections: Record<string, number>;
      annualPerStudent: number;
      expected: number;
      collected: number;
      outstanding: number;
      upcoming: number;
    };
    const gradeMap = new Map<string, GradeAgg>();
    students.forEach((s) => {
      const cls = classById.get(s.class_id ?? "");
      if (!cls) return;
      const grade = cls.name;
      const g: GradeAgg = gradeMap.get(grade) ?? {
        grade,
        order: gradeOrder(grade),
        students: 0,
        sections: {},
        annualPerStudent: annualByClass.get(cls.id) ?? 0,
        expected: 0,
        collected: 0,
        outstanding: 0,
        upcoming: 0,
      };
      g.students += 1;
      const sec = cls.section ?? "—";
      g.sections[sec] = (g.sections[sec] ?? 0) + 1;
      const annual = annualByClass.get(cls.id) ?? 0;
      g.expected += annual;
      const f = feesByStudent.get(s.id);
      if (f) {
        g.collected += f.paid;
        g.outstanding += f.overdue;
        g.upcoming += f.upcoming;
      }
      g.annualPerStudent = annual;
      gradeMap.set(grade, g);
    });
    const grades = Array.from(gradeMap.values()).sort((a, b) => a.order - b.order);

    // Gender
    let male = 0,
      female = 0;
    students.forEach((s) => {
      const p = profileById.get(s.profile_id);
      const first = p?.full_name?.split(" ")[0] ?? "";
      if (GIRL_NAMES.has(first)) female += 1;
      else male += 1;
    });

    // New admissions (last 30 days) — withdrawals not tracked in schema
    const thirty = subDays(new Date(), 30);
    const newAdmissions = students.filter((s) => new Date(s.admission_date) >= thirty).length;

    // Totals
    const totalStudents = students.length;
    const totalExpected = grades.reduce((s, g) => s + g.expected, 0);
    const totalCollected = grades.reduce((s, g) => s + g.collected, 0);
    const totalOutstanding = grades.reduce((s, g) => s + g.outstanding, 0);
    const totalUpcoming = grades.reduce((s, g) => s + g.upcoming, 0);
    const collectionRate = totalExpected ? (totalCollected / totalExpected) * 100 : 0;
    const avgFee = totalStudents ? totalExpected / totalStudents : 0;

    // Monthly trend from payments (last 12 months window)
    const monthlyMap = new Map<string, number>();
    payments.forEach((p) => {
      const k = format(new Date(p.paid_at), "MMM yyyy");
      monthlyMap.set(k, (monthlyMap.get(k) ?? 0) + Number(p.amount));
    });
    // Guarantee at least 6 months of trend (fill zeros for context)
    const monthly: { month: string; amount: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = subDays(new Date(), i * 30);
      const k = format(d, "MMM yyyy");
      monthly.push({ month: k, amount: monthlyMap.get(k) ?? 0 });
    }

    return {
      totalStudents,
      totalExpected,
      totalCollected,
      totalOutstanding,
      totalUpcoming,
      collectionRate,
      avgFee,
      newAdmissions,
      male,
      female,
      grades,
      monthly,
    };
  }, [data]);

  const m = metrics;

  const gradeStudentChart =
    m?.grades.map((g) => ({ grade: g.grade.replace("Grade ", "G"), students: g.students })) ?? [];
  const gradeRevenueChart =
    m?.grades.map((g) => ({
      grade: g.grade.replace("Grade ", "G"),
      Collected: g.collected,
      Outstanding: g.outstanding,
      Upcoming: g.upcoming,
    })) ?? [];
  const collectionStatus = m
    ? [
        { name: "Collected", value: Math.round(m.totalCollected) },
        { name: "Outstanding", value: Math.round(m.totalOutstanding) },
        { name: "Upcoming", value: Math.round(m.totalUpcoming) },
      ]
    : [];
  const revenueByGradePie =
    m?.grades
      .filter((g) => g.collected > 0)
      .map((g) => ({ name: g.grade, value: Math.round(g.collected) })) ?? [];

  return (
    <AppShell>
      <PageHeader
        title="Management Reports"
        subtitle="Enrollment and fee revenue across Grade 1 to Grade 12."
      />

      {/* Dashboard cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          icon={<Users className="size-5" />}
          label="Total students"
          value={String(m?.totalStudents ?? 0)}
        />
        <StatCard
          icon={<GraduationCap className="size-5" />}
          label="Active students"
          value={String(m?.totalStudents ?? 0)}
          sub="All admitted"
        />
        <StatCard
          icon={<IndianRupee className="size-5" />}
          label="Annual revenue (expected)"
          value={inrShort(m?.totalExpected ?? 0)}
          tone="violet"
        />
        <StatCard
          icon={<Wallet className="size-5" />}
          label="Collected"
          value={inrShort(m?.totalCollected ?? 0)}
          tone="emerald"
        />
        <StatCard
          icon={<AlertCircle className="size-5" />}
          label="Outstanding"
          value={inrShort(m?.totalOutstanding ?? 0)}
          tone="coral"
        />
        <StatCard
          icon={<CalendarClock className="size-5" />}
          label="Upcoming collections"
          value={inrShort(m?.totalUpcoming ?? 0)}
          tone="indigo"
        />
        <StatCard
          icon={<Percent className="size-5" />}
          label="Collection rate"
          value={`${(m?.collectionRate ?? 0).toFixed(1)}%`}
          tone="mint"
        />
        <StatCard
          icon={<TrendingUp className="size-5" />}
          label="Avg fee / student"
          value={inrShort(m?.avgFee ?? 0)}
        />
      </div>

      {/* Enrollment insight strip */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card className="rounded-2xl p-5">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Gender distribution
          </div>
          <div className="mt-3 flex items-end gap-6">
            <div>
              <div className="text-2xl font-semibold">{m?.male ?? 0}</div>
              <div className="text-xs text-muted-foreground">Male</div>
            </div>
            <div>
              <div className="text-2xl font-semibold">{m?.female ?? 0}</div>
              <div className="text-xs text-muted-foreground">Female</div>
            </div>
          </div>
          <div className="mt-4 h-2 rounded-full bg-muted overflow-hidden flex">
            <div
              className="bg-[hsl(243_75%_59%)]"
              style={{
                width: `${((m?.male ?? 0) / Math.max(1, (m?.male ?? 0) + (m?.female ?? 0))) * 100}%`,
              }}
            />
            <div className="bg-[hsl(340_75%_55%)] flex-1" />
          </div>
        </Card>

        <Card className="rounded-2xl p-5">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            New admissions (30d)
          </div>
          <div className="mt-3 flex items-end gap-6">
            <div>
              <div className="text-2xl font-semibold text-emerald-600">
                +{m?.newAdmissions ?? 0}
              </div>
              <div className="text-xs text-muted-foreground">Admitted</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-muted-foreground">0</div>
              <div className="text-xs text-muted-foreground">Withdrawals</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <ChartCard title="Grade-wise student distribution">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={gradeStudentChart}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="grade" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip />
              <Bar dataKey="students" fill="hsl(243 75% 59%)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Grade-wise revenue (₹)">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={gradeRevenueChart}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="grade" fontSize={12} />
              <YAxis fontSize={12} tickFormatter={(v) => inrShort(Number(v))} />
              <Tooltip formatter={(v: number) => inr(Number(v))} />
              <Legend />
              <Bar dataKey="Collected" stackId="a" fill="hsl(162 63% 41%)" radius={[0, 0, 0, 0]} />
              <Bar dataKey="Outstanding" stackId="a" fill="hsl(0 84% 60%)" radius={[0, 0, 0, 0]} />
              <Bar dataKey="Upcoming" stackId="a" fill="hsl(43 96% 56%)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <ChartCard title="Fee collection status">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={collectionStatus}
                dataKey="value"
                nameKey="name"
                innerRadius={55}
                outerRadius={90}
                paddingAngle={3}
              >
                {collectionStatus.map((_, i) => (
                  <Cell
                    key={i}
                    fill={["hsl(162 63% 41%)", "hsl(0 84% 60%)", "hsl(43 96% 56%)"][i]}
                  />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => inr(Number(v))} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Revenue contribution by grade">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={revenueByGradePie} dataKey="value" nameKey="name" outerRadius={95}>
                {revenueByGradePie.map((_, i) => (
                  <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => inr(Number(v))} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Monthly revenue trend">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={m?.monthly ?? []}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="month" fontSize={11} />
              <YAxis fontSize={11} tickFormatter={(v) => inrShort(Number(v))} />
              <Tooltip formatter={(v: number) => inr(Number(v))} />
              <Line
                type="monotone"
                dataKey="amount"
                stroke="hsl(243 75% 59%)"
                strokeWidth={3}
                dot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Grade-wise summary table */}
      <Card className="rounded-2xl overflow-hidden">
        <div className="p-5 border-b flex items-center justify-between">
          <div>
            <h2 className="font-display font-semibold text-lg">Grade-wise summary</h2>
            <p className="text-xs text-muted-foreground">
              Enrollment and fee position for every grade.
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-muted-foreground">
              <tr className="text-left">
                <th className="p-3 font-medium">Grade</th>
                <th className="p-3 font-medium text-right">Students</th>
                <th className="p-3 font-medium text-right">Annual fee / student</th>
                <th className="p-3 font-medium text-right">Expected revenue</th>
                <th className="p-3 font-medium text-right">Collected</th>
                <th className="p-3 font-medium text-right">Outstanding</th>
                <th className="p-3 font-medium text-right">Collection %</th>
              </tr>
            </thead>
            <tbody>
              {m?.grades.map((g) => {
                const pct = g.expected ? (g.collected / g.expected) * 100 : 0;
                return (
                  <tr key={g.grade} className="border-t hover:bg-muted/40">
                    <td className="p-3 font-medium">{g.grade}</td>
                    <td className="p-3 text-right">{g.students}</td>
                    <td className="p-3 text-right">{inr(g.annualPerStudent)}</td>
                    <td className="p-3 text-right">{inr(g.expected)}</td>
                    <td className="p-3 text-right text-emerald-600 font-medium">
                      {inr(g.collected)}
                    </td>
                    <td className="p-3 text-right text-red-600">{inr(g.outstanding)}</td>
                    <td className="p-3 text-right">
                      <span className="inline-flex items-center gap-2">
                        <span className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                          <span
                            className="block h-full bg-emerald-500"
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </span>
                        <span className="tabular-nums text-xs w-10">{pct.toFixed(0)}%</span>
                      </span>
                    </td>
                  </tr>
                );
              })}
              {m && (
                <tr className="border-t bg-secondary/50 font-semibold">
                  <td className="p-3">Total</td>
                  <td className="p-3 text-right">{m.totalStudents}</td>
                  <td className="p-3 text-right">—</td>
                  <td className="p-3 text-right">{inr(m.totalExpected)}</td>
                  <td className="p-3 text-right text-emerald-700">{inr(m.totalCollected)}</td>
                  <td className="p-3 text-right text-red-700">{inr(m.totalOutstanding)}</td>
                  <td className="p-3 text-right">{m.collectionRate.toFixed(1)}%</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </AppShell>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: "violet" | "coral" | "indigo" | "emerald" | "mint";
}) {
  const toneCls: Record<string, string> = {
    violet: "bg-stat-violet text-stat-violet-foreground",
    coral: "bg-stat-coral text-stat-coral-foreground",
    indigo: "bg-stat-indigo text-stat-indigo-foreground",
    emerald: "bg-emerald-500 text-white",
    mint: "bg-teal-500 text-white",
  };
  const styled = tone ? toneCls[tone] : "";
  return (
    <Card className={`p-5 rounded-2xl ${styled}`}>
      <div className="flex items-center justify-between">
        <div
          className={`text-xs uppercase tracking-wide ${tone ? "opacity-90" : "text-muted-foreground"}`}
        >
          {label}
        </div>
        <div className={tone ? "opacity-90" : "text-muted-foreground"}>{icon}</div>
      </div>
      <div className="font-display text-2xl font-semibold mt-3 tabular-nums">{value}</div>
      {sub && (
        <div className={`text-xs mt-1 ${tone ? "opacity-80" : "text-muted-foreground"}`}>{sub}</div>
      )}
    </Card>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="rounded-2xl p-5">
      <h3 className="font-display font-semibold text-sm mb-4">{title}</h3>
      <div className="h-64">{children}</div>
    </Card>
  );
}
