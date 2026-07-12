import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiFetch } from "@/lib/api/client";
import { PageHeader } from "@/components/app-shell";
import { EmptyRow } from "@/components/empty-state";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, ArrowRightLeft, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type ActiveAllocation = {
  id: string;
  asset_id: string;
  assetName: string | null;
  assetCode: string | null;
  assignee_label: string;
  allocated_at: string | null;
  expected_return_at: string | null;
  notes: string | null;
  days: number;
  overdue: boolean;
  overdueDays: number;
};

export const Route = createFileRoute("/_authenticated/assets/allocation")({
  component: Allocation,
});

function Allocation() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [returnOf, setReturnOf] = useState<ActiveAllocation | null>(null);
  const [returnCondition, setReturnCondition] = useState("good");

  const { data: assetsAvail } = useQuery({
    queryKey: ["assets-avail"],
    queryFn: () =>
      apiGet<{ id: string; name: string; asset_code: string | null }[]>("/assets?status=available"),
  });
  const { data: active } = useQuery({
    queryKey: ["allocations-active"],
    queryFn: () => apiGet<ActiveAllocation[]>("/assets/allocations?active=true"),
  });

  const overdueCount = (active ?? []).filter((a) => a.overdue).length;

  const allocate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const assetId = String(fd.get("asset_id") || "");
    if (!assetId) return toast.error("Select an asset");
    const res = await apiFetch("/assets/allocations", {
      method: "POST",
      body: JSON.stringify({
        assetId,
        assigneeLabel: String(fd.get("assignee_label") || ""),
        allocatedAt: String(fd.get("allocated_at") || "") || null,
        expectedReturnAt: String(fd.get("expected_return_at") || "") || null,
        notes: String(fd.get("notes") || "") || null,
      }),
    });
    if (!res || !res.ok) {
      const body = res ? await res.json().catch(() => null) : null;
      return toast.error(body?.message ?? "Could not allocate");
    }
    toast.success("Allocated");
    setOpen(false);
    qc.invalidateQueries();
  };

  const doReturn = async () => {
    if (!returnOf) return;
    const res = await apiFetch(`/assets/allocations/${returnOf.id}/return`, {
      method: "POST",
      body: JSON.stringify({ condition: returnCondition }),
    });
    if (!res || !res.ok) {
      const body = res ? await res.json().catch(() => null) : null;
      return toast.error(body?.message ?? "Could not return");
    }
    const routed = returnCondition === "damaged" || returnCondition === "needs_repair";
    toast.success(routed ? "Returned & routed to repair" : "Returned to available");
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

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Card className="p-4 rounded-2xl">
          <div className="text-xs text-muted-foreground">Active</div>
          <div className="text-2xl font-semibold mt-1">{active?.length ?? 0}</div>
        </Card>
        <Card className="p-4 rounded-2xl">
          <div className="text-xs text-muted-foreground">Overdue</div>
          <div
            className={`text-2xl font-semibold mt-1 ${overdueCount > 0 ? "text-red-600" : "text-foreground"}`}
          >
            {overdueCount}
          </div>
        </Card>
        <Card className="p-4 rounded-2xl">
          <div className="text-xs text-muted-foreground">Available to allocate</div>
          <div className="text-2xl font-semibold mt-1">{assetsAvail?.length ?? 0}</div>
        </Card>
      </div>

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
              {(active ?? []).map((a) => (
                <tr key={a.id} className={`border-t ${a.overdue ? "bg-red-50/60" : ""}`}>
                  <td className="p-3">
                    <div className="font-medium">{a.assetName}</div>
                    <div className="text-xs text-muted-foreground font-mono">{a.assetCode}</div>
                  </td>
                  <td className="p-3">{a.assignee_label}</td>
                  <td className="p-3">
                    {a.allocated_at ? new Date(a.allocated_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="p-3">{a.days}</td>
                  <td className="p-3">
                    {a.expected_return_at ? (
                      <span className="inline-flex items-center gap-1.5">
                        {new Date(a.expected_return_at).toLocaleDateString()}
                        {a.overdue && (
                          <StatusBadge tone="danger" label={`Overdue · ${a.overdueDays}d`} />
                        )}
                      </span>
                    ) : (
                      "—"
                    )}
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
                <EmptyRow
                  colSpan={6}
                  title="No active allocations"
                  hint="Allocate an available asset to a staff member or room."
                />
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
              {returnOf?.assetName}{" "}
              <span className="text-muted-foreground font-mono">({returnOf?.assetCode})</span>
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
