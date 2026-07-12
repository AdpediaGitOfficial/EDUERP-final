import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/client";
import { CHART, CHART_SUCCESS, CHART_INFO, chartColor } from "@/lib/chart";
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

const COLORS = CHART;

function Page() {
  const { data } = useQuery({
    queryKey: ["hr-analytics"],
    queryFn: () =>
      apiGet<{
        byDept: { name: string; count: number }[];
        byMonth: { month: string; total: number }[];
        leaveTypes: { name: string; value: number }[];
        funnel: { stage: string; count: number }[];
      }>("/hr/analytics"),
  });
  const byDept = data?.byDept ?? [];
  const byMonth = data?.byMonth ?? [];
  const leaveTypes = data?.leaveTypes ?? [];
  const funnel = data?.funnel ?? [];

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
              <Bar dataKey="count" fill={CHART_INFO} radius={[6, 6, 0, 0]} />
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
              <Line dataKey="total" stroke={CHART_SUCCESS} strokeWidth={2} />
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
              <Bar dataKey="count" fill={chartColor(4)} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </>
  );
}
