import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { badgeClass, fmtDate, niceLabel } from "@/lib/module-util";
import { CheckCircle2, Circle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/hr/exit")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["resignations"],
    queryFn: async () =>
      (
        await supabase
          .from("resignations")
          .select("*, staff:staff_id(full_name, employee_code, department, designation)")
          .order("submitted_at", { ascending: false })
      ).data ?? [],
  });
  const toggleClear = useMutation({
    mutationFn: async (v: { r: any; key: string }) => {
      const cl = { ...(v.r.clearance ?? {}), [v.key]: !v.r.clearance?.[v.key] };
      const { error } = await supabase
        .from("resignations")
        .update({ clearance: cl })
        .eq("id", v.r.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resignations"] }),
    onError: (e: any) => toast.error(e.message),
  });
  const updateStatus = useMutation({
    mutationFn: async (v: { id: string; field: string; value: string }) => {
      const { error } = await supabase
        .from("resignations")
        .update({ [v.field]: v.value } as any)
        .eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["resignations"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <>
      <PageHeader
        title="Resignation & Exit"
        subtitle="Notice period, clearances and final settlement."
      />
      {(data ?? []).length === 0 && (
        <Card className="p-8 rounded-2xl text-center text-muted-foreground">
          No active resignations.
        </Card>
      )}
      <div className="space-y-4">
        {(data ?? []).map((r: any) => {
          const cl = r.clearance ?? {};
          const items = [
            ["assets_return", "Asset return"],
            ["it_return", "IT access & credentials"],
            ["finance_clearance", "Finance clearance"],
            ["hr_clearance", "HR clearance"],
          ];
          const allClear = items.every(([k]) => cl[k]);
          return (
            <Card key={r.id} className="p-5 rounded-2xl">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">
                    {r.staff?.full_name}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      ({r.staff?.employee_code})
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {r.staff?.department} • {r.staff?.designation}
                  </div>
                </div>
                <div className="text-right">
                  <Badge className={badgeClass(r.status === "in_progress" ? "pending" : r.status)}>
                    {niceLabel(r.status)}
                  </Badge>
                  <div className="text-xs text-muted-foreground mt-1">
                    Submitted {fmtDate(r.submitted_at)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Last day {fmtDate(r.last_working_day)}
                  </div>
                </div>
              </div>
              <div className="text-sm mt-3 text-muted-foreground">{r.reason}</div>
              <div className="grid md:grid-cols-4 gap-3 mt-4 text-sm items-start">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Manager</div>
                  <Badge className={badgeClass(r.manager_status)}>
                    {niceLabel(r.manager_status)}
                  </Badge>
                  {r.manager_status === "pending" && (
                    <div className="flex gap-1 mt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          updateStatus.mutate({
                            id: r.id,
                            field: "manager_status",
                            value: "approved",
                          })
                        }
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() =>
                          updateStatus.mutate({
                            id: r.id,
                            field: "manager_status",
                            value: "rejected",
                          })
                        }
                      >
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">HR</div>
                  <Badge className={badgeClass(r.hr_status)}>{niceLabel(r.hr_status)}</Badge>
                  {r.hr_status === "pending" && (
                    <div className="flex gap-1 mt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          updateStatus.mutate({ id: r.id, field: "hr_status", value: "approved" })
                        }
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() =>
                          updateStatus.mutate({ id: r.id, field: "hr_status", value: "rejected" })
                        }
                      >
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-4">
                <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                  Clearance checklist
                </div>
                <div className="grid md:grid-cols-2 gap-2">
                  {items.map(([k, label]) => (
                    <button
                      key={k}
                      onClick={() => toggleClear.mutate({ r, key: k })}
                      className="flex items-center gap-2 text-sm text-left hover:bg-muted/40 p-1 rounded"
                    >
                      {cl[k] ? (
                        <CheckCircle2 className="size-4 text-emerald-600" />
                      ) : (
                        <Circle className="size-4 text-muted-foreground" />
                      )}
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
                {allClear && r.status !== "completed" && (
                  <div className="mt-4">
                    <Button
                      size="sm"
                      onClick={() =>
                        updateStatus.mutate({ id: r.id, field: "status", value: "completed" })
                      }
                    >
                      Complete exit & generate relieving letter
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
