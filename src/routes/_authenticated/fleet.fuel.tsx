import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiGet } from "@/lib/api/client";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fmtDate, money, todayISO } from "@/lib/module-util";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/fleet/fuel")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ["fuel-logs-all"],
    queryFn: async () => {
      const rows = await apiGet<any[]>("/fleet/fuel-logs");
      return rows.map((f) => ({
        id: f.id,
        vehicle_id: f.vehicleId,
        date: f.date,
        liters: f.liters,
        cost: f.cost,
        odometer: f.odometer,
        vehicle: { registration_no: f.registrationNo },
      }));
    },
  });

  // Efficiency per vehicle: order asc by date, compute km/L on diffs
  const perVehicle = new Map<string, any[]>();
  for (const f of data ?? []) {
    const k = f.vehicle_id;
    (perVehicle.get(k) ?? perVehicle.set(k, []).get(k))!.push(f);
  }
  const effByRow = new Map<string, number>();
  const decliningVehicles = new Set<string>();
  for (const [vid, rows] of perVehicle) {
    const asc = [...rows].sort((a, b) => a.date.localeCompare(b.date));
    const effs: number[] = [];
    for (let i = 1; i < asc.length; i++) {
      const km = Number(asc[i].odometer) - Number(asc[i - 1].odometer);
      const l = Number(asc[i].liters);
      if (km > 0 && l > 0) {
        const e = km / l;
        effs.push(e);
        effByRow.set(asc[i].id, e);
      }
    }
    if (effs.length >= 6) {
      const last3 = effs.slice(-3).reduce((a, b) => a + b, 0) / 3;
      const prev3 = effs.slice(-6, -3).reduce((a, b) => a + b, 0) / 3;
      if (last3 < prev3 * 0.95) decliningVehicles.add(vid);
    }
  }

  const total = (data ?? []).reduce((a: number, r: any) => a + Number(r.cost || 0), 0);

  return (
    <>
      <PageHeader
        title="Fuel Logs"
        subtitle="Refuelling history and per-vehicle efficiency."
        action={
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="size-4" /> Log fuel
          </Button>
        }
      />
      <Card className="p-4 rounded-2xl mb-4">
        <div className="text-xs text-muted-foreground">Total spend</div>
        <div className="text-2xl font-semibold">{money(total)}</div>
      </Card>
      <Card className="rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="p-3">Date</th>
                <th className="p-3">Vehicle</th>
                <th className="p-3">Liters</th>
                <th className="p-3">Cost</th>
                <th className="p-3">Odometer</th>
                <th className="p-3">Efficiency</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((r: any) => {
                const eff = effByRow.get(r.id);
                const dec = decliningVehicles.has(r.vehicle_id);
                return (
                  <tr key={r.id} className="border-t">
                    <td className="p-3">{fmtDate(r.date)}</td>
                    <td className="p-3 font-mono text-xs">
                      {r.vehicle?.registration_no}{" "}
                      {dec && (
                        <Badge className="ml-1 bg-red-100 text-red-800 border-0">↓ trend</Badge>
                      )}
                    </td>
                    <td className="p-3">{Number(r.liters).toFixed(1)} L</td>
                    <td className="p-3 font-medium">{money(r.cost)}</td>
                    <td className="p-3">{r.odometer ?? "—"}</td>
                    <td className="p-3">{eff ? `${eff.toFixed(2)} km/L` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <FuelDialog
        open={open}
        onOpenChange={setOpen}
        onDone={() => qc.invalidateQueries({ queryKey: ["fuel-logs-all"] })}
      />
    </>
  );
}

function FuelDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const [f, setF] = useState<any>({ date: todayISO() });
  const { data: vehicles } = useQuery({
    queryKey: ["fuel-veh-picker"],
    queryFn: async () => {
      const rows = await apiGet<any[]>("/fleet/vehicles");
      return rows.map((v) => ({ id: v.id, registration_no: v.registrationNo }));
    },
    enabled: open,
  });
  const mut = useMutation({
    mutationFn: async () => {
      await apiFetch("/fleet/fuel-logs", {
        method: "POST",
        body: JSON.stringify({
          vehicleId: f.vehicle_id,
          date: f.date,
          liters: Number(f.liters),
          cost: Number(f.cost),
          odometer: f.odometer ? Number(f.odometer) : undefined,
        }),
      });
    },
    onSuccess: () => {
      toast.success("Fuel logged");
      onDone();
      onOpenChange(false);
      setF({ date: todayISO() });
    },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Log fuel entry</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 flex flex-col gap-1">
            <Label className="text-xs">Vehicle</Label>
            <Select value={f.vehicle_id} onValueChange={(v) => setF({ ...f, vehicle_id: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Select vehicle" />
              </SelectTrigger>
              <SelectContent>
                {(vehicles ?? []).map((v: any) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.registration_no}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Date</Label>
            <Input
              type="date"
              value={f.date ?? ""}
              onChange={(e) => setF({ ...f, date: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Liters</Label>
            <Input
              type="number"
              step="0.1"
              value={f.liters ?? ""}
              onChange={(e) => setF({ ...f, liters: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Cost (₹)</Label>
            <Input
              type="number"
              value={f.cost ?? ""}
              onChange={(e) => setF({ ...f, cost: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Odometer</Label>
            <Input
              type="number"
              value={f.odometer ?? ""}
              onChange={(e) => setF({ ...f, odometer: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || !f.vehicle_id || !f.liters || !f.cost}
          >
            {mut.isPending ? "Saving…" : "Log"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
