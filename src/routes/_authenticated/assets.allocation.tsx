import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, ArrowRightLeft } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { daysBetween } from "@/lib/assets-util";

export const Route = createFileRoute("/_authenticated/assets/allocation")({
  component: Allocation,
});

function Allocation() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [returnOf, setReturnOf] = useState<any>(null);
  const [returnCondition, setReturnCondition] = useState("good");

  const { data: assetsAvail } = useQuery({
    queryKey: ["assets-avail"],
    queryFn: async () =>
      (
        await supabase
          .from("assets")
          .select("id,name,asset_code")
          .eq("status", "available")
          .order("asset_code")
      ).data ?? [],
  });
  const { data: active } = useQuery({
    queryKey: ["allocations-active"],
    queryFn: async () =>
      (
        await supabase
          .from("asset_allocations")
          .select(
            "id,asset_id,assignee_label,allocated_at,expected_return_at,notes,assets(name,asset_code)",
          )
          .is("returned_at", null)
          .order("allocated_at", { ascending: false })
      ).data ?? [],
  });

  const allocate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const asset_id = String(fd.get("asset_id") || "");
    if (!asset_id) return toast.error("Select an asset");
    const { error } = await supabase.from("asset_allocations").insert({
      asset_id,
      assignee_label: String(fd.get("assignee_label") || ""),
      allocated_at: String(fd.get("allocated_at") || new Date().toISOString().slice(0, 10)),
      expected_return_at: String(fd.get("expected_return_at") || "") || null,
      notes: String(fd.get("notes") || "") || null,
    });
    if (error) return toast.error(error.message);
    const { error: e2 } = await supabase
      .from("assets")
      .update({ status: "in_use", assigned_to_label: String(fd.get("assignee_label") || "") })
      .eq("id", asset_id);
    if (e2) toast.error(e2.message);
    toast.success("Allocated");
    setOpen(false);
    qc.invalidateQueries();
  };

  const doReturn = async () => {
    if (!returnOf) return;
    const returned_at = new Date().toISOString().slice(0, 10);
    const { error } = await supabase
      .from("asset_allocations")
      .update({ returned_at, return_condition: returnCondition })
      .eq("id", returnOf.id);
    if (error) return toast.error(error.message);
    const newStatus =
      returnCondition === "damaged" || returnCondition === "needs_repair" ? "repair" : "available";
    await supabase
      .from("assets")
      .update({ status: newStatus, assigned_to_label: null })
      .eq("id", returnOf.asset_id);
    toast.success(newStatus === "repair" ? "Returned & routed to repair" : "Returned to available");
    setReturnOf(null);
    qc.invalidateQueries();
  };

  return (
    <>
      <PageHeader
        title="Allocations"
        subtitle="Assign available assets and track returns."
        action={
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" /> Allocate asset
          </Button>
        }
      />

      <Card className="rounded-2xl overflow-hidden">
        <div className="p-4 border-b flex items-center gap-2">
          <ArrowRightLeft className="size-4 text-muted-foreground" />
          <div className="font-medium">Active allocations</div>
          <div className="ml-auto text-xs text-muted-foreground">{active?.length ?? 0}</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-3">Asset</th>
                <th className="p-3">Assigned to</th>
                <th className="p-3">Since</th>
                <th className="p-3">Days</th>
                <th className="p-3">Expected return</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {(active ?? []).map((a: any) => (
                <tr key={a.id} className="border-t">
                  <td className="p-3">
                    <div className="font-medium">{a.assets?.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {a.assets?.asset_code}
                    </div>
                  </td>
                  <td className="p-3">{a.assignee_label}</td>
                  <td className="p-3">{new Date(a.allocated_at).toLocaleDateString()}</td>
                  <td className="p-3">{daysBetween(a.allocated_at)}</td>
                  <td className="p-3">
                    {a.expected_return_at
                      ? new Date(a.expected_return_at).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="p-3 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setReturnOf(a);
                        setReturnCondition("good");
                      }}
                    >
                      Return
                    </Button>
                  </td>
                </tr>
              ))}
              {(active ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">
                    No active allocations.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Allocate asset</DialogTitle>
          </DialogHeader>
          <form onSubmit={allocate} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Asset (available only)</Label>
              <Select name="asset_id">
                <SelectTrigger>
                  <SelectValue placeholder="Choose asset…" />
                </SelectTrigger>
                <SelectContent>
                  {(assetsAvail ?? []).map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.asset_code} · {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Assign to (staff or room)</Label>
              <Input name="assignee_label" required placeholder="Anjali Nair or Room 204" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Allocation date</Label>
                <Input
                  name="allocated_at"
                  type="date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Expected return</Label>
                <Input name="expected_return_at" type="date" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input name="notes" />
            </div>
            <Button type="submit" className="w-full">
              Allocate
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!returnOf} onOpenChange={(o) => !o && setReturnOf(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Return asset</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm">
              {returnOf?.assets?.name}{" "}
              <span className="text-muted-foreground font-mono">
                ({returnOf?.assets?.asset_code})
              </span>
            </div>
            <div className="space-y-1.5">
              <Label>Condition on return</Label>
              <Select value={returnCondition} onValueChange={setReturnCondition}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="good">Good — back to available</SelectItem>
                  <SelectItem value="damaged">Damaged — route to repair</SelectItem>
                  <SelectItem value="needs_repair">Needs repair — route to repair</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={doReturn}>
              Confirm return
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
