import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiFetch } from "@/lib/api/client";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { badgeClass, fmtDate, money, niceLabel } from "@/lib/module-util";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/hr/travel")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["travel-requests"],
    queryFn: () => apiGet<any[]>("/hr/travel"),
  });
  const decide = useMutation({
    mutationFn: async (v: { id: string; status: string }) => {
      const res = await apiFetch(`/hr/travel/${v.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: v.status }),
      });
      if (!res || !res.ok) {
        const b = res ? await res.json().catch(() => null) : null;
        throw new Error(b?.message ?? "Update failed");
      }
    },
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["travel-requests"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <>
      <PageHeader title="Travel Requests" subtitle="Business travel approvals and settlements." />
      <Card className="rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-left">
              <th className="p-3">Employee</th>
              <th className="p-3">Destination</th>
              <th className="p-3">Dates</th>
              <th className="p-3">Purpose</th>
              <th className="p-3">Advance</th>
              <th className="p-3">Settled</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((t: any) => (
              <tr key={t.id} className="border-t">
                <td className="p-3">
                  <div className="font-medium">{t.staff?.full_name}</div>
                  <div className="text-xs text-muted-foreground">{t.staff?.employee_code}</div>
                </td>
                <td className="p-3">{t.destination}</td>
                <td className="p-3">
                  {fmtDate(t.start_date)} → {fmtDate(t.end_date)}
                </td>
                <td className="p-3">{t.purpose}</td>
                <td className="p-3">{money(t.advance_amount)}</td>
                <td className="p-3">{t.settlement_amount ? money(t.settlement_amount) : "—"}</td>
                <td className="p-3">
                  <Badge className={badgeClass(t.status)}>{niceLabel(t.status)}</Badge>
                </td>
                <td className="p-3 text-right whitespace-nowrap">
                  {t.status === "pending" ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => decide.mutate({ id: t.id, status: "approved" })}
                      >
                        Approve
                      </Button>{" "}
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => decide.mutate({ id: t.id, status: "rejected" })}
                      >
                        Reject
                      </Button>
                    </>
                  ) : t.status === "approved" && !t.settlement_amount ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => decide.mutate({ id: t.id, status: "completed" })}
                    >
                      Mark completed
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
