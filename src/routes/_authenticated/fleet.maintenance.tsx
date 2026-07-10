import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmtDate, money, todayISO } from "@/lib/module-util";
import { Plus, AlertTriangle } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/fleet/maintenance")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ["maint-all"],
    queryFn: async () =>
      (
        await supabase
          .from("vehicle_maintenance")
          .select("*, vehicle:vehicle_id(registration_no)")
          .order("service_date", { ascending: false })
      ).data ?? [],
  });

  const overdue = (data ?? []).filter(
    (m: any) => m.next_due_date && new Date(m.next_due_date) < new Date(),
  );
  const total = (data ?? []).reduce((a: number, r: any) => a + Number(r.cost || 0), 0);

  return (
    <>
      <PageHeader
        title="Maintenance"
        subtitle="Service history, upcoming due dates, calendar."
        action={
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="size-4" /> Log service
          </Button>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <Card className="p-4 rounded-2xl">
          <div className="text-xs text-muted-foreground">Total spend</div>
          <div className="text-2xl font-semibold">{money(total)}</div>
        </Card>
        <Card className="p-4 rounded-2xl">
          <div className="text-xs text-muted-foreground">Entries</div>
          <div className="text-2xl font-semibold">{(data ?? []).length}</div>
        </Card>
        <Card className="p-4 rounded-2xl">
          <div className="text-xs text-muted-foreground">Overdue services</div>
          <div className={`text-2xl font-semibold ${overdue.length ? "text-red-600" : ""}`}>
            {overdue.length}
          </div>
        </Card>
      </div>

      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list">Service log</TabsTrigger>
          <TabsTrigger value="calendar">Upcoming calendar</TabsTrigger>
        </TabsList>
        <TabsContent value="list">
          <Card className="rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="p-3">Date</th>
                    <th className="p-3">Vehicle</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Vendor</th>
                    <th className="p-3">Cost</th>
                    <th className="p-3">Next due</th>
                  </tr>
                </thead>
                <tbody>
                  {(data ?? []).map((m: any) => {
                    const od = m.next_due_date && new Date(m.next_due_date) < new Date();
                    return (
                      <tr key={m.id} className="border-t">
                        <td className="p-3">{fmtDate(m.service_date)}</td>
                        <td className="p-3 font-mono text-xs">{m.vehicle?.registration_no}</td>
                        <td className="p-3">{m.service_type}</td>
                        <td className="p-3">{m.vendor ?? "—"}</td>
                        <td className="p-3">{money(m.cost)}</td>
                        <td className="p-3">
                          {fmtDate(m.next_due_date)}{" "}
                          {od && (
                            <Badge className="bg-red-100 text-red-800 border-0">
                              <AlertTriangle className="size-3 inline mr-0.5" />
                              Overdue
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
        <TabsContent value="calendar">
          <MaintCalendar entries={data ?? []} />
        </TabsContent>
      </Tabs>

      <MaintDialog
        open={open}
        onOpenChange={setOpen}
        onDone={() => qc.invalidateQueries({ queryKey: ["maint-all"] })}
      />
    </>
  );
}

function MaintCalendar({ entries }: { entries: any[] }) {
  const [monthOffset, setMonthOffset] = useState(0);
  const anchor = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + monthOffset);
    return d;
  }, [monthOffset]);
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  const first = new Date(y, m, 1);
  const last = new Date(y, m + 1, 0);
  const startDow = first.getDay();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= last.getDate(); d++) cells.push(new Date(y, m, d));

  const byDay = new Map<string, any[]>();
  for (const e of entries) {
    if (!e.next_due_date) continue;
    const d = new Date(e.next_due_date);
    if (d.getFullYear() === y && d.getMonth() === m) {
      const k = d.toISOString().slice(0, 10);
      (byDay.get(k) ?? byDay.set(k, []).get(k))!.push(e);
    }
  }

  return (
    <Card className="rounded-2xl p-3">
      <div className="flex items-center justify-between mb-3">
        <Button variant="ghost" size="sm" onClick={() => setMonthOffset((v) => v - 1)}>
          ‹
        </Button>
        <div className="font-medium">
          {anchor.toLocaleString("en-IN", { month: "long", year: "numeric" })}
        </div>
        <Button variant="ghost" size="sm" onClick={() => setMonthOffset((v) => v + 1)}>
          ›
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-[10px] uppercase text-muted-foreground mb-1">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} className="text-center py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const k = d.toISOString().slice(0, 10);
          const items = byDay.get(k) ?? [];
          return (
            <div key={i} className="min-h-16 border rounded p-1 text-xs">
              <div className="text-muted-foreground">{d.getDate()}</div>
              {items.slice(0, 2).map((it: any) => (
                <div
                  key={it.id}
                  className="truncate mt-0.5 rounded bg-blue-100 text-blue-800 px-1 py-0.5"
                >
                  {it.vehicle?.registration_no ?? "—"} · {it.service_type}
                </div>
              ))}
              {items.length > 2 && <div className="text-muted-foreground">+{items.length - 2}</div>}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function MaintDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const [f, setF] = useState<any>({ service_date: todayISO() });
  const { data: vehicles } = useQuery({
    queryKey: ["maint-veh-picker"],
    queryFn: async () =>
      (await supabase.from("fleet_vehicles").select("id,registration_no")).data ?? [],
    enabled: open,
  });
  const mut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("vehicle_maintenance").insert({
        vehicle_id: f.vehicle_id,
        service_date: f.service_date,
        service_type: f.service_type,
        vendor: f.vendor || null,
        cost: Number(f.cost || 0),
        next_due_date: f.next_due_date || null,
        notes: f.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Service logged");
      onDone();
      onOpenChange(false);
      setF({ service_date: todayISO() });
    },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Log maintenance</DialogTitle>
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
              value={f.service_date}
              onChange={(e) => setF({ ...f, service_date: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Type</Label>
            <Input
              value={f.service_type ?? ""}
              onChange={(e) => setF({ ...f, service_type: e.target.value })}
              placeholder="Oil change"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Vendor</Label>
            <Input
              value={f.vendor ?? ""}
              onChange={(e) => setF({ ...f, vendor: e.target.value })}
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
          <div className="col-span-2 flex flex-col gap-1">
            <Label className="text-xs">Next due date</Label>
            <Input
              type="date"
              value={f.next_due_date ?? ""}
              onChange={(e) => setF({ ...f, next_due_date: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || !f.vehicle_id || !f.service_type}
          >
            {mut.isPending ? "Saving…" : "Log"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
