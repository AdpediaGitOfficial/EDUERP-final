import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiFetch } from "@/lib/api/client";
import { useConfirm } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import { ArrowLeft, Pencil, UserPlus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { RouteDialog } from "./fleet.routes.index";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/fleet/routes/$routeId")({ component: Page });

function Page() {
  const { routeId } = Route.useParams();
  const qc = useQueryClient();
  const nav = useNavigate();
  const confirm = useConfirm();
  const [edit, setEdit] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);

  const { data: r } = useQuery({
    queryKey: ["route-detail", routeId],
    queryFn: () =>
      apiGet<{
        id: string;
        name: string;
        vehicle_id: string | null;
        driver_id: string | null;
        vehicle: { id: string; registration_no: string; capacity: number } | null;
        driver: { id: string; full_name: string } | null;
        stops: {
          id: string;
          name: string;
          sequence: number;
          eta: string | null;
          estimated_minutes: number;
        }[];
      }>(`/fleet/routes/${routeId}`),
  });
  const { data: roster } = useQuery({
    queryKey: ["route-roster", routeId],
    queryFn: () =>
      apiGet<
        {
          id: string;
          studentId: string;
          studentName: string | null;
          admissionNo: string | null;
          stopId: string | null;
          stopName: string | null;
        }[]
      >(`/fleet/routes/${routeId}/roster`),
  });

  const stops = useMemo(() => [...(r?.stops ?? [])].sort((a, b) => a.sequence - b.sequence), [r]);
  const rosterByStop = useMemo(() => {
    const g: Record<string, typeof roster> = {};
    for (const rs of roster ?? []) {
      const k = rs.stopId ?? "unassigned";
      (g[k] ||= []).push(rs);
    }
    return g;
  }, [roster]);

  const removeAssignment = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/fleet/route-students/${id}`, { method: "DELETE" });
      if (!res || !res.ok) throw new Error("Remove failed");
    },
    onSuccess: () => {
      toast.success("Removed");
      qc.invalidateQueries({ queryKey: ["route-roster", routeId] });
    },
  });

  const askRemove = async (id: string, name: string | null) => {
    if (
      await confirm({
        title: "Remove from route?",
        description: `${name ?? "This student"} will be taken off this transport route. You can re-assign them anytime.`,
        confirmText: "Remove",
        destructive: true,
      })
    )
      removeAssignment.mutate(id);
  };

  if (!r) return <div className="p-6">Loading route…</div>;
  const capacity = r.vehicle?.capacity ?? 0;
  const filled = (roster ?? []).length;

  return (
    <>
      <div className="mb-3">
        <Button variant="ghost" size="sm" onClick={() => nav({ to: "/fleet/routes" })}>
          <ArrowLeft className="size-4" /> Back to routes
        </Button>
      </div>
      <PageHeader
        title={r.name}
        subtitle={`${r.vehicle?.registration_no ?? "no vehicle"} · ${r.driver?.full_name ?? "no driver"} · ${filled}${capacity ? ` / ${capacity}` : ""} students`}
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setEdit(true)}>
              <Pencil className="size-3.5" /> Edit route
            </Button>
            <Button size="sm" onClick={() => setAssignOpen(true)}>
              <UserPlus className="size-3.5" /> Assign students
            </Button>
          </div>
        }
      />

      {capacity > 0 && (
        <Card className="p-4 rounded-2xl mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium">Seat utilization</div>
            <div className="text-sm">
              <span className={filled > capacity ? "text-red-600 font-semibold" : "font-semibold"}>
                {filled}
              </span>{" "}
              <span className="text-muted-foreground">/ {capacity}</span>
              {filled > capacity && (
                <Badge className="ml-2 bg-red-100 text-red-800 border-0">
                  Over capacity by {filled - capacity}
                </Badge>
              )}
            </div>
          </div>
          <div className="h-2.5 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                filled > capacity
                  ? "bg-red-500"
                  : filled / capacity > 0.85
                    ? "bg-amber-500"
                    : "bg-emerald-500"
              }`}
              style={{ width: `${Math.min(100, capacity ? (filled / capacity) * 100 : 0)}%` }}
            />
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.6fr] gap-4">
        <Card className="rounded-2xl overflow-hidden min-w-0">
          <div className="p-3 border-b font-medium">Stop sequence</div>
          <ol className="divide-y text-sm">
            {stops.map((s: any) => (
              <li key={s.id} className="p-3">
                <div className="flex justify-between">
                  <span className="truncate">
                    {s.sequence}. {s.name}
                  </span>
                  <span className="text-muted-foreground shrink-0">{s.eta ?? "—"}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {s.estimated_minutes} min from start · {rosterByStop[s.id]?.length ?? 0} students
                </div>
              </li>
            ))}
          </ol>
        </Card>

        <Card className="rounded-2xl overflow-hidden min-w-0">
          <div className="p-3 border-b font-medium">
            Students roster ({filled}
            {capacity ? ` / ${capacity}` : ""})
          </div>
          <div className="max-h-[600px] overflow-y-auto">
            {stops.map((s: any) => {
              const list = rosterByStop[s.id] ?? [];
              if (list.length === 0) return null;
              return (
                <div key={s.id} className="border-b">
                  <div className="px-3 py-2 bg-muted/30 text-xs font-medium">
                    {s.name} <span className="text-muted-foreground">({list.length})</span>
                  </div>
                  <ul className="divide-y">
                    {list.map((rs: any) => (
                      <li
                        key={rs.id}
                        className="px-3 py-2 flex items-center justify-between gap-2 text-sm"
                      >
                        <div className="min-w-0 truncate">
                          {rs.studentName}{" "}
                          <span className="text-xs text-muted-foreground font-mono">
                            · {rs.admissionNo}
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Remove ${rs.studentName ?? "student"} from route`}
                          onClick={() => askRemove(rs.id, rs.studentName)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            {rosterByStop["unassigned"]?.length && (
              <div className="border-b">
                <div className="px-3 py-2 bg-amber-50 text-xs font-medium">
                  No stop assigned ({rosterByStop["unassigned"].length})
                </div>
                <ul className="divide-y">
                  {rosterByStop["unassigned"].map((rs: any) => (
                    <li
                      key={rs.id}
                      className="px-3 py-2 flex items-center justify-between gap-2 text-sm"
                    >
                      <div className="min-w-0 truncate">{rs.studentName}</div>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Remove ${rs.studentName ?? "student"} from route`}
                        onClick={() => askRemove(rs.id, rs.studentName)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {filled === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No students on this route yet.
              </div>
            )}
          </div>
        </Card>
      </div>

      <RouteDialog
        open={edit}
        onOpenChange={setEdit}
        editing={r}
        onDone={() => qc.invalidateQueries({ queryKey: ["route-detail", routeId] })}
      />
      <AssignDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        routeId={routeId}
        stops={stops}
        onDone={() => qc.invalidateQueries({ queryKey: ["route-roster", routeId] })}
      />
    </>
  );
}

function AssignDialog({
  open,
  onOpenChange,
  routeId,
  stops,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  routeId: string;
  stops: any[];
  onDone: () => void;
}) {
  const [q, setQ] = useState("");
  const [stopId, setStopId] = useState<string>(stops[0]?.id ?? "");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const { data: students } = useQuery({
    queryKey: ["students-picker", q],
    queryFn: () =>
      apiGet<{ id: string; admission_no: string | null; full_name: string | null }[]>(
        `/fleet/students-picker?q=${encodeURIComponent(q)}`,
      ),
    enabled: open,
  });

  const mut = useMutation({
    mutationFn: async () => {
      if (!stopId) throw new Error("Pick a stop");
      if (picked.size === 0) throw new Error("Pick at least one student");
      const res = await apiFetch("/fleet/route-students", {
        method: "POST",
        body: JSON.stringify({ routeId, stopId, studentIds: Array.from(picked) }),
      });
      if (!res || !res.ok) {
        const body = res ? await res.json().catch(() => null) : null;
        throw new Error(body?.message ?? "Assign failed");
      }
    },
    onSuccess: () => {
      toast.success(`Assigned ${picked.size} student(s)`);
      setPicked(new Set());
      onDone();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign students to route</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Search students</Label>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name or admission #"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Assign to stop</Label>
            <Select value={stopId} onValueChange={setStopId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {stops.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.sequence}. {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-3 max-h-72 overflow-y-auto border rounded">
          {(students ?? []).map((s: any) => (
            <label
              key={s.id}
              className="flex items-center gap-2 px-3 py-2 border-b text-sm cursor-pointer hover:bg-muted/40"
            >
              <Checkbox
                checked={picked.has(s.id)}
                onCheckedChange={(v) => {
                  const c = new Set(picked);
                  if (v) c.add(s.id);
                  else c.delete(s.id);
                  setPicked(c);
                }}
              />
              <span className="min-w-0 truncate">{s.full_name}</span>
              <span className="text-xs text-muted-foreground font-mono ml-auto">
                {s.admission_no}
              </span>
            </label>
          ))}
          {(students ?? []).length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">No matches.</div>
          )}
        </div>
        <DialogFooter>
          <div className="text-xs text-muted-foreground mr-auto">{picked.size} selected</div>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || picked.size === 0}>
            {mut.isPending ? "Assigning…" : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
