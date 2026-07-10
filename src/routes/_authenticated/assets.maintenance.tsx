import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wrench, ShieldCheck } from "lucide-react";
import { daysBetween, formatMoney } from "@/lib/assets-util";

export const Route = createFileRoute("/_authenticated/assets/maintenance")({
  component: MaintenanceView,
});

function MaintenanceView() {
  const { data: upcoming } = useQuery({
    queryKey: ["maint-upcoming"],
    queryFn: async () =>
      (
        await supabase
          .from("asset_maintenance")
          .select("*, assets(name,asset_code)")
          .eq("status", "scheduled")
          .order("scheduled_for")
      ).data ?? [],
  });
  const { data: completed } = useQuery({
    queryKey: ["maint-completed"],
    queryFn: async () =>
      (
        await supabase
          .from("asset_maintenance")
          .select("*, assets(name,asset_code)")
          .eq("status", "completed")
          .order("completed_at", { ascending: false })
          .limit(10)
      ).data ?? [],
  });
  const { data: amcs } = useQuery({
    queryKey: ["amc-all"],
    queryFn: async () =>
      (
        await supabase
          .from("asset_amc")
          .select("*, assets(name,asset_code), asset_vendors(name)")
          .order("end_date")
      ).data ?? [],
  });

  return (
    <>
      <PageHeader
        title="Maintenance & AMC"
        subtitle="Upcoming service across all assets and AMC expiry tracker."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Card className="rounded-2xl overflow-hidden">
          <div className="p-4 border-b flex items-center gap-2">
            <Wrench className="size-4 text-muted-foreground" />
            <div className="font-medium">Upcoming maintenance</div>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Asset</th>
                <th className="p-3">Type</th>
                <th className="p-3">Scheduled</th>
              </tr>
            </thead>
            <tbody>
              {(upcoming ?? []).map((m: any) => (
                <tr key={m.id} className="border-t">
                  <td className="p-3">
                    <div className="font-medium">{m.assets?.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {m.assets?.asset_code}
                    </div>
                  </td>
                  <td className="p-3 capitalize">{m.type}</td>
                  <td className="p-3">
                    {m.scheduled_for ? new Date(m.scheduled_for).toLocaleDateString() : "—"}
                  </td>
                </tr>
              ))}
              {(upcoming ?? []).length === 0 && (
                <tr>
                  <td colSpan={3} className="p-8 text-center text-muted-foreground">
                    No scheduled maintenance.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>

        <Card className="rounded-2xl overflow-hidden">
          <div className="p-4 border-b flex items-center gap-2">
            <Wrench className="size-4 text-muted-foreground" />
            <div className="font-medium">Recent completed</div>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Asset</th>
                <th className="p-3">Date</th>
                <th className="p-3 text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {(completed ?? []).map((m: any) => (
                <tr key={m.id} className="border-t">
                  <td className="p-3">
                    <div className="font-medium">{m.assets?.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {m.assets?.asset_code}
                    </div>
                  </td>
                  <td className="p-3">
                    {m.completed_at ? new Date(m.completed_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="p-3 text-right">{formatMoney(m.cost)}</td>
                </tr>
              ))}
              {(completed ?? []).length === 0 && (
                <tr>
                  <td colSpan={3} className="p-8 text-center text-muted-foreground">
                    No records.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>

      <Card className="rounded-2xl overflow-hidden">
        <div className="p-4 border-b flex items-center gap-2">
          <ShieldCheck className="size-4 text-muted-foreground" />
          <div className="font-medium">AMC contracts</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Asset</th>
                <th className="p-3">Vendor</th>
                <th className="p-3">Coverage</th>
                <th className="p-3">Start</th>
                <th className="p-3">Ends</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {(amcs ?? []).map((a: any) => {
                const days = daysBetween(new Date(), a.end_date);
                const dueSoon = days >= 0 && days <= 30;
                const expired = days < 0;
                return (
                  <tr key={a.id} className="border-t">
                    <td className="p-3">
                      <div className="font-medium">{a.assets?.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">
                        {a.assets?.asset_code}
                      </div>
                    </td>
                    <td className="p-3">{a.asset_vendors?.name ?? "—"}</td>
                    <td className="p-3">{a.coverage ?? "—"}</td>
                    <td className="p-3">{new Date(a.start_date).toLocaleDateString()}</td>
                    <td className="p-3">{new Date(a.end_date).toLocaleDateString()}</td>
                    <td className="p-3">
                      {expired ? (
                        <Badge className="bg-red-100 text-red-900 border border-red-200">
                          Expired
                        </Badge>
                      ) : dueSoon ? (
                        <Badge className="bg-amber-100 text-amber-900 border border-amber-200">
                          Renewal due · {days}d
                        </Badge>
                      ) : (
                        <Badge className="bg-emerald-100 text-emerald-900 border border-emerald-200">
                          Active
                        </Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
              {(amcs ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">
                    No AMC contracts.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
