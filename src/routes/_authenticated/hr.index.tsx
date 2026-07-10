import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app-shell";
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
  const { data: staff } = useQuery({
    queryKey: ["hr-staff"],
    queryFn: async () =>
      (await supabase.from("staff").select("id,status,designation,department")).data ?? [],
  });
  const { data: leaves } = useQuery({
    queryKey: ["hr-leave-pending"],
    queryFn: async () =>
      (await supabase.from("leave_requests").select("id,status,start_date,end_date,days")).data ??
      [],
  });
  const { data: payroll } = useQuery({
    queryKey: ["hr-payroll-summary"],
    queryFn: async () =>
      (await supabase.from("payroll_runs").select("id,status,net_salary,month")).data ?? [],
  });
  const { data: jobs } = useQuery({
    queryKey: ["hr-jobs"],
    queryFn: async () =>
      (await supabase.from("job_openings").select("id, status, positions")).data ?? [],
  });
  const { data: reviews } = useQuery({
    queryKey: ["hr-reviews"],
    queryFn: async () =>
      (await supabase.from("teacher_performance_reviews").select("rating")).data ?? [],
  });
  const { data: attn } = useQuery({
    queryKey: ["hr-attn"],
    queryFn: async () =>
      (
        await supabase
          .from("teacher_attendance")
          .select("status, date")
          .gte("date", new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10))
      ).data ?? [],
  });

  const total = staff?.length ?? 0;
  const active = (staff ?? []).filter((s) => s.status === "active").length;
  const onLeave = (staff ?? []).filter((s) => s.status === "on_leave").length;
  const teachers = (staff ?? []).filter((s) => s.department === "Academics").length;
  const nonTeaching = total - teachers;
  const newJoiners = (staff ?? []).length; // placeholder — join_date not selected
  const pendingLeaves = (leaves ?? []).filter((l) => l.status === "pending").length;
  const pendingPayroll = (payroll ?? []).filter((p) => p.status === "pending").length;
  const disbursed = (payroll ?? [])
    .filter((p) => p.status === "paid")
    .reduce((a, p) => a + Number(p.net_salary || 0), 0);
  const openPositions = (jobs ?? [])
    .filter((j: any) => j.status === "open")
    .reduce((a: number, j: any) => a + Number(j.positions || 0), 0);
  const avgRating =
    reviews && reviews.length
      ? (
          reviews.reduce((a: number, r: any) => a + Number(r.rating || 0), 0) / reviews.length
        ).toFixed(1)
      : "—";
  const present = (attn ?? []).filter((a: any) => a.status === "present").length;
  const late = (attn ?? []).filter((a: any) => a.status === "late").length;
  const attnPct = attn && attn.length ? Math.round((present / attn.length) * 100) : 0;

  const deptData = Object.entries(
    (staff ?? []).reduce(
      (a: Record<string, number>, s: any) => ({ ...a, [s.department]: (a[s.department] ?? 0) + 1 }),
      {},
    ),
  ).map(([name, value]) => ({ name, value }));
  const COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6"];

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
                <Bar dataKey="value" fill="#3b82f6" radius={[6, 6, 0, 0]} />
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
