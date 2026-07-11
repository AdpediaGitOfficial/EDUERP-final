import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiGet } from "@/lib/api/client";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { badgeClass, downloadCsv, fmtDate, money, niceLabel } from "@/lib/module-util";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/hr/expenses")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["expense-claims"],
    queryFn: async () => {
      const res = await apiGet<{ rows: any[] }>("/hr/expense-claims?pageSize=200");
      return res.rows.map((e) => ({
        id: e.id,
        category: e.category,
        amount: e.amount,
        claim_date: e.claimDate,
        status: e.status,
        notes: e.notes,
        staff: { full_name: e.staffName, employee_code: e.employeeCode },
      }));
    },
  });
  const decide = useMutation({
    mutationFn: async (v: { id: string; status: "approved" | "rejected" }) => {
      await apiFetch(`/hr/expense-claims/${v.id}/decision`, {
        method: "PATCH",
        body: JSON.stringify({ status: v.status }),
      });
    },
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["expense-claims"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const total = (data ?? []).reduce((a: number, e: any) => a + Number(e.amount || 0), 0);
  const pending = (data ?? []).filter((e: any) => e.status === "pending").length;
  return (
    <>
      <PageHeader
        title="Expense Claims"
        subtitle="Submit and approve staff reimbursements."
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              downloadCsv(
                (data ?? []).map((e: any) => ({
                  employee: e.staff?.full_name,
                  code: e.staff?.employee_code,
                  category: e.category,
                  amount: e.amount,
                  date: e.claim_date,
                  status: e.status,
                  notes: e.notes,
                })),
                "expense-claims",
              )
            }
          >
            <Download className="size-4 mr-1" />
            Export CSV
          </Button>
        }
      />
      <div className="grid grid-cols-3 gap-3 mb-6">
        <Card className="p-4 rounded-2xl">
          <div className="text-xs text-muted-foreground">Total claims</div>
          <div className="text-2xl font-semibold">{(data ?? []).length}</div>
        </Card>
        <Card className="p-4 rounded-2xl">
          <div className="text-xs text-muted-foreground">Amount</div>
          <div className="text-2xl font-semibold">{money(total)}</div>
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
              <th className="p-3">Category</th>
              <th className="p-3">Amount</th>
              <th className="p-3">Date</th>
              <th className="p-3">Notes</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((e: any) => (
              <tr key={e.id} className="border-t">
                <td className="p-3">
                  <div className="font-medium">{e.staff?.full_name}</div>
                  <div className="text-xs text-muted-foreground">{e.staff?.employee_code}</div>
                </td>
                <td className="p-3">{niceLabel(e.category)}</td>
                <td className="p-3 font-medium">{money(e.amount)}</td>
                <td className="p-3">{fmtDate(e.claim_date)}</td>
                <td className="p-3 text-muted-foreground text-xs">{e.notes}</td>
                <td className="p-3">
                  <Badge className={badgeClass(e.status)}>{niceLabel(e.status)}</Badge>
                </td>
                <td className="p-3 text-right whitespace-nowrap">
                  {e.status === "pending" ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => decide.mutate({ id: e.id, status: "approved" })}
                      >
                        Approve
                      </Button>{" "}
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => decide.mutate({ id: e.id, status: "rejected" })}
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
