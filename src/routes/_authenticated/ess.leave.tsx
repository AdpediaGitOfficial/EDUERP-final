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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { badgeClass, fmtDate, niceLabel } from "@/lib/module-util";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/ess/leave")({ component: Page });

function Page() {
  const { user } = useCurrentUser();
  const qc = useQueryClient();
  const { data: staff } = useQuery({
    queryKey: ["me-s2", user?.id],
    enabled: !!user,
    queryFn: async () =>
      (await supabase.from("staff").select("id").eq("profile_id", user!.id).maybeSingle()).data,
  });
  const { data: leaves } = useQuery({
    queryKey: ["me-leave-list", staff?.id],
    enabled: !!staff,
    queryFn: async () =>
      (
        await supabase
          .from("leave_requests")
          .select("*")
          .eq("staff_id", staff!.id)
          .order("start_date", { ascending: false })
      ).data ?? [],
  });
  const { data: bal } = useQuery({
    queryKey: ["me-balances", staff?.id],
    enabled: !!staff,
    queryFn: async () =>
      (await supabase.from("leave_balances").select("*").eq("staff_id", staff!.id)).data ?? [],
  });

  const [form, setForm] = useState({
    leave_type: "casual",
    start_date: "",
    end_date: "",
    reason: "",
  });
  const [open, setOpen] = useState(false);
  const mut = useMutation({
    mutationFn: async () => {
      if (!staff) return;
      const start = new Date(form.start_date),
        end = new Date(form.end_date);
      const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
      const { error } = await supabase
        .from("leave_requests")
        .insert({ staff_id: staff.id, ...form, days, status: "pending" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Leave request submitted");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["me-leave-list"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        title="My Leave"
        subtitle="Balances, history and apply for leave."
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">Apply for leave</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Apply for leave</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3 text-sm">
                <div>
                  <Label>Type</Label>
                  <Select
                    value={form.leave_type}
                    onValueChange={(v) => setForm({ ...form, leave_type: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="casual">Casual</SelectItem>
                      <SelectItem value="sick">Sick</SelectItem>
                      <SelectItem value="earned">Earned</SelectItem>
                      <SelectItem value="unpaid">Unpaid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Start</Label>
                  <Input
                    type="date"
                    value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                  />
                </div>
                <div>
                  <Label>End</Label>
                  <Input
                    type="date"
                    value={form.end_date}
                    onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Reason</Label>
                  <Input
                    value={form.reason}
                    onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  />
                </div>
                <Button onClick={() => mut.mutate()} disabled={!form.start_date || !form.end_date}>
                  Submit
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />
      <div className="grid md:grid-cols-4 gap-3 mb-6">
        {(bal ?? []).map((b: any) => (
          <Card key={b.id} className="p-4 rounded-2xl">
            <div className="text-xs text-muted-foreground">{niceLabel(b.leave_type)}</div>
            <div className="text-2xl font-semibold">
              {Number(b.allotted) - Number(b.used)}
              <span className="text-sm text-muted-foreground"> / {b.allotted}</span>
            </div>
          </Card>
        ))}
      </div>
      <Card className="rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-left">
              <th className="p-3">Type</th>
              <th className="p-3">Dates</th>
              <th className="p-3">Days</th>
              <th className="p-3">Status</th>
              <th className="p-3">Reason</th>
            </tr>
          </thead>
          <tbody>
            {(leaves ?? []).map((l: any) => (
              <tr key={l.id} className="border-t">
                <td className="p-3">{niceLabel(l.leave_type)}</td>
                <td className="p-3">
                  {fmtDate(l.start_date)} → {fmtDate(l.end_date)}
                </td>
                <td className="p-3">{l.days}</td>
                <td className="p-3">
                  <Badge className={badgeClass(l.status)}>{niceLabel(l.status)}</Badge>
                </td>
                <td className="p-3 text-xs text-muted-foreground">{l.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
