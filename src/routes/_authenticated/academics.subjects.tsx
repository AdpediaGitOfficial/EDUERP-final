import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { apiGet, apiFetch } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { StatusBadge } from "@/components/status-badge";
import { EmptyRow } from "@/components/empty-state";
import { QueryError, TableSkeleton } from "@/components/query-states";
import { Plus, Pencil, BookOpen, FlaskConical } from "lucide-react";
import { niceLabel, type Tone } from "@/lib/module-util";

export const Route = createFileRoute("/_authenticated/academics/subjects")({ component: Page });

type Subject = {
  id: string;
  classId: string | null;
  className: string | null;
  academicYear: string | null;
  name: string;
  code: string | null;
  shortName: string | null;
  category: string | null;
  subjectType: string;
  nature: string;
  credits: number;
  weeklyPeriods: number;
  passMarks: number;
  maxMarks: number;
  labRequired: boolean;
  department: string | null;
  color: string | null;
  isActive: boolean;
};
type ClassRow = { id: string; name: string; section: string | null; academicYear: string };

const TYPE_TONE: Record<string, Tone> = {
  compulsory: "info",
  elective: "warning",
  optional: "neutral",
};

const EMPTY = {
  class_id: "",
  name: "",
  code: "",
  short_name: "",
  category: "",
  subject_type: "compulsory",
  nature: "theory",
  credits: "0",
  weekly_periods: "0",
  pass_marks: "33",
  max_marks: "100",
  lab_required: false,
  department: "",
  color: "",
};

function Page() {
  const qc = useQueryClient();
  const [classFilter, setClassFilter] = useState("all");
  const [q, setQ] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Subject | null>(null);
  const [form, setForm] = useState<any>(EMPTY);

  const { data: classes } = useQuery({
    queryKey: ["academic-classes-all"],
    queryFn: () => apiGet<ClassRow[]>("/classes"),
  });
  const { data: subjects, isLoading, isError, refetch } = useQuery({
    queryKey: ["academic-subjects", classFilter],
    queryFn: () =>
      apiGet<Subject[]>(`/subjects${classFilter !== "all" ? `?classId=${classFilter}` : ""}`),
  });

  const classLabel = (c: ClassRow) => `${c.name}${c.section ? ` ${c.section}` : ""} · ${c.academicYear}`;
  const filtered = useMemo(
    () =>
      (subjects ?? []).filter((s) => {
        if (!showInactive && !s.isActive) return false;
        if (!q) return true;
        const t = q.toLowerCase();
        return (
          s.name.toLowerCase().includes(t) ||
          (s.code ?? "").toLowerCase().includes(t) ||
          (s.category ?? "").toLowerCase().includes(t)
        );
      }),
    [subjects, q, showInactive],
  );

  const save = useMutation({
    mutationFn: async () => {
      const body = JSON.stringify({
        class_id: form.class_id,
        name: form.name,
        code: form.code || undefined,
        short_name: form.short_name || undefined,
        category: form.category || undefined,
        subject_type: form.subject_type,
        nature: form.nature,
        credits: Number(form.credits) || 0,
        weekly_periods: Number(form.weekly_periods) || 0,
        pass_marks: Number(form.pass_marks) || 0,
        max_marks: Number(form.max_marks) || 0,
        lab_required: form.lab_required,
        department: form.department || undefined,
        color: form.color || undefined,
      });
      const res = editing
        ? await apiFetch(`/subjects/${editing.id}`, { method: "PATCH", body })
        : await apiFetch("/subjects", { method: "POST", body });
      if (!res || !res.ok) {
        const b = res ? await res.json().catch(() => null) : null;
        throw new Error(b?.message ?? "Could not save subject");
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Subject updated" : "Subject added");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["academic-subjects"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async (s: Subject) => {
      const res = await apiFetch(`/subjects/${s.id}/active`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !s.isActive }),
      });
      if (!res || !res.ok) throw new Error("Could not update subject");
    },
    onSuccess: () => {
      toast.success("Subject updated");
      qc.invalidateQueries({ queryKey: ["academic-subjects"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openAdd = () => {
    setEditing(null);
    setForm({ ...EMPTY, class_id: classFilter !== "all" ? classFilter : "" });
    setOpen(true);
  };
  const openEdit = (s: Subject) => {
    setEditing(s);
    setForm({
      class_id: s.classId ?? "",
      name: s.name,
      code: s.code ?? "",
      short_name: s.shortName ?? "",
      category: s.category ?? "",
      subject_type: s.subjectType,
      nature: s.nature,
      credits: String(s.credits),
      weekly_periods: String(s.weeklyPeriods),
      pass_marks: String(s.passMarks),
      max_marks: String(s.maxMarks),
      lab_required: s.labRequired,
      department: s.department ?? "",
      color: s.color ?? "",
    });
    setOpen(true);
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search subjects…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        <Select value={classFilter} onValueChange={setClassFilter}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Class" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All classes</SelectItem>
            {(classes ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {classLabel(c)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={showInactive} onCheckedChange={setShowInactive} />
          Show disabled
        </label>
        <div className="flex-1" />
        <Button size="sm" onClick={openAdd}>
          <Plus className="size-4 mr-1" />
          Add subject
        </Button>
      </div>

      <Card className="rounded-2xl overflow-hidden">
        {isError ? (
          <QueryError onRetry={() => refetch()} />
        ) : isLoading ? (
          <TableSkeleton rows={6} cols={8} />
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="p-3 font-medium">Subject</th>
                <th className="p-3 font-medium">Class</th>
                <th className="p-3 font-medium">Category</th>
                <th className="p-3 font-medium">Type</th>
                <th className="p-3 font-medium text-right">Periods/wk</th>
                <th className="p-3 font-medium text-right">Pass / Max</th>
                <th className="p-3 font-medium">Active</th>
                <th className="p-3 font-medium text-right">Edit</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className={s.isActive ? "border-t" : "border-t opacity-50"}>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      {s.color && (
                        <span
                          className="inline-block size-3 rounded-full shrink-0"
                          style={{ background: s.color }}
                        />
                      )}
                      <span className="font-medium">{s.name}</span>
                      {s.labRequired && <FlaskConical className="size-3.5 text-teal-600" />}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">{s.code ?? "—"}</div>
                  </td>
                  <td className="p-3">{s.className ?? "—"}</td>
                  <td className="p-3">{s.category ?? "—"}</td>
                  <td className="p-3">
                    <StatusBadge tone={TYPE_TONE[s.subjectType] ?? "neutral"} label={niceLabel(s.subjectType)} />
                    <span className="ml-1 text-xs text-muted-foreground">{niceLabel(s.nature)}</span>
                  </td>
                  <td className="p-3 text-right">{s.weeklyPeriods}</td>
                  <td className="p-3 text-right">
                    {s.passMarks} / {s.maxMarks}
                  </td>
                  <td className="p-3">
                    <Switch checked={s.isActive} onCheckedChange={() => toggleActive.mutate(s)} />
                  </td>
                  <td className="p-3 text-right">
                    <Button size="icon" variant="ghost" aria-label={`Edit ${s.name}`} onClick={() => openEdit(s)}>
                      <Pencil className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <EmptyRow
                  colSpan={8}
                  icon={BookOpen}
                  title="No subjects found"
                  hint="Add a subject or pick a different class."
                />
              )}
            </tbody>
          </table>
        </div>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit subject" : "Add subject"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="col-span-2">
              <Label>
                Class <span className="text-red-500">*</span>
              </Label>
              <Select
                value={form.class_id || undefined}
                onValueChange={(v) => setForm({ ...form, class_id: v })}
                disabled={!!editing}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select class" />
                </SelectTrigger>
                <SelectContent>
                  {(classes ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {classLabel(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>
                Name <span className="text-red-500">*</span>
              </Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Code</Label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </div>
            <div>
              <Label>Short name</Label>
              <Input value={form.short_name} onChange={(e) => setForm({ ...form, short_name: e.target.value })} />
            </div>
            <div>
              <Label>Category</Label>
              <Input
                value={form.category}
                placeholder="Language / Science…"
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={form.subject_type} onValueChange={(v) => setForm({ ...form, subject_type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="compulsory">Compulsory</SelectItem>
                  <SelectItem value="elective">Elective</SelectItem>
                  <SelectItem value="optional">Optional</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nature</Label>
              <Select value={form.nature} onValueChange={(v) => setForm({ ...form, nature: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="theory">Theory</SelectItem>
                  <SelectItem value="practical">Practical</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Credits</Label>
              <Input type="number" value={form.credits} onChange={(e) => setForm({ ...form, credits: e.target.value })} />
            </div>
            <div>
              <Label>Weekly periods</Label>
              <Input type="number" value={form.weekly_periods} onChange={(e) => setForm({ ...form, weekly_periods: e.target.value })} />
            </div>
            <div>
              <Label>Pass marks</Label>
              <Input type="number" value={form.pass_marks} onChange={(e) => setForm({ ...form, pass_marks: e.target.value })} />
            </div>
            <div>
              <Label>Max marks</Label>
              <Input type="number" value={form.max_marks} onChange={(e) => setForm({ ...form, max_marks: e.target.value })} />
            </div>
            <div>
              <Label>Department</Label>
              <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
            </div>
            <div>
              <Label>Colour</Label>
              <Input type="color" value={form.color || "#6366f1"} onChange={(e) => setForm({ ...form, color: e.target.value })} className="h-9 p-1" />
            </div>
            <div className="col-span-2 flex items-center justify-between rounded-lg border px-3 py-2">
              <Label>Lab required</Label>
              <Switch checked={form.lab_required} onCheckedChange={(v) => setForm({ ...form, lab_required: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={!form.class_id || !form.name}>
              {editing ? "Save changes" : "Create subject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
