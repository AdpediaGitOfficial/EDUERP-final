import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

export const Route = createFileRoute("/_authenticated/hr/analytics")({ component: Page });

const COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

function Page() {
  const { data: staff } = useQuery({
    queryKey: ["staff-all"],
    queryFn: async () =>
      (await supabase.from("staff").select("id, department, join_date, experience_years, status"))
        .data ?? [],
  });
  const { data: payroll } = useQuery({
    queryKey: ["payroll-all"],
    queryFn: async () =>
      (await supabase.from("payroll_runs").select("month, net_salary, status")).data ?? [],
  });
  const { data: leave } = useQuery({
    queryKey: ["leave-all"],
    queryFn: async () =>
      (await supabase.from("leave_requests").select("start_date, status, leave_type")).data ?? [],
  });
  const { data: cands } = useQuery({
    queryKey: ["cand-all"],
    queryFn: async () => (await supabase.from("candidates").select("stage")).data ?? [],
  });

  const byDept = Object.entries(
    (staff ?? []).reduce(
      (a: Record<string, number>, s: any) => ({ ...a, [s.department]: (a[s.department] ?? 0) + 1 }),
      {},
    ),
  ).map(([name, count]) => ({ name, count }));
  const byMonth = Object.entries(
    (payroll ?? []).reduce((a: Record<string, number>, p: any) => {
      const k = String(p.month).slice(0, 7);
      return { ...a, [k]: (a[k] ?? 0) + Number(p.net_salary || 0) };
    }, {}),
  )
    .sort()
    .map(([month, total]) => ({ month, total }));
  const leaveTypes = Object.entries(
    (leave ?? []).reduce(
      (a: Record<string, number>, l: any) => ({ ...a, [l.leave_type]: (a[l.leave_type] ?? 0) + 1 }),
      {},
    ),
  ).map(([name, value]) => ({ name, value }));
  const funnel = ["applied", "screening", "interview", "offer", "joined"].map((s) => ({
    stage: s,
    count: (cands ?? []).filter((c: any) => c.stage === s).length,
  }));

  return (
    <>
      <PageHeader title="HR Analytics" subtitle="Trends, distributions and hiring funnel." />
      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <Card className="p-4 rounded-2xl">
          <div className="text-sm font-semibold mb-3">Department headcount</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={byDept}>
              <XAxis dataKey="name" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip />
              <Bar dataKey="count" fill="#3b82f6" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-4 rounded-2xl">
          <div className="text-sm font-semibold mb-3">Payroll trend</div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={byMonth}>
              <XAxis dataKey="month" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip />
              <Line dataKey="total" stroke="#10b981" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-4 rounded-2xl">
          <div className="text-sm font-semibold mb-3">Leave types</div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={leaveTypes} dataKey="value" nameKey="name" outerRadius={80} label>
                {leaveTypes.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-4 rounded-2xl">
          <div className="text-sm font-semibold mb-3">Recruitment funnel</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={funnel}>
              <XAxis dataKey="stage" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip />
              <Bar dataKey="count" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </>
  );
}
