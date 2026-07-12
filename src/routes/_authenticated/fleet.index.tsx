import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/client";
import { PageHeader } from "@/components/app-shell";
import { QueryError, StatCardsSkeleton } from "@/components/query-states";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bus,
  Users,
  Route as RouteIcon,
  Fuel,
  Wrench,
  AlertTriangle,
  Wrench as WrenchIcon,
  UserX,
} from "lucide-react";
import { money, fmtDate } from "@/lib/module-util";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/_authenticated/fleet/")({ component: Page });

type Period = "month" | "quarter" | "90d" | "ytd" | "all";

function periodStart(p: Period): string | null {
  const d = new Date();
  if (p === "month") return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  if (p === "quarter") {
    const m = Math.floor(d.getMonth() / 3) * 3;
    return `${d.getFullYear()}-${String(m + 1).padStart(2, "0")}-01`;
  }
  if (p === "90d") {
    const s = new Date();
    s.setDate(s.getDate() - 90);
    return s.toISOString().slice(0, 10);
  }
  if (p === "ytd") return `${d.getFullYear()}-01-01`;
  return null;
}

function Page() {
  const [period, setPeriod] = useState<Period>("month");
  const since = periodStart(period);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["fleet-dashboard", period],
    queryFn: async () => apiGet<any>(`/fleet/dashboard${since ? `?since=${since}` : ""}`),
  });

  const totalV = data?.vehicles?.total ?? 0;
  const activeV = data?.vehicles?.active ?? 0;
  const inMaint = data?.vehicles?.inMaintenance ?? 0;
  const unassigned = data?.vehicles?.unassigned ?? 0;
  const fuelSpend = data?.fuelSpend ?? 0;
  const maintSpend = data?.maintSpend ?? 0;
  const renewals = data?.renewals ?? [];

  const groupedRenewals = useMemo(() => {
    const src = (renewals ?? []) as any[];
    return {
      urgent: src.filter((r) => r.daysLeft <= 15),
      soon: src.filter((r) => r.daysLeft > 15 && r.daysLeft <= 60),
    };
  }, [renewals]);

  if (isError) {
    return (
      <>
        <PageHeader title="Fleet Dashboard" subtitle="Vehicles, drivers, and renewals." />
        <QueryError title="Couldn't load the fleet dashboard" onRetry={refetch} />
      </>
    );
  }
  if (isLoading) {
    return (
      <>
        <PageHeader title="Fleet Dashboard" subtitle="Vehicles, drivers, and renewals." />
        <div className="space-y-4">
          <StatCardsSkeleton count={4} />
          <StatCardsSkeleton count={2} />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Fleet Dashboard"
        subtitle="Vehicles, drivers, routes and renewals at a glance."
        action={
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month">This month</SelectItem>
              <SelectItem value="quarter">This quarter</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="ytd">Year to date</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
        }
      />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Stat icon={Bus} label="Vehicles (active)" value={`${activeV} / ${totalV}`} />
        <Stat icon={Users} label="Drivers" value={String(data?.drivers ?? 0)} />
        <Stat icon={RouteIcon} label="Routes" value={String(data?.routes ?? 0)} />
        <Stat icon={Fuel} label="Fuel spend" value={money(fuelSpend)} />
        <Stat icon={Wrench} label="Maintenance" value={money(maintSpend)} />
        <Stat
          icon={AlertTriangle}
          label="Renewals due (60d)"
          value={String((renewals ?? []).length)}
          tint="text-amber-600"
        />
      </div>

      {/* Enhancement: fleet-health quick stats surfaced by the dashboard endpoint. */}
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat
          icon={WrenchIcon}
          label="In maintenance"
          value={String(inMaint)}
          tint={inMaint > 0 ? "text-amber-600" : "text-foreground"}
        />
        <Stat
          icon={UserX}
          label="Without a driver"
          value={String(unassigned)}
          tint={unassigned > 0 ? "text-red-600" : "text-emerald-600"}
        />
        <Stat
          icon={Fuel}
          label="Avg fuel / vehicle"
          value={money(totalV ? fuelSpend / totalV : 0)}
        />
        <Stat
          icon={Wrench}
          label="Avg maint / vehicle"
          value={money(totalV ? maintSpend / totalV : 0)}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="rounded-2xl p-4 min-w-0">
          <div className="flex items-center justify-between mb-3">
            <div className="font-medium">Renewals due — urgent (≤15 days)</div>
            <StatusBadge tone="danger" label={String(groupedRenewals.urgent.length)} />
          </div>
          {groupedRenewals.urgent.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nothing urgent.</div>
          ) : (
            <ul className="text-sm divide-y">
              {groupedRenewals.urgent.map((r) => (
                <li
                  key={`${r.kind}-${r.refId}`}
                  className="py-2 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 truncate">
                    <span className="capitalize text-muted-foreground mr-2">{r.kind}:</span>
                    <span className="font-medium">{r.label}</span>
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0">
                    {fmtDate(r.expiryDate)} · {r.daysLeft}d
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="rounded-2xl p-4 min-w-0">
          <div className="flex items-center justify-between mb-3">
            <div className="font-medium">Renewals due — upcoming (16–60 days)</div>
            <StatusBadge tone="warning" label={String(groupedRenewals.soon.length)} />
          </div>
          {groupedRenewals.soon.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nothing upcoming.</div>
          ) : (
            <ul className="text-sm divide-y">
              {groupedRenewals.soon.map((r) => (
                <li
                  key={`${r.kind}-${r.refId}`}
                  className="py-2 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 truncate">
                    <span className="capitalize text-muted-foreground mr-2">{r.kind}:</span>
                    <span className="font-medium">{r.label}</span>
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0">
                    {fmtDate(r.expiryDate)} · {r.daysLeft}d
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tint = "text-foreground",
}: {
  icon: any;
  label: string;
  value: string;
  tint?: string;
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
