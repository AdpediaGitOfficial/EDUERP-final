import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiFetch } from "@/lib/api/client";
import { PageHeader } from "@/components/app-shell";
import { EmptyRow } from "@/components/empty-state";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Wrench, ShieldCheck, CheckCircle2 } from "lucide-react";
import { daysBetween, formatMoney } from "@/lib/assets-util";
import { toast } from "sonner";

type Maint = {
  id: string;
  assetName: string | null;
  assetCode: string | null;
  type: string;
  status: string;
  scheduled_for: string | null;
  completed_at: string | null;
  cost: number | null;
};
type Amc = {
  id: string;
  assetName: string | null;
  assetCode: string | null;
  vendorName: string | null;
  coverage: string | null;
  start_date: string | null;
  end_date: string | null;
};

export const Route = createFileRoute("/_authenticated/assets/maintenance")({
  component: MaintenanceView,
});

function MaintenanceView() {
  const qc = useQueryClient();
  const { data: upcoming } = useQuery({
    queryKey: ["maint-upcoming"],
    queryFn: () => apiGet<Maint[]>("/assets/maintenance?status=scheduled"),
  });
  const { data: completed } = useQuery({
    queryKey: ["maint-completed"],
    queryFn: () => apiGet<Maint[]>("/assets/maintenance?status=completed&limit=10"),
  });
  const { data: amcs } = useQuery({
    queryKey: ["amc-all"],
    queryFn: () => apiGet<Amc[]>("/assets/amc"),
  });

  const completedSpend = (completed ?? []).reduce((s, m) => s + Number(m.cost ?? 0), 0);
  const amcDueSoon = (amcs ?? []).filter((a) => {
    if (!a.end_date) return false;
    const d = daysBetween(new Date(), a.end_date);
    return d >= 0 && d <= 30;
  }).length;

  const markComplete = async (id: string) => {
    const res = await apiFetch(`/assets/maintenance/${id}/complete`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    if (!res || !res.ok) {
      const body = res ? await res.json().catch(() => null) : null;
      return toast.error(body?.message ?? "Could not update");
    }
    toast.success("Marked complete");
    qc.invalidateQueries({ queryKey: ["maint-upcoming"] });
    qc.invalidateQueries({ queryKey: ["maint-completed"] });
  };

  return (
    <>
      <PageHeader
        title="Maintenance & AMC"
        subtitle="Upcoming service across all assets and AMC expiry tracker."
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Card className="p-4 rounded-2xl">
          <div className="text-xs text-muted-foreground">Scheduled</div>
          <div className="text-2xl font-semibold mt-1">{upcoming?.length ?? 0}</div>
        </Card>
        <Card className="p-4 rounded-2xl">
          <div className="text-xs text-muted-foreground">Recent spend</div>
          <div className="text-2xl font-semibold mt-1">{formatMoney(completedSpend)}</div>
        </Card>
        <Card className="p-4 rounded-2xl">
          <div className="text-xs text-muted-foreground">AMC contracts</div>
          <div className="text-2xl font-semibold mt-1">{amcs?.length ?? 0}</div>
        </Card>
        <Card className="p-4 rounded-2xl">
          <div className="text-xs text-muted-foreground">AMC due ≤30d</div>
          <div
            className={`text-2xl font-semibold mt-1 ${amcDueSoon > 0 ? "text-amber-600" : "text-foreground"}`}
          >
            {amcDueSoon}
          </div>
        </Card>
      </div>

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
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {(upcoming ?? []).map((m) => (
                <tr key={m.id} className="border-t">
                  <td className="p-3">
                    <div className="font-medium">{m.assetName}</div>
                    <div className="text-xs text-muted-foreground font-mono">{m.assetCode}</div>
                  </td>
                  <td className="p-3 capitalize">{m.type}</td>
                  <td className="p-3">
                    {m.scheduled_for ? new Date(m.scheduled_for).toLocaleDateString() : "—"}
                  </td>
                  <td className="p-3 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      onClick={() => markComplete(m.id)}
                    >
                      <CheckCircle2 className="size-3.5" /> Done
                    </Button>
                  </td>
                </tr>
              ))}
              {(upcoming ?? []).length === 0 && (
                <EmptyRow
                  colSpan={4}
                  title="No scheduled maintenance"
                  hint="Upcoming service jobs will show here."
                />
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
              {(completed ?? []).map((m) => (
                <tr key={m.id} className="border-t">
                  <td className="p-3">
                    <div className="font-medium">{m.assetName}</div>
                    <div className="text-xs text-muted-foreground font-mono">{m.assetCode}</div>
                  </td>
                  <td className="p-3">
                    {m.completed_at ? new Date(m.completed_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="p-3 text-right">{formatMoney(m.cost)}</td>
                </tr>
              ))}
              {(completed ?? []).length === 0 && (
                <EmptyRow colSpan={3} title="No completed maintenance yet" />
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
              {(amcs ?? []).map((a) => {
                const days = a.end_date ? daysBetween(new Date(), a.end_date) : 0;
                const dueSoon = days >= 0 && days <= 30;
                const expired = days < 0;
                return (
                  <tr key={a.id} className="border-t">
                    <td className="p-3">
                      <div className="font-medium">{a.assetName}</div>
                      <div className="text-xs text-muted-foreground font-mono">{a.assetCode}</div>
                    </td>
                    <td className="p-3">{a.vendorName ?? "—"}</td>
                    <td className="p-3">{a.coverage ?? "—"}</td>
                    <td className="p-3">
                      {a.start_date ? new Date(a.start_date).toLocaleDateString() : "—"}
                    </td>
                    <td className="p-3">
                      {a.end_date ? new Date(a.end_date).toLocaleDateString() : "—"}
                    </td>
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
                <EmptyRow
                  colSpan={6}
                  title="No AMC contracts"
                  hint="Annual maintenance contracts will be listed here."
                />
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
