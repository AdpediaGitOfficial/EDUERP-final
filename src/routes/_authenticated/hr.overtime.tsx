import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { badgeClass, fmtDate, niceLabel } from "@/lib/module-util";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/hr/overtime")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["overtime-requests"],
    queryFn: async () =>
      (
        await supabase
          .from("overtime_requests")
          .select("*, staff:staff_id(full_name, employee_code)")
          .order("work_date", { ascending: false })
      ).data ?? [],
  });
  const decide = useMutation({
    mutationFn: async (v: { id: string; status: "approved" | "rejected" }) => {
      const { error } = await supabase
        .from("overtime_requests")
        .update({ status: v.status })
        .eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["overtime-requests"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const totalHours = (data ?? []).reduce((a: number, r: any) => a + Number(r.hours || 0), 0);
  const pending = (data ?? []).filter((r: any) => r.status === "pending").length;
  return (
    <>
      <PageHeader title="Overtime" subtitle="Extra work hours submissions." />
      <div className="grid grid-cols-3 gap-3 mb-6">
        <Card className="p-4 rounded-2xl">
          <div className="text-xs text-muted-foreground">Total requests</div>
          <div className="text-2xl font-semibold">{(data ?? []).length}</div>
        </Card>
        <Card className="p-4 rounded-2xl">
          <div className="text-xs text-muted-foreground">Total hours</div>
          <div className="text-2xl font-semibold">{totalHours}</div>
        </Card>
        <Card className="p-4 rounded-2xl">
          <div className="text-xs text-muted-foreground">Pending</div>
          <div className="text-2xl font-semibold text-amber-600">{pending}</div>
        </Card>
      </div>
      <Card className="rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-left">
              <th className="p-3">Employee</th>
              <th className="p-3">Date</th>
              <th className="p-3">Hours</th>
              <th className="p-3">Rate ×</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((r: any) => (
              <tr key={r.id} className="border-t">
                <td className="p-3">{r.staff?.full_name}</td>
                <td className="p-3">{fmtDate(r.work_date)}</td>
                <td className="p-3">{r.hours}</td>
                <td className="p-3">{r.rate_multiplier}×</td>
                <td className="p-3">
                  <Badge className={badgeClass(r.status)}>{niceLabel(r.status)}</Badge>
                </td>
                <td className="p-3 text-right whitespace-nowrap">
                  {r.status === "pending" ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => decide.mutate({ id: r.id, status: "approved" })}
                      >
                        Approve
                      </Button>{" "}
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => decide.mutate({ id: r.id, status: "rejected" })}
                      >
                        Reject
                      </Button>
                    </>
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
