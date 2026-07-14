import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/empty-state";
import { TableSkeleton } from "@/components/query-states";
import { inr } from "@/components/fees-collection";
import { toast } from "sonner";
import { Users, UserPlus, UserMinus, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/finance/assign-fees")({
  component: AssignFeesPage,
});

type ClassRow = { id: string; name: string; section: string | null };
type FeeGroup = { id: string; name: string; total: number };
type RosterRow = {
  studentId: string;
  admissionNo: string | null;
  rollNo: string | null;
  name: string | null;
  assigned: boolean;
};

const todayISO = () => new Date().toISOString().slice(0, 10);

function AssignFeesPage() {
  const qc = useQueryClient();
  const [classId, setClassId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [demandDate, setDemandDate] = useState("");
  const [mode, setMode] = useState<"assign" | "unassign">("assign");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: classes } = useQuery({
    queryKey: ["assign-classes"],
    queryFn: () => apiGet<ClassRow[]>("/classes"),
  });
  const { data: groups } = useQuery({
    queryKey: ["assign-groups"],
    queryFn: () => apiGet<FeeGroup[]>("/fees/groups"),
  });
  const {
    data: roster,
    isFetching,
    refetch,
  } = useQuery({
    enabled: !!classId,
    queryKey: ["assign-roster", classId, groupId],
    queryFn: () =>
      apiGet<RosterRow[]>(
        `/fees/assign/students?classId=${classId}${groupId ? `&groupId=${groupId}` : ""}`,
      ),
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (roster ?? []).filter(
      (r) =>
        !term ||
        (r.name ?? "").toLowerCase().includes(term) ||
        (r.admissionNo ?? "").toLowerCase().includes(term),
    );
  }, [roster, search]);

  const toggle = (id: string) =>
    setSelected((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const selectAll = () => {
    const ids = rows.map((r) => r.studentId);
    setSelected((p) => (ids.every((id) => p.has(id)) ? new Set() : new Set(ids)));
  };

  const afterRun = () => {
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ["assign-roster"] });
  };

  const assign = useMutation({
    mutationFn: () =>
      apiPost<{ assigned: number; skipped: number; lines: number }>("/fees/assign/group", {
        groupId,
        studentIds: [...selected],
        demandDate: demandDate || undefined,
      }),
    onSuccess: (r) => {
      toast.success(
        `Assigned to ${r.assigned} student${r.assigned !== 1 ? "s" : ""} (${r.lines} fee lines)${
          r.skipped ? `, ${r.skipped} already had it` : ""
        }`,
      );
      afterRun();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not assign"),
  });

  const unassign = useMutation({
    mutationFn: () =>
      apiPost<{ removed: number; protectedPaid: number }>("/fees/assign/unassign", {
        groupId,
        studentIds: [...selected],
      }),
    onSuccess: (r) => {
      toast.success(
        `Removed ${r.removed} fee line${r.removed !== 1 ? "s" : ""}${
          r.protectedPaid ? `, ${r.protectedPaid} kept (already paid)` : ""
        }`,
      );
      afterRun();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not unassign"),
  });

  const running = assign.isPending || unassign.isPending;
  const canRun = !!groupId && selected.size > 0 && !running;

  return (
    <div className="space-y-4">
      {/* Criteria */}
      <Card className="rounded-2xl p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Class</Label>
            <Select
              value={classId}
              onValueChange={(v) => {
                setClassId(v);
                setSelected(new Set());
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a class" />
              </SelectTrigger>
              <SelectContent>
                {(classes ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                    {c.section ? ` · ${c.section}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Fee group</Label>
            <Select value={groupId} onValueChange={setGroupId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a fee group" />
              </SelectTrigger>
              <SelectContent>
                {(groups ?? []).map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name} — {inr(g.total)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>
              Demand date{" "}
              <span className="text-xs text-muted-foreground">(show to parents on)</span>
            </Label>
            <Input
              type="date"
              value={demandDate}
              onChange={(e) => setDemandDate(e.target.value)}
              disabled={mode === "unassign"}
              placeholder={todayISO()}
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Leave the demand date blank to show fees to parents immediately. Set it in the future to
          hold them back until that date.
        </p>
      </Card>

      {/* Mode + action bar */}
      <Card className="rounded-2xl p-3">
        <div className="flex flex-col lg:flex-row lg:items-center gap-2">
          <div className="inline-flex rounded-lg border p-1">
            <Button
              size="sm"
              variant={mode === "assign" ? "default" : "ghost"}
              onClick={() => setMode("assign")}
            >
              <UserPlus className="size-4 mr-1" /> Assign
            </Button>
            <Button
              size="sm"
              variant={mode === "unassign" ? "destructive" : "ghost"}
              onClick={() => setMode("unassign")}
            >
              <UserMinus className="size-4 mr-1" /> Unassign
            </Button>
          </div>
          <div className="relative flex-1 min-w-[10rem]">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search name or admission no…"
              className="pl-9 h-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button
            className="h-9"
            variant={mode === "unassign" ? "destructive" : "default"}
            disabled={!canRun}
            onClick={() => (mode === "assign" ? assign.mutate() : unassign.mutate())}
          >
            {mode === "assign" ? (
              <>
                <UserPlus className="size-4 mr-1" /> Assign to {selected.size}
              </>
            ) : (
              <>
                <UserMinus className="size-4 mr-1" /> Unassign from {selected.size}
              </>
            )}
          </Button>
        </div>
      </Card>

      {/* Roster */}
      <Card className="rounded-2xl overflow-hidden">
        {!classId ? (
          <EmptyState
            icon={Users}
            title="Pick a class"
            hint="Choose a class and a fee group, then assign or unassign students."
          />
        ) : isFetching ? (
          <div className="p-4">
            <TableSkeleton rows={6} cols={4} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={Users} title="No students" hint="No active students in this class." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground text-left">
                <tr>
                  <th className="px-3 py-2 w-8">
                    <Checkbox
                      checked={rows.length > 0 && rows.every((r) => selected.has(r.studentId))}
                      onCheckedChange={selectAll}
                      aria-label="Select all"
                    />
                  </th>
                  <th className="px-3 py-2 font-medium">Admission No</th>
                  <th className="px-3 py-2 font-medium">Roll</th>
                  <th className="px-3 py-2 font-medium">Student</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.studentId} className="border-t hover:bg-muted/20">
                    <td className="px-3 py-2">
                      <Checkbox
                        checked={selected.has(r.studentId)}
                        onCheckedChange={() => toggle(r.studentId)}
                        aria-label={`Select ${r.name}`}
                      />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{r.admissionNo ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.rollNo ?? "—"}</td>
                    <td className="px-3 py-2 font-medium">{r.name ?? "—"}</td>
                    <td className="px-3 py-2">
                      {groupId ? (
                        r.assigned ? (
                          <Badge className="bg-emerald-100 text-emerald-700 border-0">
                            Assigned
                          </Badge>
                        ) : (
                          <Badge className="bg-slate-100 text-slate-600 border-0">
                            Not assigned
                          </Badge>
                        )
                      ) : (
                        <span className="text-xs text-muted-foreground">Pick a group</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="p-3 border-t text-xs text-muted-foreground flex items-center justify-between">
          <span>
            {rows.length} student{rows.length !== 1 ? "s" : ""}
            {groupId && ` · ${rows.filter((r) => r.assigned).length} already assigned`}
          </span>
          <button className="hover:text-foreground" onClick={() => refetch()}>
            Refresh
          </button>
        </div>
      </Card>
    </div>
  );
}
