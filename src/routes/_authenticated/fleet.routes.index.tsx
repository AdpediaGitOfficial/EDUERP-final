import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiFetch } from "@/lib/api/client";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
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
import { Plus, Pencil, ChevronRight, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { useState, useEffect, type ReactNode } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/fleet/routes/")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const { data: routes } = useQuery({
    queryKey: ["f-routes-full"],
    queryFn: () =>
      apiGet<
        {
          id: string;
          name: string;
          vehicle_id: string | null;
          driver_id: string | null;
          vehicle: { id: string; registration_no: string; capacity: number } | null;
          driver: { id: string; full_name: string } | null;
          stops: { id: string; name: string; sequence: number; eta: string | null }[];
          studentCount: number;
        }[]
      >("/fleet/routes-full"),
  });

  return (
    <>
      <PageHeader
        title="Routes & Stops"
        subtitle="Route, driver assignment, ordered stops and roster size."
        action={
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="size-4" /> Add Route
          </Button>
        }
      />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {(routes ?? []).map((r) => (
          <Card
            key={r.id}
            className="rounded-2xl overflow-hidden hover:shadow-md transition cursor-pointer"
            onClick={() => nav({ to: "/fleet/routes/$routeId", params: { routeId: r.id } })}
          >
            <div className="p-4 border-b flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium truncate">{r.name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {r.vehicle?.registration_no ?? "—"} · {r.driver?.full_name ?? "—"} ·{" "}
                  {r.studentCount} students
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditing(r);
                    setOpen(true);
                  }}
                >
                  <Pencil className="size-3.5" />
                </Button>
                <ChevronRight className="size-4 text-muted-foreground self-center" />
              </div>
            </div>
            <ol className="divide-y text-sm">
              {[...(r.stops ?? [])]
                .sort((a, b) => a.sequence - b.sequence)
                .map((s) => (
                  <li key={s.id} className="p-3 flex justify-between gap-2">
                    <span className="truncate">
                      {s.sequence}. {s.name}
                    </span>
                    <span className="text-muted-foreground shrink-0">{s.eta}</span>
                  </li>
                ))}
            </ol>
          </Card>
        ))}
      </div>
      <RouteDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        onDone={() => qc.invalidateQueries({ queryKey: ["f-routes-full"] })}
      />
    </>
  );
}

export function RouteDialog({
  open,
  onOpenChange,
  editing,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: any | null;
  onDone: () => void;
}) {
  const [form, setForm] = useState<any>({ name: "", vehicle_id: "__none", driver_id: "__none" });
  const [stops, setStops] = useState<
    Array<{ name: string; eta: string; estimated_minutes: number }>
  >([]);

  useEffect(() => {
    if (open) {
      setForm({
        name: editing?.name ?? "",
        vehicle_id: editing?.vehicle_id ?? "__none",
        driver_id: editing?.driver_id ?? "__none",
      });
      const es = (editing?.stops ?? []).slice().sort((a: any, b: any) => a.sequence - b.sequence);
      setStops(
        es.map((s: any) => ({
          name: s.name,
          eta: s.eta ?? "",
          estimated_minutes: s.estimated_minutes ?? 0,
        })),
      );
    }
  }, [open, editing]);

  const { data: vehicles } = useQuery({
    queryKey: ["route-veh-picker"],
    queryFn: () => apiGet<{ id: string; registration_no: string }[]>("/fleet/vehicles"),
    enabled: open,
  });
  const { data: drivers } = useQuery({
    queryKey: ["route-drv-picker"],
    queryFn: () => apiGet<{ id: string; full_name: string }[]>("/fleet/drivers"),
    enabled: open,
  });

  const addStop = () => setStops([...stops, { name: "", eta: "", estimated_minutes: 0 }]);
  const removeStop = (i: number) => setStops(stops.filter((_, k) => k !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= stops.length) return;
    const copy = [...stops];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    setStops(copy);
  };
  const updateStop = (i: number, patch: any) =>
    setStops(stops.map((s, k) => (k === i ? { ...s, ...patch } : s)));

  const mut = useMutation({
    mutationFn: async () => {
      const payload = {
        id: editing?.id ?? null,
        name: form.name,
        vehicleId: form.vehicle_id === "__none" ? null : form.vehicle_id,
        driverId: form.driver_id === "__none" ? null : form.driver_id,
        stops: stops.map((s) => ({
          name: s.name,
          eta: s.eta || null,
          estimatedMinutes: Number(s.estimated_minutes) || 0,
        })),
      };
      const res = await apiFetch("/fleet/routes", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (!res || !res.ok) {
        const body = res ? await res.json().catch(() => null) : null;
        throw new Error(body?.message ?? "Save failed");
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Route updated" : "Route added");
      onDone();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Save failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Route" : "Add Route"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Route name">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. West Route - Wakad"
            />
          </Field>
          <Field label="Vehicle">
            <Select
              value={form.vehicle_id}
              onValueChange={(v) => setForm({ ...form, vehicle_id: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">None</SelectItem>
                {(vehicles ?? []).map((v: any) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.registration_no}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Driver">
            <Select
              value={form.driver_id}
              onValueChange={(v) => setForm({ ...form, driver_id: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">None</SelectItem>
                {(drivers ?? []).map((d: any) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <Label className="text-xs">Stops (ordered)</Label>
            <Button size="sm" variant="outline" onClick={addStop}>
              <Plus className="size-3.5" /> Add stop
            </Button>
          </div>
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {stops.map((s, i) => (
              <div key={i} className="grid grid-cols-[auto_1fr_100px_90px_auto] gap-2 items-center">
                <span className="text-xs w-6 text-center text-muted-foreground">#{i + 1}</span>
                <Input
                  placeholder="Stop name"
                  value={s.name}
                  onChange={(e) => updateStop(i, { name: e.target.value })}
                />
                <Input
                  placeholder="ETA (e.g. 07:15 AM)"
                  value={s.eta}
                  onChange={(e) => updateStop(i, { eta: e.target.value })}
                />
                <Input
                  type="number"
                  placeholder="min"
                  value={s.estimated_minutes}
                  onChange={(e) => updateStop(i, { estimated_minutes: e.target.value })}
                />
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => move(i, -1)} disabled={i === 0}>
                    <ArrowUp className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => move(i, 1)}
                    disabled={i === stops.length - 1}
                  >
                    <ArrowDown className="size-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => removeStop(i)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}
            {stops.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-4">
                No stops yet. The last stop is typically the school.
              </div>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground mt-2">
            Minutes = time from route start; used by live tracking simulation.
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !form.name}>
            {mut.isPending ? "Saving…" : editing ? "Save" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
