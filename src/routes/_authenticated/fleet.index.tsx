import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Bus, Users, Route as RouteIcon, Fuel, Wrench, AlertTriangle } from "lucide-react";
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

  const { data: vehicles } = useQuery({
    queryKey: ["f-veh"],
    queryFn: async () => (await supabase.from("fleet_vehicles").select("id,status")).data ?? [],
  });
  const { data: drivers } = useQuery({
    queryKey: ["f-drv"],
    queryFn: async () => (await supabase.from("drivers").select("id")).data ?? [],
  });
  const { data: routes } = useQuery({
    queryKey: ["f-rte"],
    queryFn: async () => (await supabase.from("transport_routes").select("id")).data ?? [],
  });

  const { data: fuel } = useQuery({
    queryKey: ["f-fuel", period],
    queryFn: async () => {
      let q = supabase.from("fuel_logs").select("cost,date");
      if (since) q = q.gte("date", since);
      return (await q).data ?? [];
    },
  });
  const { data: maint } = useQuery({
    queryKey: ["f-maint", period],
    queryFn: async () => {
      let q = supabase.from("vehicle_maintenance").select("cost,service_date");
      if (since) q = q.gte("service_date", since);
      return (await q).data ?? [];
    },
  });
  const { data: renewals } = useQuery({
    queryKey: ["f-renewals"],
    queryFn: async () => (await supabase.rpc("fleet_renewals_due", { _days: 60 })).data ?? [],
  });

  const fuelSpend = (fuel ?? []).reduce((a: number, f: any) => a + Number(f.cost || 0), 0);
  const maintSpend = (maint ?? []).reduce((a: number, m: any) => a + Number(m.cost || 0), 0);
  const activeV = (vehicles ?? []).filter((v: any) => v.status === "active").length;

  const groupedRenewals = useMemo(() => {
    const src = (renewals ?? []) as any[];
    return {
      urgent: src.filter((r) => r.days_left <= 15),
      soon: src.filter((r) => r.days_left > 15 && r.days_left <= 60),
    };
  }, [renewals]);

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
        <Stat
          icon={Bus}
          label="Vehicles (active)"
          value={`${activeV} / ${(vehicles ?? []).length}`}
        />
        <Stat icon={Users} label="Drivers" value={String((drivers ?? []).length)} />
        <Stat icon={RouteIcon} label="Routes" value={String((routes ?? []).length)} />
        <Stat icon={Fuel} label="Fuel spend" value={money(fuelSpend)} />
        <Stat icon={Wrench} label="Maintenance" value={money(maintSpend)} />
        <Stat
          icon={AlertTriangle}
          label="Renewals due (60d)"
          value={String((renewals ?? []).length)}
          tint="text-amber-600"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="rounded-2xl p-4 min-w-0">
          <div className="flex items-center justify-between mb-3">
            <div className="font-medium">Renewals due — urgent (≤15 days)</div>
            <Badge className="bg-red-100 text-red-800 border-0">
              {groupedRenewals.urgent.length}
            </Badge>
          </div>
          {groupedRenewals.urgent.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nothing urgent.</div>
          ) : (
            <ul className="text-sm divide-y">
              {groupedRenewals.urgent.map((r) => (
                <li
                  key={`${r.kind}-${r.ref_id}`}
                  className="py-2 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 truncate">
                    <span className="capitalize text-muted-foreground mr-2">{r.kind}:</span>
                    <span className="font-medium">{r.label}</span>
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0">
                    {fmtDate(r.expiry_date)} · {r.days_left}d
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="rounded-2xl p-4 min-w-0">
          <div className="flex items-center justify-between mb-3">
            <div className="font-medium">Renewals due — upcoming (16–60 days)</div>
            <Badge className="bg-amber-100 text-amber-800 border-0">
              {groupedRenewals.soon.length}
            </Badge>
          </div>
          {groupedRenewals.soon.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nothing upcoming.</div>
          ) : (
            <ul className="text-sm divide-y">
              {groupedRenewals.soon.map((r) => (
                <li
                  key={`${r.kind}-${r.ref_id}`}
                  className="py-2 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 truncate">
                    <span className="capitalize text-muted-foreground mr-2">{r.kind}:</span>
                    <span className="font-medium">{r.label}</span>
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0">
                    {fmtDate(r.expiry_date)} · {r.days_left}d
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
