import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { EmptyState } from "@/components/empty-state";
import { QueryError, TableSkeleton } from "@/components/query-states";
import { useConfirm } from "@/components/confirm-dialog";
import { inr } from "@/components/fees-collection";
import { fmtDate } from "@/lib/module-util";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  Copy,
  Archive,
  ArchiveRestore,
  ChevronRight,
  ChevronDown,
  Layers,
  X,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/finance/fee-groups")({
  component: FeeGroupsPage,
});

type Component = {
  id?: string;
  feeTypeId: string | null;
  feeTypeName?: string | null;
  label: string;
  amount: number;
  dueDate: string | null;
  demandDate: string | null;
  fineAmount: number;
  fineAfterDays: number | null;
};
type FeeGroup = {
  id: string;
  name: string;
  academicYear: string;
  classId: string | null;
  className: string | null;
  isArchived: boolean;
  total: number;
  components: Component[];
};
type FeeType = { id: string; name: string };
type ClassRow = { id: string; name: string; section: string | null };

const CURRENT_YEAR = "2025-2026";
const blankComp = (): Component => ({
  feeTypeId: null,
  label: "",
  amount: 0,
  dueDate: null,
  demandDate: null,
  fineAmount: 0,
  fineAfterDays: null,
});

function FeeGroupsPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [showArchived, setShowArchived] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FeeGroup | null>(null);

  const {
    data: groups,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["fee-groups", showArchived],
    queryFn: () => apiGet<FeeGroup[]>(`/fees/groups${showArchived ? "?includeArchived=1" : ""}`),
  });
  const { data: feeTypes } = useQuery({
    queryKey: ["fee-types-active"],
    queryFn: () => apiGet<FeeType[]>("/fees/types"),
  });
  const { data: classes } = useQuery({
    queryKey: ["fg-classes"],
    queryFn: () => apiGet<ClassRow[]>("/classes"),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["fee-groups"] });
  const toggleRow = (id: string) =>
    setExpanded((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const clone = useMutation({
    mutationFn: (g: FeeGroup) => apiPost(`/fees/groups/${g.id}/clone`, {}),
    onSuccess: () => {
      toast.success("Fee group cloned");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not clone"),
  });
  const archive = useMutation({
    mutationFn: (g: FeeGroup) =>
      apiPost(`/fees/groups/${g.id}/archive`, { archived: !g.isArchived }),
    onSuccess: () => invalidate(),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update"),
  });
  const del = async (g: FeeGroup) => {
    if (
      !(await confirm({
        title: `Delete "${g.name}"?`,
        description:
          "This permanently removes the group and its components. Archive it instead to keep the record.",
        confirmText: "Delete",
        destructive: true,
      }))
    )
      return;
    try {
      await apiDelete(`/fees/groups/${g.id}`);
      toast.success("Fee group deleted");
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete");
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show archived
        </label>
        <div className="flex-1" />
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="size-4 mr-1" /> Add fee group
        </Button>
      </div>

      <Card className="rounded-2xl overflow-hidden">
        {isError ? (
          <QueryError onRetry={() => refetch()} />
        ) : isLoading ? (
          <div className="p-4">
            <TableSkeleton rows={5} cols={4} />
          </div>
        ) : (groups ?? []).length === 0 ? (
          <EmptyState
            icon={Layers}
            title="No fee groups"
            hint="Create a fee group to bundle installments with their due dates and fines."
          />
        ) : (
          <div className="divide-y">
            {(groups ?? []).map((g) => {
              const isOpen = expanded.has(g.id);
              return (
                <div key={g.id}>
                  <div className="flex items-center gap-3 p-3 hover:bg-muted/20">
                    <button
                      onClick={() => toggleRow(g.id)}
                      className="text-muted-foreground"
                      aria-label={isOpen ? "Collapse" : "Expand"}
                    >
                      {isOpen ? (
                        <ChevronDown className="size-4" />
                      ) : (
                        <ChevronRight className="size-4" />
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium flex items-center gap-2">
                        {g.name}
                        {g.isArchived && (
                          <Badge className="bg-slate-100 text-slate-600 border-0">Archived</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        AY {g.academicYear}
                        {g.className ? ` · ${g.className}` : ""} · {g.components.length} item
                        {g.components.length !== 1 ? "s" : ""}
                      </div>
                    </div>
                    <div className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {inr(g.total)}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => clone.mutate(g)}
                        aria-label="Clone"
                        title="Clone"
                      >
                        <Copy className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setEditing(g);
                          setOpen(true);
                        }}
                        aria-label="Edit"
                        title="Edit"
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => archive.mutate(g)}
                        aria-label={g.isArchived ? "Unarchive" : "Archive"}
                        title={g.isArchived ? "Unarchive" : "Archive"}
                      >
                        {g.isArchived ? (
                          <ArchiveRestore className="size-4" />
                        ) : (
                          <Archive className="size-4" />
                        )}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => del(g)}
                        aria-label="Delete"
                        title="Delete"
                      >
                        <Trash2 className="size-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                  {isOpen && (
                    <div className="overflow-x-auto border-t bg-muted/10">
                      <table className="w-full text-sm">
                        <thead className="text-muted-foreground text-left">
                          <tr>
                            <th className="px-4 py-2 font-medium">Component</th>
                            <th className="px-3 py-2 font-medium">Fee Type</th>
                            <th className="px-3 py-2 font-medium">Due</th>
                            <th className="px-3 py-2 font-medium">Demand</th>
                            <th className="px-3 py-2 font-medium text-right">Fine</th>
                            <th className="px-3 py-2 font-medium text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.components.map((c) => (
                            <tr key={c.id} className="border-t">
                              <td className="px-4 py-2">{c.label}</td>
                              <td className="px-3 py-2 text-muted-foreground">
                                {c.feeTypeName ?? "—"}
                              </td>
                              <td className="px-3 py-2 text-muted-foreground">
                                {c.dueDate ? fmtDate(c.dueDate) : "—"}
                              </td>
                              <td className="px-3 py-2 text-muted-foreground">
                                {c.demandDate ? fmtDate(c.demandDate) : "—"}
                              </td>
                              <td className="px-3 py-2 text-right text-muted-foreground">
                                {c.fineAmount ? inr(c.fineAmount) : "—"}
                              </td>
                              <td className="px-3 py-2 text-right">{inr(c.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {open && (
        <GroupBuilder
          group={editing}
          feeTypes={feeTypes ?? []}
          classes={classes ?? []}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            invalidate();
          }}
        />
      )}
    </div>
  );
}

function GroupBuilder({
  group,
  feeTypes,
  classes,
  onClose,
  onSaved,
}: {
  group: FeeGroup | null;
  feeTypes: FeeType[];
  classes: ClassRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(group?.name ?? "");
  const [year, setYear] = useState(group?.academicYear ?? CURRENT_YEAR);
  const [classId, setClassId] = useState<string>(group?.classId ?? "none");
  const [comps, setComps] = useState<Component[]>(
    group?.components.length ? group.components.map((c) => ({ ...c })) : [blankComp()],
  );
  const [saving, setSaving] = useState(false);

  const total = useMemo(() => comps.reduce((s, c) => s + (Number(c.amount) || 0), 0), [comps]);
  const setComp = (i: number, patch: Partial<Component>) =>
    setComps((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const addComp = () => setComps((prev) => [...prev, blankComp()]);
  const removeComp = (i: number) => setComps((prev) => prev.filter((_, idx) => idx !== i));

  const save = async () => {
    if (!name.trim()) return toast.error("Group name is required");
    const rows = comps.filter((c) => c.label.trim());
    if (rows.length === 0) return toast.error("Add at least one component with a label");
    const body = {
      name: name.trim(),
      academicYear: year.trim(),
      classId: classId === "none" ? undefined : classId,
      components: rows.map((c) => ({
        feeTypeId: c.feeTypeId ?? undefined,
        label: c.label.trim(),
        amount: Number(c.amount) || 0,
        dueDate: c.dueDate || undefined,
        demandDate: c.demandDate || undefined,
        fineAmount: Number(c.fineAmount) || 0,
        fineAfterDays: c.fineAfterDays != null ? Number(c.fineAfterDays) : undefined,
      })),
    };
    setSaving(true);
    try {
      if (group) await apiPatch(`/fees/groups/${group.id}`, body);
      else await apiPost("/fees/groups", body);
      toast.success(group ? "Fee group updated" : "Fee group created");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save fee group");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{group ? "Edit fee group" : "New fee group"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Group name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. 4th Installment Fees 2026-2027"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Academic year</Label>
            <Input value={year} onChange={(e) => setYear(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-3">
            <Label>Class (optional)</Label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger>
                <SelectValue placeholder="Any class" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Any class</SelectItem>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                    {c.section ? ` · ${c.section}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-2">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium">Components</div>
            <Button size="sm" variant="outline" onClick={addComp}>
              <Plus className="size-4 mr-1" /> Add component
            </Button>
          </div>
          <div className="space-y-2">
            {comps.map((c, i) => (
              <div key={i} className="rounded-lg border p-2.5 grid gap-2 sm:grid-cols-12 items-end">
                <div className="sm:col-span-4 space-y-1">
                  <Label className="text-xs">Label</Label>
                  <Input
                    className="h-8"
                    value={c.label}
                    onChange={(e) => setComp(i, { label: e.target.value })}
                    placeholder="1st Installment"
                  />
                </div>
                <div className="sm:col-span-3 space-y-1">
                  <Label className="text-xs">Fee type</Label>
                  <Select
                    value={c.feeTypeId ?? "none"}
                    onValueChange={(v) => setComp(i, { feeTypeId: v === "none" ? null : v })}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {feeTypes.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <Label className="text-xs">Amount</Label>
                  <Input
                    type="number"
                    className="h-8 text-right"
                    value={c.amount || ""}
                    onChange={(e) => setComp(i, { amount: Number(e.target.value) })}
                  />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <Label className="text-xs">Fine</Label>
                  <Input
                    type="number"
                    className="h-8 text-right"
                    value={c.fineAmount || ""}
                    onChange={(e) => setComp(i, { fineAmount: Number(e.target.value) })}
                  />
                </div>
                <div className="sm:col-span-1 flex justify-end">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => removeComp(i)}
                    aria-label="Remove component"
                    disabled={comps.length === 1}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
                <div className="sm:col-span-4 space-y-1">
                  <Label className="text-xs">Due date</Label>
                  <Input
                    type="date"
                    className="h-8"
                    value={c.dueDate ?? ""}
                    onChange={(e) => setComp(i, { dueDate: e.target.value || null })}
                  />
                </div>
                <div className="sm:col-span-4 space-y-1">
                  <Label className="text-xs">Demand date (show to parents on)</Label>
                  <Input
                    type="date"
                    className="h-8"
                    value={c.demandDate ?? ""}
                    onChange={(e) => setComp(i, { demandDate: e.target.value || null })}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg bg-secondary/60 px-4 py-3 mt-1">
          <span className="text-sm text-muted-foreground">Group total</span>
          <span className="font-display text-xl font-semibold">{inr(total)}</span>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : group ? "Save changes" : "Create group"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
