import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
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
import { EmptyState } from "@/components/empty-state";
import { TableSkeleton } from "@/components/query-states";
import { useConfirm } from "@/components/confirm-dialog";
import { inr } from "@/components/fees-collection";
import { toast } from "sonner";
import { Users, ArrowRightLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/finance/carry-forward")({
  component: CarryForwardPage,
});

type ClassRow = { id: string; name: string; section: string | null };
type Row = {
  studentId: string;
  admissionNo: string | null;
  rollNo: string | null;
  name: string | null;
  outstanding: number;
};

function CarryForwardPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [classId, setClassId] = useState("");
  const [label, setLabel] = useState("Opening Due Balance");
  const [dueDate, setDueDate] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: classes } = useQuery({
    queryKey: ["cf-classes"],
    queryFn: () => apiGet<ClassRow[]>("/classes"),
  });
  const {
    data: rows,
    isFetching,
    refetch,
  } = useQuery({
    enabled: !!classId,
    queryKey: ["carry-forward-preview", classId],
    queryFn: () => apiGet<Row[]>(`/fees/carry-forward/preview?classId=${classId}`),
  });

  const list = rows ?? [];
  const toggle = (id: string) =>
    setSelected((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const selectAll = () => {
    const ids = list.map((r) => r.studentId);
    setSelected((p) => (ids.every((id) => p.has(id)) ? new Set() : new Set(ids)));
  };
  const selectedTotal = list
    .filter((r) => selected.has(r.studentId))
    .reduce((s, r) => s + r.outstanding, 0);

  const run = useMutation({
    mutationFn: () =>
      apiPost<{ created: number; skipped: number }>("/fees/carry-forward/execute", {
        studentIds: [...selected],
        label: label.trim() || undefined,
        dueDate: dueDate || undefined,
      }),
    onSuccess: (r) => {
      toast.success(`Carried forward ${r.created} student${r.created !== 1 ? "s" : ""}`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["carry-forward-preview"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not carry forward"),
  });

  const confirmRun = async () => {
    if (
      !(await confirm({
        title: `Carry forward ${selected.size} student${selected.size !== 1 ? "s" : ""}?`,
        description:
          "Each selected student's outstanding is consolidated into one new line and the carried dues are settled — the total owed is unchanged. Paid history is kept.",
        confirmText: "Carry forward",
      }))
    )
      return;
    run.mutate();
  };

  return (
    <div className="space-y-4">
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
            <Label>Opening balance label</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Due date (optional)</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Carrying forward consolidates each student's outstanding into one{" "}
          <span className="font-medium">{label || "Opening Due Balance"}</span> line and settles the
          old dues — no double counting.
        </p>
      </Card>

      <Card className="rounded-2xl p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm text-muted-foreground">
            {selected.size} selected · {inr(selectedTotal)} to carry
          </div>
          <Button disabled={selected.size === 0 || run.isPending} onClick={confirmRun}>
            <ArrowRightLeft className="size-4 mr-1" /> Carry forward {selected.size || ""}
          </Button>
        </div>
      </Card>

      <Card className="rounded-2xl overflow-hidden">
        {!classId ? (
          <EmptyState
            icon={Users}
            title="Pick a class"
            hint="Choose a class to see students carrying an outstanding balance."
          />
        ) : isFetching ? (
          <div className="p-4">
            <TableSkeleton rows={6} cols={4} />
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Nothing outstanding"
            hint="No active students in this class have a pending balance."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground text-left">
                <tr>
                  <th className="px-3 py-2 w-8">
                    <Checkbox
                      checked={list.length > 0 && list.every((r) => selected.has(r.studentId))}
                      onCheckedChange={selectAll}
                      aria-label="Select all"
                    />
                  </th>
                  <th className="px-3 py-2 font-medium">Admission No</th>
                  <th className="px-3 py-2 font-medium">Roll</th>
                  <th className="px-3 py-2 font-medium">Student</th>
                  <th className="px-3 py-2 font-medium text-right">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
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
                    <td className="px-3 py-2 text-right font-semibold text-red-600">
                      {inr(r.outstanding)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="p-3 border-t text-xs text-muted-foreground flex items-center justify-between">
          <span>
            {list.length} student{list.length !== 1 ? "s" : ""} with dues
          </span>
          {classId && (
            <button className="hover:text-foreground" onClick={() => refetch()}>
              Refresh
            </button>
          )}
        </div>
      </Card>
    </div>
  );
}
