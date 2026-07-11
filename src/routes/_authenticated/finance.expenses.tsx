import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiGet } from "@/lib/api/client";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { useState } from "react";
import { fmtDate, money, todayISO } from "@/lib/module-util";

export const Route = createFileRoute("/_authenticated/finance/expenses")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    category: "utilities",
    vendor: "",
    amount: "",
    expense_date: todayISO(),
    notes: "",
  });
  const { data } = useQuery({
    queryKey: ["expenses"],
    queryFn: async () => {
      const res = await apiGet<{ rows: any[] }>("/finance/expenses?pageSize=200");
      return res.rows;
    },
  });
  const add = useMutation({
    mutationFn: async () =>
      apiFetch("/finance/expenses", {
        method: "POST",
        body: JSON.stringify({
          category: form.category,
          amount: Number(form.amount),
          expenseDate: form.expense_date,
          notes: form.notes || undefined,
          vendor: form.vendor || undefined,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      setOpen(false);
      setForm({
        category: "utilities",
        vendor: "",
        amount: "",
        expense_date: todayISO(),
        notes: "",
      });
    },
  });
  const total = (data ?? []).reduce((a: number, e: any) => a + Number(e.amount || 0), 0);
  return (
    <>
      <PageHeader
        title="Expenses"
        subtitle="Log and track school expenses."
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4 mr-1" /> Add expense
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New expense</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3">
                <div>
                  <Label>Category</Label>
                  <select
                    className="w-full border rounded-md h-10 px-3"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                  >
                    <option value="utilities">Utilities</option>
                    <option value="supplies">Supplies</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="salaries">Salaries</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <Label>Vendor</Label>
                  <Input
                    value={form.vendor}
                    onChange={(e) => setForm({ ...form, vendor: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Amount</Label>
                  <Input
                    type="number"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={form.expense_date}
                    onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Notes</Label>
                  <Input
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </div>
                <Button onClick={() => add.mutate()} disabled={!form.amount}>
                  Save
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />
      <Card className="p-4 rounded-2xl mb-4">
        <div className="text-xs text-muted-foreground">Total</div>
        <div className="text-2xl font-semibold">{money(total)}</div>
      </Card>
      <Card className="rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="p-3">Date</th>
                <th className="p-3">Category</th>
                <th className="p-3">Vendor</th>
                <th className="p-3">Amount</th>
                <th className="p-3">Notes</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((e: any) => (
                <tr key={e.id} className="border-t">
                  <td className="p-3">{fmtDate(e.expense_date)}</td>
                  <td className="p-3 capitalize">{e.category}</td>
                  <td className="p-3">{e.vendor ?? "—"}</td>
                  <td className="p-3 font-medium">{money(e.amount)}</td>
                  <td className="p-3 text-muted-foreground">{e.notes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
