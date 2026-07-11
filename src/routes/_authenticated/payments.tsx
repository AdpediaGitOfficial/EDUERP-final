import { RequireRole } from "@/components/require-role";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell, PageHeader } from "@/components/app-shell";
import { EmptyRow } from "@/components/empty-state";
import { apiGet, apiFileObjectUrl } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

async function openReceipt(paymentId: string) {
  const url = await apiFileObjectUrl(`/payments/${paymentId}/receipt.pdf`);
  if (url) window.open(url, "_blank", "noopener");
  else toast.error("Could not open the receipt");
}

export const Route = createFileRoute("/_authenticated/payments")({
  component: () => (
    <RequireRole roles={["admin"]}>
      <PaymentsPage />
    </RequireRole>
  ),
});

function PaymentsPage() {
  const { data } = useQuery({
    queryKey: ["payments-list"],
    queryFn: async () => {
      const res = await apiGet<{ rows: any[] }>("/payments?pageSize=200");
      return res.rows.map((p) => ({
        id: p.id,
        receipt_no: p.receiptNo,
        student_name: p.studentName,
        paid_at: p.paidAt,
        method: p.method,
        reference: p.reference,
        amount: p.amount,
      }));
    },
  });
  const total = (data ?? []).reduce((s, p) => s + Number(p.amount), 0);
  return (
    <AppShell>
      <PageHeader title="Payments" subtitle="All fee payments recorded." />
      <Card className="p-5 rounded-2xl bg-stat-violet text-stat-violet-foreground mb-6 max-w-sm">
        <div className="text-sm opacity-90">Total collected</div>
        <div className="font-display text-3xl font-semibold mt-2">₹{total.toFixed(2)}</div>
      </Card>
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
                <th className="p-3 font-medium">Amount</th>
                <th className="p-3 font-medium">Receipt</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((p: any) => (
                <tr key={p.id} className="border-t">
                  <td className="p-3 font-mono text-xs">{p.receipt_no}</td>
                  <td className="p-3">{p.student_name}</td>
                  <td className="p-3 text-muted-foreground">
                    {format(new Date(p.paid_at), "MMM d, yyyy")}
                  </td>
                  <td className="p-3 capitalize">{p.method}</td>
                  <td className="p-3 text-muted-foreground">{p.reference || "—"}</td>
                  <td className="p-3 font-medium">₹{Number(p.amount).toFixed(2)}</td>
                  <td className="p-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openReceipt(p.id)}
                      aria-label={`Download receipt ${p.receipt_no}`}
                    >
                      <Download className="size-4" /> PDF
                    </Button>
                  </td>
                </tr>
              ))}
              {(data ?? []).length === 0 && (
                <EmptyRow
                  colSpan={7}
                  title="No payments yet"
                  hint="Recorded and online payments will show up here."
                />
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </AppShell>
  );
}
