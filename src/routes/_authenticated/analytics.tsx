import { RequireRole } from "@/components/require-role";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell, PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

export const Route = createFileRoute("/_authenticated/analytics")({
  component: () => (
    <RequireRole roles={["admin"]}>
      <Page />
    </RequireRole>
  ),
});

const COLORS = ["hsl(var(--primary))", "#f59e0b", "#10b981", "#ef4444", "#6366f1"];

function Page() {
  const { data } = useQuery({
    queryKey: ["analytics"],
    queryFn: () =>
      apiGet<{
        attSeries: { date: string; day: string; present: number; absent: number; late: number }[];
        revenueSeries: { day: string; amount: number }[];
        roleDist: { name: string; value: number }[];
        totalUsers: number;
      }>("/reports/analytics"),
  });

  const attSeries = data?.attSeries ?? [];
  const revenueSeries = data?.revenueSeries ?? [];
  const roleDist = data?.roleDist ?? [];
  const totalUsers = data?.totalUsers ?? 0;

  const totalRevenue = revenueSeries.reduce((s, r) => s + r.amount, 0);
  const totalPresent = attSeries.reduce((s, r) => s + r.present, 0);
  const totalMarks = attSeries.reduce((s, r) => s + r.present + r.absent + r.late, 0);
  const attRate = totalMarks ? Math.round((totalPresent / totalMarks) * 100) : 0;

  return (
    <AppShell>
      <PageHeader title="Analytics" subtitle="Last 30 days across attendance, fees, and users." />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card className="p-4 rounded-2xl">
          <div className="text-xs text-muted-foreground">Revenue (30d)</div>
          <div className="text-2xl font-semibold">₹{totalRevenue.toLocaleString()}</div>
        </Card>
        <Card className="p-4 rounded-2xl">
          <div className="text-xs text-muted-foreground">Attendance rate</div>
          <div className="text-2xl font-semibold">{attRate}%</div>
        </Card>
        <Card className="p-4 rounded-2xl">
          <div className="text-xs text-muted-foreground">Total users</div>
          <div className="text-2xl font-semibold">{totalUsers}</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="rounded-2xl p-5">
          <div className="font-medium mb-4">Daily revenue</div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={revenueSeries}>
                <XAxis dataKey="day" tick={{ fontSize: 11 }} interval={4} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="amount"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="rounded-2xl p-5">
          <div className="font-medium mb-4">Attendance mix</div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={attSeries}>
                <XAxis dataKey="day" tick={{ fontSize: 11 }} interval={4} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="present" stackId="a" fill="#10b981" />
                <Bar dataKey="late" stackId="a" fill="#f59e0b" />
                <Bar dataKey="absent" stackId="a" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="rounded-2xl p-5 lg:col-span-2">
          <div className="font-medium mb-4">Users by role</div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={roleDist} dataKey="value" nameKey="name" outerRadius={90} label>
                  {roleDist.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
