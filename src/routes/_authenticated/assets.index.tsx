import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/client";
import { CHART_PRIMARY } from "@/lib/chart";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Package,
  CheckCircle2,
  Circle,
  Wrench,
  Archive,
  Trash2,
  Plus,
  ArrowRightLeft,
  ClipboardList,
} from "lucide-react";
import { STATUS_HEX, STATUS_LABEL } from "@/lib/assets-util";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import { useMemo } from "react";

export const Route = createFileRoute("/_authenticated/assets/")({
  component: Dashboard,
});

type DashStats = {
  total: number;
  in_use: number;
  available: number;
  repair: number;
  retired: number;
  disposed: number;
};
type DashData = {
  stats: DashStats;
  topCategories: { name: string; count: number }[];
  recentActivity: { when: string; text: string; kind: string }[];
};

function Dashboard() {
  const { data } = useQuery({
    queryKey: ["assets-dash"],
    queryFn: () => apiGet<DashData>("/assets/dashboard"),
  });

  const stats = data?.stats ?? {
    total: 0,
    in_use: 0,
    available: 0,
    repair: 0,
    retired: 0,
    disposed: 0,
  };

  const statusData = useMemo(
    () =>
      (["available", "in_use", "repair", "retired", "disposed"] as const)
        .map((k) => ({ name: STATUS_LABEL[k], key: k, value: (stats as any)[k] }))
        .filter((d) => d.value > 0),
    [stats],
  );

  const categoryData = data?.topCategories ?? [];
  const activity = data?.recentActivity ?? [];

  return (
    <>
      <PageHeader
        title="Assets"
        subtitle="Track school inventory, allocations, maintenance and AMC contracts."
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/assets/registry">
                <Plus className="size-4" /> Add asset
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/assets/allocation">
                <ArrowRightLeft className="size-4" /> Allocate
              </Link>
            </Button>
            <Button asChild>
              <Link to="/assets/maintenance">
                <ClipboardList className="size-4" /> Log maintenance
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <StatCard icon={Package} label="Total" value={stats.total} tint="text-foreground" />
        <StatCard icon={CheckCircle2} label="In Use" value={stats.in_use} tint="text-blue-600" />
        <StatCard icon={Circle} label="Available" value={stats.available} tint="text-emerald-600" />
        <StatCard icon={Wrench} label="In Repair" value={stats.repair} tint="text-amber-600" />
        <StatCard
          icon={Archive}
          label="Retired"
          value={stats.retired}
          tint="text-muted-foreground"
        />
        <StatCard icon={Trash2} label="Disposed" value={stats.disposed} tint="text-red-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <Card className="p-5 rounded-2xl lg:col-span-1">
          <div className="text-sm font-medium mb-2">Status distribution</div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={45}
                  outerRadius={75}
                  paddingAngle={2}
                >
                  {statusData.map((d) => (
                    <Cell key={d.key} fill={STATUS_HEX[d.key]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-5 rounded-2xl lg:col-span-2">
          <div className="text-sm font-medium mb-2">Top categories</div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryData}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill={CHART_PRIMARY} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="p-5 rounded-2xl">
        <div className="text-sm font-medium mb-3">Recent activity</div>
        <ul className="space-y-2 text-sm">
          {activity.map((a, i) => (
            <li key={i} className="flex items-start gap-3 py-1.5 border-b last:border-b-0">
              <div className="size-2 rounded-full bg-primary mt-2" />
              <div className="flex-1">{a.text}</div>
              <div className="text-xs text-muted-foreground">
                {new Date(a.when).toLocaleDateString()}
              </div>
            </li>
          ))}
          {activity.length === 0 && (
            <li className="text-muted-foreground text-sm">No recent activity.</li>
          )}
        </ul>
      </Card>
    </>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tint,
}: {
  icon: any;
  label: string;
  value: number;
  tint: string;
}) {
  return (
    <Card className="p-4 rounded-2xl">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">{label}</div>
        <Icon className={`size-4 ${tint}`} />
      </div>
      <div className={`text-2xl font-semibold mt-1 ${tint}`}>{value}</div>
    </Card>
  );
}
