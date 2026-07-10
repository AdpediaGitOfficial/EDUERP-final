import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { badgeClass, fmtDate, money } from "@/lib/module-util";

export const Route = createFileRoute("/_authenticated/finance/reconciliation")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const [refs, setRefs] = useState<Record<string, string>>({});
  const { data: payments } = useQuery({
    queryKey: ["recon-payments"],
    queryFn: async () =>
      (
        await supabase
          .from("payments")
          .select("id,amount,payment_date,method,status,transaction_id")
          .order("payment_date", { ascending: false })
          .limit(50)
      ).data ?? [],
  });
  const { data: recs } = useQuery({
    queryKey: ["recon-list"],
    queryFn: async () =>
      (await supabase.from("payment_reconciliations").select("payment_id, bank_ref, reconciled_at"))
        .data ?? [],
  });
  const recMap = new Map((recs ?? []).map((r: any) => [r.payment_id, r]));

  const reconcile = useMutation({
    mutationFn: async ({ paymentId, bankRef }: { paymentId: string; bankRef: string }) =>
      await supabase
        .from("payment_reconciliations")
        .insert({ payment_id: paymentId, bank_ref: bankRef }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recon-list"] }),
  });
  const unreconcile = useMutation({
    mutationFn: async (paymentId: string) =>
      await supabase.from("payment_reconciliations").delete().eq("payment_id", paymentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recon-list"] }),
  });

  return (
    <>
      <PageHeader
        title="Bank Reconciliation"
        subtitle="Match payments against your bank statement references."
      />
      <Card className="rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="p-3">Date</th>
                <th className="p-3">Method</th>
                <th className="p-3">Amount</th>
                <th className="p-3">Bank ref</th>
                <th className="p-3">Status</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {(payments ?? []).map((p: any) => {
                const r = recMap.get(p.id) as any;
                return (
                  <tr key={p.id} className="border-t">
                    <td className="p-3">{fmtDate(p.payment_date)}</td>
                    <td className="p-3 capitalize">{p.method}</td>
                    <td className="p-3 font-medium">{money(p.amount)}</td>
                    <td className="p-3 font-mono text-xs">
                      {r?.bank_ref ?? (
                        <Input
                          placeholder="Bank statement ref"
                          value={refs[p.id] ?? ""}
                          onChange={(e) => setRefs({ ...refs, [p.id]: e.target.value })}
                          className="max-w-56"
                        />
                      )}
                    </td>
                    <td className="p-3">
                      <Badge className={badgeClass(r ? "reconciled" : "unreconciled")}>
                        {r ? "Reconciled" : "Unreconciled"}
                      </Badge>
                    </td>
                    <td className="p-3 text-right">
                      {r ? (
                        <Button size="sm" variant="ghost" onClick={() => unreconcile.mutate(p.id)}>
                          Undo
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() =>
                            refs[p.id] && reconcile.mutate({ paymentId: p.id, bankRef: refs[p.id] })
                          }
                          disabled={!refs[p.id]}
                        >
                          Reconcile
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
