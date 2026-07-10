import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { badgeClass, fmtDate, money, niceLabel } from "@/lib/module-util";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/ess/expenses")({ component: Page });

function Page() {
  const { user } = useCurrentUser();
  const qc = useQueryClient();
  const { data: staff } = useQuery({
    queryKey: ["me-s3", user?.id],
    enabled: !!user,
    queryFn: async () =>
      (await supabase.from("staff").select("id").eq("profile_id", user!.id).maybeSingle()).data,
  });
  const { data } = useQuery({
    queryKey: ["me-exp", staff?.id],
    enabled: !!staff,
    queryFn: async () =>
      (
        await supabase
          .from("expense_claims")
          .select("*")
          .eq("staff_id", staff!.id)
          .order("claim_date", { ascending: false })
      ).data ?? [],
  });
  const [form, setForm] = useState({ category: "travel", amount: "", notes: "" });
  const [open, setOpen] = useState(false);
  const mut = useMutation({
    mutationFn: async () => {
      if (!staff) return;
      const { error } = await supabase.from("expense_claims").insert({
        staff_id: staff.id,
        category: form.category,
        amount: Number(form.amount),
        notes: form.notes,
        status: "pending",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Claim submitted");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["me-exp"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <>
      <PageHeader
        title="My Expenses"
        subtitle="Submit and track reimbursements."
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">New claim</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New expense claim</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3 text-sm">
                <div>
                  <Label>Category</Label>
                  <Select
                    value={form.category}
                    onValueChange={(v) => setForm({ ...form, category: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="travel">Travel</SelectItem>
                      <SelectItem value="food">Food</SelectItem>
                      <SelectItem value="fuel">Fuel</SelectItem>
                      <SelectItem value="office">Office</SelectItem>
                      <SelectItem value="medical">Medical</SelectItem>
                    </SelectContent>
                  </Select>
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
                  <Label>Notes</Label>
                  <Input
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </div>
                <Button onClick={() => mut.mutate()} disabled={!form.amount}>
                  Submit
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />
      <Card className="rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-left">
              <th className="p-3">Date</th>
              <th className="p-3">Category</th>
              <th className="p-3">Amount</th>
              <th className="p-3">Notes</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((e: any) => (
              <tr key={e.id} className="border-t">
                <td className="p-3">{fmtDate(e.claim_date)}</td>
                <td className="p-3">{niceLabel(e.category)}</td>
                <td className="p-3">{money(e.amount)}</td>
                <td className="p-3 text-xs text-muted-foreground">{e.notes}</td>
                <td className="p-3">
                  <Badge className={badgeClass(e.status)}>{niceLabel(e.status)}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
