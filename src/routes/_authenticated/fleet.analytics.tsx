import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/client";
import { PageHeader } from "@/components/app-shell";
import { EmptyRow } from "@/components/empty-state";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { money, fmtDate } from "@/lib/module-util";
import { useMemo } from "react";

export const Route = createFileRoute("/_authenticated/fleet/analytics")({ component: Page });

function firstOfMonthISO() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

function Page() {
  const monthStart = firstOfMonthISO();
  const { data } = useQuery({
    queryKey: ["fleet-analytics", monthStart],
    queryFn: async () => apiGet<any>(`/fleet/analytics?since=${monthStart}`),
  });

  const fuelSpend = data?.fuelSpend ?? 0;
  const maintSpend = data?.maintSpend ?? 0;
  const totalCost = data?.totalCost ?? 0;
  const totalStudents = data?.totalStudents ?? 0;
  const costPerStudent = data?.costPerStudent ?? 0;
  const perVehicle: any[] = data?.perVehicle ?? [];
  const routes: any[] = useMemo(
    () =>
      (data?.routeUtilization ?? []).map((r: any) => ({
        id: r.id,
        name: r.name,
        vehicle: r.capacity ? { capacity: r.capacity } : null,
        route_students: Array.from({ length: r.filled }),
      })),
    [data],
  );
  const renewals: any[] = data?.renewals ?? [];

  const vehicleRegs: Record<string, string> = useMemo(() => {
    const rec: Record<string, string> = {};
    for (const v of perVehicle) rec[v.id] = v.registrationNo ?? v.id.slice(0, 8);
    return rec;
  }, [perVehicle]);

  return (
    <>
      <PageHeader
        title="Fleet Analytics"
        subtitle="Operating cost, utilization, and renewals — this month."
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Card className="p-4 rounded-2xl">
          <div className="text-xs text-muted-foreground">Fuel (MTD)</div>
          <div className="text-xl font-semibold">{money(fuelSpend)}</div>
        </Card>
        <Card className="p-4 rounded-2xl">
          <div className="text-xs text-muted-foreground">Maintenance (MTD)</div>
          <div className="text-xl font-semibold">{money(maintSpend)}</div>
        </Card>
        <Card className="p-4 rounded-2xl">
          <div className="text-xs text-muted-foreground">Total operating cost</div>
          <div className="text-xl font-semibold">{money(totalCost)}</div>
        </Card>
        <Card className="p-4 rounded-2xl">
          <div className="text-xs text-muted-foreground">Cost per student</div>
          <div className="text-xl font-semibold">{money(costPerStudent)}</div>
          {totalStudents > 0 && (
            <div className="text-xs text-muted-foreground mt-1">
              {totalStudents} students on transport
            </div>
          )}
        </Card>
      </div>
      <Card className="p-3 rounded-xl mb-4 text-xs text-muted-foreground">
        Driver payroll is not included in operating cost — drivers are stored in{" "}
        <code>drivers</code>, not linked to <code>staff</code>/payroll records. When you link a
        driver to a staff record, their monthly salary will roll into this figure automatically.
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="rounded-2xl overflow-hidden">
          <div className="p-3 border-b font-medium">Route utilization</div>
          <ul className="divide-y">
            {(routes ?? []).map((r: any) => {
              const cap = r.vehicle?.capacity ?? 0;
              const filled = r.route_students?.length ?? 0;
              const pct = cap ? Math.min(100, Math.round((filled / cap) * 100)) : 0;
              return (
                <li key={r.id} className="p-3">
                  <div className="flex justify-between text-sm">
                    <span className="truncate">{r.name}</span>
                    <span className="text-muted-foreground shrink-0">
                      {filled}
                      {cap ? ` / ${cap}` : ""} {cap ? `(${pct}%)` : ""}
                    </span>
                  </div>
                  <Progress value={pct} className="mt-1" />
                </li>
              );
            })}
          </ul>
        </Card>

        <Card className="rounded-2xl overflow-hidden">
          <div className="p-3 border-b font-medium">Cost per vehicle (MTD)</div>
          <ul className="divide-y">
            {perVehicle.slice(0, 12).map((v) => (
              <li key={v.id} className="p-3 flex items-center justify-between gap-2 text-sm">
                <span className="font-mono text-xs">{vehicleRegs[v.id] ?? v.id.slice(0, 8)}</span>
                <div className="text-right">
                  <div className="font-medium">{money(v.total)}</div>
                  <div className="text-xs text-muted-foreground">
                    Fuel {money(v.fuel)} · Maint {money(v.maint)}
                  </div>
                </div>
              </li>
            ))}
            {perVehicle.length === 0 && (
              <li className="p-6 text-center text-sm text-muted-foreground">
                No spend recorded this month.
              </li>
            )}
          </ul>
        </Card>
      </div>

      <Card className="rounded-2xl overflow-hidden mt-4">
        <div className="p-3 border-b font-medium">Renewals calendar (next 180 days)</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="p-3">Kind</th>
                <th className="p-3">Record</th>
                <th className="p-3">Expiry</th>
                <th className="p-3">Days</th>
              </tr>
            </thead>
            <tbody>
              {((renewals as any[]) ?? []).map((r) => (
                <tr key={`${r.kind}-${r.refId}`} className="border-t">
                  <td className="p-3 capitalize">{r.kind}</td>
                  <td className="p-3">{r.label}</td>
                  <td className="p-3">{fmtDate(r.expiryDate)}</td>
                  <td className="p-3">
                    <Badge
                      className={
                        r.daysLeft <= 15
                          ? "bg-red-100 text-red-800 border-0"
                          : r.daysLeft <= 60
                            ? "bg-amber-100 text-amber-800 border-0"
                            : "bg-muted text-muted-foreground border-0"
                      }
                    >
                      {r.daysLeft}d
                    </Badge>
                  </td>
                </tr>
              ))}
              {(!renewals || renewals.length === 0) && (
                <EmptyRow
                  colSpan={4}
                  title="Nothing expiring soon"
                  hint="No insurance, permit, or licence renewals in the next 180 days."
                />
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
