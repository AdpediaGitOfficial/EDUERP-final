import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/client";
import { PageHeader } from "@/components/app-shell";
import { QueryError, StatCardsSkeleton } from "@/components/query-states";
import { Card } from "@/components/ui/card";
import {
  Users,
  UserCheck,
  PalmtreeIcon,
  ClipboardList,
  IndianRupee,
  FileClock,
  GraduationCap,
  Briefcase,
  Cake,
  AlertTriangle,
  Star,
  TrendingUp,
} from "lucide-react";
import { money } from "@/lib/module-util";
import { CHART, CHART_INFO } from "@/lib/chart";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

export const Route = createFileRoute("/_authenticated/hr/")({ component: Page });

function Page() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["hr-dashboard"],
    queryFn: async () => apiGet<any>("/hr/dashboard"),
  });

  const total = data?.total ?? 0;
  const active = data?.active ?? 0;
  const onLeave = data?.onLeave ?? 0;
  const teachers = data?.teachers ?? 0;
  const nonTeaching = data?.nonTeaching ?? 0;
  const newJoiners = total; // placeholder — parity with the original page
  const pendingLeaves = data?.pendingLeaves ?? 0;
  const pendingPayroll = data?.pendingPayroll ?? 0;
  const disbursed = data?.disbursed ?? 0;
  const openPositions = data?.openPositions ?? 0;
  const avgRating = data?.avgRating != null ? String(data.avgRating) : "—";
  const late = data?.lateArrivals ?? 0;
  const attnPct = data?.attendancePct ?? 0;

  const deptData: { name: string; value: number }[] = data?.byDepartment ?? [];
  const COLORS = CHART;

  if (isError) {
    return (
      <>
        <PageHeader title="HR Dashboard" subtitle="Team overview, leave and payroll status." />
        <QueryError title="Couldn't load the HR dashboard" onRetry={refetch} />
      </>
    );
  }
  if (isLoading) {
    return (
      <>
        <PageHeader title="HR Dashboard" subtitle="Team overview, leave and payroll status." />
        <div className="space-y-4">
          <StatCardsSkeleton count={6} />
          <StatCardsSkeleton count={3} />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="HR Dashboard" subtitle="Team overview, leave and payroll status." />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2 sm:gap-3 mb-6">
        <Stat icon={Users} label="Total staff" value={String(total)} tint="text-foreground" />
        <Stat icon={UserCheck} label="Active" value={String(active)} tint="text-emerald-600" />
        <Stat icon={GraduationCap} label="Teachers" value={String(teachers)} tint="text-blue-600" />
        <Stat
          icon={Briefcase}
          label="Non-teaching"
          value={String(nonTeaching)}
          tint="text-indigo-600"
        />
        <Stat icon={PalmtreeIcon} label="On leave" value={String(onLeave)} tint="text-amber-600" />
        <Stat
          icon={TrendingUp}
          label="Attendance %"
          value={`${attnPct}%`}
          tint="text-emerald-600"
        />
        <Stat
          icon={AlertTriangle}
          label="Late arrivals"
          value={String(late)}
          tint="text-amber-600"
        />
        <Stat
          icon={ClipboardList}
          label="Leaves pending"
          value={String(pendingLeaves)}
          tint="text-amber-600"
        />
        <Stat
          icon={FileClock}
          label="Payroll pending"
          value={String(pendingPayroll)}
          tint="text-amber-600"
        />
        <Stat
          icon={IndianRupee}
          label="Disbursed"
          value={money(disbursed)}
          tint="text-emerald-600"
        />
        <Stat
          icon={Briefcase}
          label="Open positions"
          value={String(openPositions)}
          tint="text-blue-600"
        />
        <Stat icon={Star} label="Avg rating" value={String(avgRating)} tint="text-amber-600" />
        <Stat icon={Cake} label="New joiners" value={String(newJoiners)} tint="text-pink-600" />
      </div>
      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <Card className="p-4 rounded-2xl overflow-hidden min-w-0">
          <div className="text-sm font-semibold mb-3">Headcount by department</div>
          <div className="w-full h-[240px] sm:h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={deptData} margin={{ top: 5, right: 8, left: -20, bottom: 50 }}>
                <XAxis
                  dataKey="name"
                  fontSize={10}
                  interval={0}
                  angle={-35}
                  textAnchor="end"
                  height={60}
                />
                <YAxis fontSize={10} width={30} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" fill={CHART_INFO} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-4 rounded-2xl overflow-hidden min-w-0">
          <div className="text-sm font-semibold mb-3">Distribution</div>
          <div className="w-full h-[320px] sm:h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={deptData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="40%"
                  outerRadius="60%"
                >
                  {deptData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend
                  verticalAlign="bottom"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 11, lineHeight: "16px", paddingTop: 8 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tint,
}: {
  icon: any;
  label: string;
  value: string;
  tint: string;
}) {
  return (
    <Card className="p-3 sm:p-4 rounded-2xl min-w-0 overflow-hidden">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground truncate">{label}</div>
        <Icon className={`size-4 shrink-0 ${tint}`} />
      </div>
      <div className={`text-lg sm:text-2xl font-semibold mt-1 break-words ${tint}`}>{value}</div>
    </Card>
  );
}
