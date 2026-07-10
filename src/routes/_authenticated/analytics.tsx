import { RequireRole } from "@/components/require-role";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell, PageHeader } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
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
import { subDays, format, startOfDay } from "date-fns";
import { useMemo } from "react";

export const Route = createFileRoute("/_authenticated/analytics")({
  component: () => (
    <RequireRole roles={["admin"]}>
      <Page />
    </RequireRole>
  ),
});

const COLORS = ["hsl(var(--primary))", "#f59e0b", "#10b981", "#ef4444", "#6366f1"];

function Page() {
  const since = subDays(startOfDay(new Date()), 29).toISOString();

  const { data: attendance } = useQuery({
    queryKey: ["an-att"],
    queryFn: async () =>
      (await supabase.from("attendance").select("date,status").gte("date", since.slice(0, 10)))
        .data ?? [],
  });

  const { data: payments } = useQuery({
    queryKey: ["an-pay"],
    queryFn: async () =>
      (
        await supabase
          .from("payments")
          .select("amount,paid_at,status")
          .gte("paid_at", since)
          .eq("status", "successful")
      ).data ?? [],
  });

  const { data: roleRows } = useQuery({
    queryKey: ["an-roles"],
    queryFn: async () => (await supabase.from("user_roles").select("role")).data ?? [],
  });

  const attSeries = useMemo(() => {
    const days: Record<string, { date: string; present: number; absent: number; late: number }> =
      {};
    for (let i = 29; i >= 0; i--) {
      const d = format(subDays(new Date(), i), "yyyy-MM-dd");
      days[d] = { date: d, present: 0, absent: 0, late: 0 };
    }
    for (const r of attendance ?? []) {
      const d = String(r.date);
      if (!days[d]) continue;
      if (r.status === "present") days[d].present++;
      else if (r.status === "absent") days[d].absent++;
      else if (r.status === "late") days[d].late++;
    }
    return Object.values(days).map((r) => ({ ...r, day: format(new Date(r.date), "dd MMM") }));
  }, [attendance]);

  const revenueSeries = useMemo(() => {
    const days: Record<string, { day: string; amount: number }> = {};
    for (let i = 29; i >= 0; i--) {
      const d = format(subDays(new Date(), i), "yyyy-MM-dd");
      days[d] = { day: format(new Date(d), "dd MMM"), amount: 0 };
    }
    for (const p of payments ?? []) {
      const d = format(new Date(p.paid_at), "yyyy-MM-dd");
      if (days[d]) days[d].amount += Number(p.amount);
    }
    return Object.values(days);
  }, [payments]);

  const roleDist = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of roleRows ?? []) m.set(r.role, (m.get(r.role) ?? 0) + 1);
    return Array.from(m.entries()).map(([name, value]) => ({ name, value }));
  }, [roleRows]);

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
          <div className="text-2xl font-semibold">{(roleRows ?? []).length}</div>
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
