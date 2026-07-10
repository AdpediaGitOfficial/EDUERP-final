import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import { RouteDialog } from "./fleet.routes";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/fleet/routes/$routeId")({ component: Page });

function Page() {
  const { routeId } = Route.useParams();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [edit, setEdit] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);

  const { data: r } = useQuery({
    queryKey: ["route-detail", routeId],
    queryFn: async () =>
      (
        await supabase
          .from("transport_routes")
          .select(
            "*, vehicle:vehicle_id(id,registration_no,capacity), driver:driver_id(id,full_name), route_stops(id,name,sequence,eta,estimated_minutes)",
          )
          .eq("id", routeId)
          .maybeSingle()
      ).data,
  });
  const { data: roster } = useQuery({
    queryKey: ["route-roster", routeId],
    queryFn: async () =>
      (
        await supabase
          .from("route_students")
          .select(
            "id,stop_id, student:student_id(id,admission_no, profiles!students_profile_id_fkey(full_name)), stop:stop_id(name)",
          )
          .eq("route_id", routeId)
      ).data ?? [],
  });

  const stops = useMemo(
    () => [...((r?.route_stops as any[]) ?? [])].sort((a, b) => a.sequence - b.sequence),
    [r],
  );
  const rosterByStop = useMemo(() => {
    const g: Record<string, any[]> = {};
    for (const rs of roster ?? []) {
      const k = rs.stop_id ?? "unassigned";
      (g[k] ||= []).push(rs);
    }
    return g;
  }, [roster]);

  const removeAssignment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("route_students").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removed");
      qc.invalidateQueries({ queryKey: ["route-roster", routeId] });
    },
  });

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
                          {rs.student?.profiles?.full_name}{" "}
                          <span className="text-xs text-muted-foreground font-mono">
                            · {rs.student?.admission_no}
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeAssignment.mutate(rs.id)}
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
                      <div className="min-w-0 truncate">{rs.student?.profiles?.full_name}</div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeAssignment.mutate(rs.id)}
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
    queryFn: async () => {
      const query = supabase
        .from("students")
        .select("id, admission_no, profiles!students_profile_id_fkey(full_name)")
        .eq("status", "active")
        .limit(50);
      const { data } = await query;
      const list = (data ?? []).filter(
        (s: any) =>
          !q ||
          s.profiles?.full_name?.toLowerCase().includes(q.toLowerCase()) ||
          s.admission_no?.toLowerCase().includes(q.toLowerCase()),
      );
      return list;
    },
    enabled: open,
  });

  const mut = useMutation({
    mutationFn: async () => {
      if (!stopId) throw new Error("Pick a stop");
      const rows = Array.from(picked).map((sid) => ({
        route_id: routeId,
        student_id: sid,
        stop_id: stopId,
        pickup_time: "07:00 AM",
        drop_time: "03:30 PM",
      }));
      if (!rows.length) throw new Error("Pick at least one student");
      const { error } = await supabase
        .from("route_students")
        .upsert(rows, { onConflict: "route_id,student_id" });
      if (error) throw error;
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
              <span className="min-w-0 truncate">{s.profiles?.full_name}</span>
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
