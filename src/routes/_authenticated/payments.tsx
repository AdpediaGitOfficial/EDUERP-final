import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell, PageHeader } from "@/components/app-shell";
import { EmptyRow } from "@/components/empty-state";
import { apiFetch, apiGet, apiFileObjectUrl } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { inr } from "@/components/fees-collection";
import { downloadCsv, fmtDate } from "@/lib/module-util";
import { Download, Printer, Undo2, Users } from "lucide-react";
import { toast } from "sonner";

async function openReceipt(paymentId: string) {
  const url = await apiFileObjectUrl(`/payments/${paymentId}/receipt.pdf`);
  if (url) window.open(url, "_blank", "noopener");
  else toast.error("Could not open the receipt");
}

// Old /payments path redirects to the Finance → Payments tab.
export const Route = createFileRoute("/_authenticated/payments")({
  beforeLoad: () => {
    throw redirect({ to: "/finance/payments" });
  },
});

type Payment = {
  id: string;
  receiptNo: string;
  studentName: string | null;
  paidAt: string;
  method: string;
  reference: string | null;
  amount: number;
  status: string;
  refundedAmount: number;
  paymentSource: string;
};
type Cashier = {
  cashierId: string | null;
  cashierName: string;
  count: number;
  gross: number;
  refunds: number;
  net: number;
};

export function PaymentsPage() {
  const qc = useQueryClient();
  const [refundFor, setRefundFor] = useState<Payment | null>(null);

  const { data: payments } = useQuery({
    queryKey: ["payments-list"],
    queryFn: async () => (await apiGet<{ rows: Payment[] }>("/payments?pageSize=200")).rows,
  });
  const { data: cashiers } = useQuery({
    queryKey: ["cashier-collection"],
    queryFn: () => apiGet<Cashier[]>("/fees/transactions/cashiers"),
  });

  const rows = payments ?? [];
  const totals = useMemo(() => {
    const gross = rows.reduce((s, p) => s + Number(p.amount), 0);
    const refunds = rows.reduce((s, p) => s + Number(p.refundedAmount), 0);
    return { gross, refunds, net: gross - refunds };
  }, [rows]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["payments-list"] });
    qc.invalidateQueries({ queryKey: ["cashier-collection"] });
  };

  const exportCsv = () =>
    downloadCsv(
      rows.map((p) => ({
        Receipt: p.receiptNo,
        Student: p.studentName ?? "",
        Date: fmtDate(p.paidAt),
        Method: p.method,
        Reference: p.reference ?? "",
        Amount: p.amount,
        Refunded: p.refundedAmount,
        Status: p.status,
      })),
      "transactions",
    );

  const statusBadge = (p: Payment) =>
    p.status === "refunded" ? (
      <Badge className="bg-rose-100 text-rose-700 border-0">Refunded</Badge>
    ) : p.refundedAmount > 0 ? (
      <Badge className="bg-amber-100 text-amber-700 border-0">Part-refunded</Badge>
    ) : p.status === "failed" ? (
      <Badge className="bg-red-100 text-red-700 border-0">Failed</Badge>
    ) : (
      <Badge className="bg-emerald-100 text-emerald-700 border-0">Successful</Badge>
    );

  return (
    <AppShell>
      <PageHeader
        title="Transactions"
        subtitle="All fee payments, refunds and cashier-wise collection."
        action={
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}>
            <Download className="size-4" /> Export CSV
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3 mb-4">
        <Card className="p-4 rounded-2xl">
          <div className="text-xs text-muted-foreground">Gross collected</div>
          <div className="font-display text-2xl font-semibold mt-1">{inr(totals.gross)}</div>
        </Card>
        <Card className="p-4 rounded-2xl">
          <div className="text-xs text-muted-foreground">Refunded</div>
          <div className="font-display text-2xl font-semibold mt-1 text-rose-600">
            {inr(totals.refunds)}
          </div>
        </Card>
        <Card className="p-4 rounded-2xl">
          <div className="text-xs text-muted-foreground">Net</div>
          <div className="font-display text-2xl font-semibold mt-1 text-emerald-600">
            {inr(totals.net)}
          </div>
        </Card>
      </div>

      {/* Cashier-wise */}
      {(cashiers ?? []).length > 0 && (
        <Card className="rounded-2xl overflow-hidden mb-4">
          <div className="flex items-center gap-2 p-3 border-b">
            <Users className="size-4" />
            <div className="text-sm font-medium">Cashier-wise collection</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Cashier</th>
                  <th className="px-3 py-2 font-medium text-right">Receipts</th>
                  <th className="px-3 py-2 font-medium text-right">Gross</th>
                  <th className="px-3 py-2 font-medium text-right">Refunds</th>
                  <th className="px-3 py-2 font-medium text-right">Net</th>
                </tr>
              </thead>
              <tbody>
                {(cashiers ?? []).map((c) => (
                  <tr key={c.cashierId ?? "system"} className="border-t">
                    <td className="px-3 py-2 font-medium">{c.cashierName}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{c.count}</td>
                    <td className="px-3 py-2 text-right">{inr(c.gross)}</td>
                    <td className="px-3 py-2 text-right text-rose-600">{inr(c.refunds)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{inr(c.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Transactions */}
      <Card className="rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-muted-foreground text-left">
              <tr>
                <th className="p-3 font-medium">Receipt</th>
                <th className="p-3 font-medium">Student</th>
                <th className="p-3 font-medium">Date</th>
                <th className="p-3 font-medium">Method</th>
                <th className="p-3 font-medium">Reference</th>
                <th className="p-3 font-medium text-right">Amount</th>
                <th className="p-3 font-medium text-right">Refunded</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="p-3 font-mono text-xs">{p.receiptNo}</td>
                  <td className="p-3">{p.studentName ?? "—"}</td>
                  <td className="p-3 text-muted-foreground">{fmtDate(p.paidAt)}</td>
                  <td className="p-3 capitalize">{p.method}</td>
                  <td className="p-3 text-muted-foreground">{p.reference || "—"}</td>
                  <td className="p-3 text-right font-medium">{inr(p.amount)}</td>
                  <td className="p-3 text-right text-rose-600">
                    {p.refundedAmount > 0 ? inr(p.refundedAmount) : "—"}
                  </td>
                  <td className="p-3">{statusBadge(p)}</td>
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openReceipt(p.id)}
                        aria-label="Receipt PDF"
                        title="Receipt PDF"
                      >
                        <Printer className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setRefundFor(p)}
                        disabled={p.refundedAmount >= Number(p.amount) - 0.009}
                        aria-label="Refund"
                        title="Refund"
                      >
                        <Undo2 className="size-4 text-rose-500" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <EmptyRow
                  colSpan={9}
                  title="No payments yet"
                  hint="Recorded and online payments will show up here."
                />
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {refundFor && (
        <RefundDialog
          payment={refundFor}
          onClose={() => setRefundFor(null)}
          onDone={() => {
            setRefundFor(null);
            refresh();
          }}
        />
      )}
    </AppShell>
  );
}

function RefundDialog({
  payment,
  onClose,
  onDone,
}: {
  payment: Payment;
  onClose: () => void;
  onDone: () => void;
}) {
  const available = Number(payment.amount) - Number(payment.refundedAmount);
  const [amount, setAmount] = useState(String(available));
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const amt = Number(amount);
    if (!(amt > 0)) return toast.error("Enter a refund amount.");
    if (amt > available + 0.009) return toast.error(`Only ${inr(available)} is available.`);
    setSaving(true);
    try {
      const res = await apiFetch(`/payments/${payment.id}/refund`, {
        method: "POST",
        body: JSON.stringify({ amount: amt, reason: reason.trim() || undefined }),
      });
      const body = res ? await res.json() : null;
      if (!res || !res.ok) throw new Error(body?.message ?? "Could not refund");
      toast.success(`Refunded ${inr(amt)}${body?.fullyRefunded ? " (fully refunded)" : ""}`);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not refund");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Refund payment</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="rounded-lg bg-muted/40 p-3">
            <div className="font-mono text-xs text-muted-foreground">{payment.receiptNo}</div>
            <div>
              {payment.studentName} · paid {inr(payment.amount)}
              {payment.refundedAmount > 0 && ` · ${inr(payment.refundedAmount)} already refunded`}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Refund amount</Label>
            <Input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Available to refund: {inr(available)}</p>
          </div>
          <div className="space-y-1.5">
            <Label>Reason (optional)</Label>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={submit} disabled={saving}>
            {saving ? "Refunding…" : "Refund"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
