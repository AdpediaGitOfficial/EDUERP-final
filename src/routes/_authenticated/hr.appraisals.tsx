import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { apiGet, apiFetch } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { EmptyState, EmptyRow } from "@/components/empty-state";
import { Plus, Pencil, Trash2, ClipboardCheck, Star, ArrowLeft } from "lucide-react";
import { niceLabel, type Tone } from "@/lib/module-util";

export const Route = createFileRoute("/_authenticated/hr/appraisals")({ component: Page });

type Cycle = {
  id: string;
  name: string;
  description: string | null;
  period_start: string | null;
  period_end: string | null;
  status: string;
  appraisalCount: number;
};
type Criterion = {
  id: string;
  name: string;
  description: string | null;
  weight: string;
  max_score: number;
};
type AppraisalRow = {
  id: string;
  status: string;
  overall_score: string | null;
  staff?: { full_name: string; employee_code: string; department: string };
};
type ScoredCriterion = {
  criterion_id: string;
  name: string;
  description: string | null;
  weight: string;
  max_score: number;
  score: number | null;
  comments: string | null;
};
type AppraisalDetail = {
  id: string;
  status: string;
  self_comments: string | null;
  manager_comments: string | null;
  overall: number;
  ratedCount: number;
  criteriaCount: number;
  staff: { full_name: string; employee_code: string };
  cycle: { name: string; status: string };
  criteria: ScoredCriterion[];
};
type StaffRow = { id: string; full_name: string; employee_code: string; department: string };

const CYCLE_TONE: Record<string, Tone> = { draft: "neutral", active: "info", closed: "success" };
const APPR_TONE: Record<string, Tone> = {
  pending: "warning",
  in_review: "info",
  completed: "success",
};

function Page() {
  const [cycleId, setCycleId] = useState<string | null>(null);
  return (
    <>
      <PageHeader
        title="Performance Appraisals"
        subtitle="Weighted, criteria-based reviews run in cycles."
      />
      {cycleId ? (
        <CycleAppraisals cycleId={cycleId} onBack={() => setCycleId(null)} />
      ) : (
        <Tabs defaultValue="cycles">
          <TabsList>
            <TabsTrigger value="cycles">Cycles</TabsTrigger>
            <TabsTrigger value="criteria">Criteria</TabsTrigger>
          </TabsList>
          <TabsContent value="cycles" className="pt-4">
            <CyclesTab onOpen={setCycleId} />
          </TabsContent>
          <TabsContent value="criteria" className="pt-4">
            <CriteriaTab />
          </TabsContent>
        </Tabs>
      )}
    </>
  );
}

// ── Cycles ────────────────────────────────────────────────────────────────────
function CyclesTab({ onOpen }: { onOpen: (id: string) => void }) {
  const qc = useQueryClient();
  const { data: cycles } = useQuery({
    queryKey: ["appraisal-cycles"],
    queryFn: () => apiGet<Cycle[]>("/hr/appraisal-cycles"),
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", period_start: "", period_end: "" });

  const create = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/hr/appraisal-cycles", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          description: form.description || undefined,
          period_start: form.period_start || undefined,
          period_end: form.period_end || undefined,
        }),
      });
      if (!res || !res.ok) throw new Error("Could not create cycle");
    },
    onSuccess: () => {
      toast.success("Cycle created");
      setOpen(false);
      setForm({ name: "", description: "", period_start: "", period_end: "" });
      qc.invalidateQueries({ queryKey: ["appraisal-cycles"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiFetch(`/hr/appraisal-cycles/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      if (!res || !res.ok) throw new Error("Could not update cycle");
    },
    onSuccess: () => {
      toast.success("Cycle updated");
      qc.invalidateQueries({ queryKey: ["appraisal-cycles"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div>
      <div className="flex justify-end mb-3">
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="size-4 mr-1" />
          New cycle
        </Button>
      </div>
      {cycles && cycles.length === 0 && (
        <EmptyState
          icon={ClipboardCheck}
          title="No appraisal cycles yet"
          hint="Create a review period, then enrol employees and score them against your criteria."
        />
      )}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(cycles ?? []).map((c) => (
          <Card key={c.id} className="p-5 rounded-2xl">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold">{c.name}</h3>
                <p className="text-xs text-muted-foreground">
                  {c.period_start?.slice(0, 10) ?? "—"} → {c.period_end?.slice(0, 10) ?? "—"}
                </p>
              </div>
              <StatusBadge tone={CYCLE_TONE[c.status] ?? "neutral"} label={niceLabel(c.status)} />
            </div>
            {c.description && <p className="text-sm text-muted-foreground mt-1">{c.description}</p>}
            <p className="text-sm mt-3">
              <span className="font-semibold">{c.appraisalCount}</span> appraisal
              {c.appraisalCount === 1 ? "" : "s"}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => onOpen(c.id)}>
                Open
              </Button>
              {c.status === "draft" && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setStatus.mutate({ id: c.id, status: "active" })}
                >
                  Activate
                </Button>
              )}
              {c.status === "active" && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setStatus.mutate({ id: c.id, status: "closed" })}
                >
                  Close
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New appraisal cycle</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <Label>
                Name <span className="text-red-500">*</span>
              </Label>
              <Input
                value={form.name}
                placeholder="e.g. Annual Review 2026"
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <Label>Description</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Period start</Label>
                <Input
                  type="date"
                  value={form.period_start}
                  onChange={(e) => setForm({ ...form, period_start: e.target.value })}
                />
              </div>
              <div>
                <Label>Period end</Label>
                <Input
                  type="date"
                  value={form.period_end}
                  onChange={(e) => setForm({ ...form, period_end: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => create.mutate()} disabled={!form.name}>
              Create cycle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Criteria ──────────────────────────────────────────────────────────────────
function CriteriaTab() {
  const qc = useQueryClient();
  const { data: criteria } = useQuery({
    queryKey: ["appraisal-criteria"],
    queryFn: () => apiGet<Criterion[]>("/hr/appraisal-criteria"),
  });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Criterion | null>(null);
  const [form, setForm] = useState({ name: "", description: "", weight: "1", max_score: "5" });

  const totalWeight = (criteria ?? []).reduce((s, c) => s + Number(c.weight), 0);

  const openAdd = () => {
    setEditing(null);
    setForm({ name: "", description: "", weight: "10", max_score: "5" });
    setOpen(true);
  };
  const openEdit = (c: Criterion) => {
    setEditing(c);
    setForm({
      name: c.name,
      description: c.description ?? "",
      weight: String(c.weight),
      max_score: String(c.max_score),
    });
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      const body = JSON.stringify({
        name: form.name,
        description: form.description || undefined,
        weight: Number(form.weight),
        max_score: Number(form.max_score),
      });
      const res = editing
        ? await apiFetch(`/hr/appraisal-criteria/${editing.id}`, { method: "PATCH", body })
        : await apiFetch("/hr/appraisal-criteria", { method: "POST", body });
      if (!res || !res.ok) throw new Error("Could not save criterion");
    },
    onSuccess: () => {
      toast.success(editing ? "Criterion updated" : "Criterion added");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["appraisal-criteria"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/hr/appraisal-criteria/${id}`, { method: "DELETE" });
      if (!res || !res.ok) throw new Error("Could not remove criterion");
    },
    onSuccess: () => {
      toast.success("Criterion removed");
      qc.invalidateQueries({ queryKey: ["appraisal-criteria"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-muted-foreground">
          Total weight: <span className="font-semibold text-foreground">{totalWeight}</span>{" "}
          {totalWeight === 100 ? "(normalised)" : "(scores are weight-normalised automatically)"}
        </p>
        <Button size="sm" onClick={openAdd}>
          <Plus className="size-4 mr-1" />
          New criterion
        </Button>
      </div>
      <Card className="rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-left">
              <th className="p-3 font-medium">Criterion</th>
              <th className="p-3 font-medium text-right">Weight</th>
              <th className="p-3 font-medium text-right">Max score</th>
              <th className="p-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(criteria ?? []).map((c) => (
              <tr key={c.id} className="border-t">
                <td className="p-3">
                  <div className="font-medium">{c.name}</div>
                  {c.description && (
                    <div className="text-xs text-muted-foreground">{c.description}</div>
                  )}
                </td>
                <td className="p-3 text-right">{Number(c.weight)}</td>
                <td className="p-3 text-right">{c.max_score}</td>
                <td className="p-3 text-right whitespace-nowrap">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Edit ${c.name}`}
                    onClick={() => openEdit(c)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Remove ${c.name}`}
                    onClick={() => remove.mutate(c.id)}
                  >
                    <Trash2 className="size-4 text-red-600" />
                  </Button>
                </td>
              </tr>
            ))}
            {(criteria ?? []).length === 0 && (
              <EmptyRow colSpan={4} title="No criteria yet" hint="Add rating criteria to score appraisals." />
            )}
          </tbody>
        </table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit criterion" : "New criterion"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <Label>
                Name <span className="text-red-500">*</span>
              </Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Description</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Weight</Label>
                <Input
                  type="number"
                  value={form.weight}
                  onChange={(e) => setForm({ ...form, weight: e.target.value })}
                />
              </div>
              <div>
                <Label>Max score</Label>
                <Input
                  type="number"
                  value={form.max_score}
                  onChange={(e) => setForm({ ...form, max_score: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => save.mutate()}
              disabled={!form.name || !(Number(form.max_score) > 0)}
            >
              {editing ? "Save changes" : "Add criterion"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Appraisals within a cycle ────────────────────────────────────────────────
function CycleAppraisals({ cycleId, onBack }: { cycleId: string; onBack: () => void }) {
  const qc = useQueryClient();
  const { data: appraisals } = useQuery({
    queryKey: ["appraisals", cycleId],
    queryFn: () => apiGet<AppraisalRow[]>(`/hr/appraisals?cycleId=${cycleId}`),
  });
  const { data: staff } = useQuery({
    queryKey: ["hr-staff-list"],
    queryFn: () => apiGet<StaffRow[]>("/hr/staff"),
  });
  const [enrollId, setEnrollId] = useState<string>("");
  const [openId, setOpenId] = useState<string | null>(null);

  const enrolled = new Set((appraisals ?? []).map((a) => a.staff?.employee_code));
  const enrollable = (staff ?? []).filter((s) => !enrolled.has(s.employee_code));

  const enroll = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/hr/appraisals", {
        method: "POST",
        body: JSON.stringify({ cycle_id: cycleId, staff_id: enrollId }),
      });
      if (!res || !res.ok) {
        const b = res ? await res.json().catch(() => null) : null;
        throw new Error(b?.message ?? "Could not enrol employee");
      }
    },
    onSuccess: () => {
      toast.success("Employee enrolled");
      setEnrollId("");
      qc.invalidateQueries({ queryKey: ["appraisals", cycleId] });
      qc.invalidateQueries({ queryKey: ["appraisal-cycles"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Button size="sm" variant="ghost" onClick={onBack}>
          <ArrowLeft className="size-4 mr-1" />
          All cycles
        </Button>
        <div className="flex-1" />
        <Select value={enrollId || undefined} onValueChange={setEnrollId}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Enrol an employee…" />
          </SelectTrigger>
          <SelectContent>
            {enrollable.slice(0, 300).map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.full_name} ({s.employee_code})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={() => enroll.mutate()} disabled={!enrollId}>
          <Plus className="size-4 mr-1" />
          Enrol
        </Button>
      </div>

      <Card className="rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-left">
              <th className="p-3 font-medium">Employee</th>
              <th className="p-3 font-medium">Department</th>
              <th className="p-3 font-medium">Status</th>
              <th className="p-3 font-medium text-right">Score</th>
              <th className="p-3 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {(appraisals ?? []).map((a) => (
              <tr
                key={a.id}
                className="border-t hover:bg-muted/30 cursor-pointer"
                onClick={() => setOpenId(a.id)}
              >
                <td className="p-3">
                  <div className="font-medium">{a.staff?.full_name}</div>
                  <div className="text-xs text-muted-foreground font-mono">
                    {a.staff?.employee_code}
                  </div>
                </td>
                <td className="p-3">{a.staff?.department}</td>
                <td className="p-3">
                  <StatusBadge tone={APPR_TONE[a.status] ?? "neutral"} label={niceLabel(a.status)} />
                </td>
                <td className="p-3 text-right font-semibold">
                  {a.overall_score != null ? `${Number(a.overall_score)}%` : "—"}
                </td>
                <td className="p-3 text-right">
                  <Button size="sm" variant="ghost" onClick={() => setOpenId(a.id)}>
                    Review
                  </Button>
                </td>
              </tr>
            ))}
            {(appraisals ?? []).length === 0 && (
              <EmptyRow
                colSpan={5}
                icon={ClipboardCheck}
                title="No one enrolled yet"
                hint="Enrol an employee to start their appraisal."
              />
            )}
          </tbody>
        </table>
      </Card>

      {openId && <AppraisalDialog id={openId} onClose={() => setOpenId(null)} cycleId={cycleId} />}
    </div>
  );
}

function AppraisalDialog({
  id,
  cycleId,
  onClose,
}: {
  id: string;
  cycleId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["appraisal", id],
    queryFn: () => apiGet<AppraisalDetail>(`/hr/appraisals/${id}`),
  });

  const [scores, setScores] = useState<Record<string, { score: string; comments: string }>>({});
  const [managerComments, setManagerComments] = useState<string | null>(null);
  const [selfComments, setSelfComments] = useState<string | null>(null);

  // Seed local state once data arrives (keyed off id).
  const seeded = useMemo(() => {
    if (!data) return null;
    const s: Record<string, { score: string; comments: string }> = {};
    for (const c of data.criteria) {
      s[c.criterion_id] = {
        score: c.score != null ? String(c.score) : "",
        comments: c.comments ?? "",
      };
    }
    return s;
  }, [data]);
  const view = Object.keys(scores).length ? scores : (seeded ?? {});
  const mc = managerComments ?? data?.manager_comments ?? "";
  const sc = selfComments ?? data?.self_comments ?? "";
  const readOnly = data?.status === "completed";

  // Live overall from current inputs.
  const liveOverall = useMemo(() => {
    if (!data) return 0;
    let weighted = 0;
    let total = 0;
    for (const c of data.criteria) {
      const w = Number(c.weight) || 0;
      total += w;
      const raw = view[c.criterion_id]?.score;
      if (raw !== "" && raw != null) {
        const s = Math.min(Number(raw) || 0, c.max_score);
        weighted += (s / (c.max_score || 1)) * w;
      }
    }
    return total > 0 ? Math.round((weighted / total) * 100 * 100) / 100 : 0;
  }, [data, view]);

  const setScore = (cid: string, patch: Partial<{ score: string; comments: string }>) =>
    setScores({ ...view, [cid]: { ...(view[cid] ?? { score: "", comments: "" }), ...patch } });

  const buildPayload = () => ({
    ratings: (data?.criteria ?? [])
      .filter((c) => view[c.criterion_id]?.score !== "" && view[c.criterion_id]?.score != null)
      .map((c) => ({
        criterion_id: c.criterion_id,
        score: Number(view[c.criterion_id].score),
        comments: view[c.criterion_id].comments || undefined,
      })),
    manager_comments: mc || undefined,
    self_comments: sc || undefined,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["appraisal", id] });
    qc.invalidateQueries({ queryKey: ["appraisals", cycleId] });
  };

  const save = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/hr/appraisals/${id}`, {
        method: "PATCH",
        body: JSON.stringify(buildPayload()),
      });
      if (!res || !res.ok) {
        const b = res ? await res.json().catch(() => null) : null;
        throw new Error(b?.message ?? "Could not save");
      }
    },
    onSuccess: () => {
      toast.success("Draft saved");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const complete = useMutation({
    mutationFn: async () => {
      // persist current inputs first, then complete
      const s = await apiFetch(`/hr/appraisals/${id}`, {
        method: "PATCH",
        body: JSON.stringify(buildPayload()),
      });
      if (!s || !s.ok) throw new Error("Could not save before completing");
      const res = await apiFetch(`/hr/appraisals/${id}/complete`, { method: "POST" });
      if (!res || !res.ok) {
        const b = res ? await res.json().catch(() => null) : null;
        throw new Error(b?.message ?? "Could not complete");
      }
    },
    onSuccess: () => {
      toast.success("Appraisal completed");
      invalidate();
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {data ? `${data.staff.full_name} — ${data.cycle.name}` : "Appraisal"}
          </DialogTitle>
        </DialogHeader>
        {!data ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl bg-muted/40 px-4 py-3">
              <div>
                <StatusBadge tone={APPR_TONE[data.status] ?? "neutral"} label={niceLabel(data.status)} />
                <span className="ml-2 text-sm text-muted-foreground">
                  {data.ratedCount}/{data.criteriaCount} criteria rated
                </span>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Overall score</p>
                <p className="text-2xl font-bold text-primary flex items-center gap-1 justify-end">
                  {liveOverall}%
                  <Star className="size-5 text-amber-500 fill-amber-500" />
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {data.criteria.map((c) => (
                <div key={c.criterion_id} className="rounded-xl border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">
                        {c.name}{" "}
                        <span className="text-xs text-muted-foreground font-normal">
                          (weight {Number(c.weight)})
                        </span>
                      </p>
                      {c.description && (
                        <p className="text-xs text-muted-foreground">{c.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Input
                        type="number"
                        min={0}
                        max={c.max_score}
                        disabled={readOnly}
                        className="w-20 text-right"
                        value={view[c.criterion_id]?.score ?? ""}
                        onChange={(e) => setScore(c.criterion_id, { score: e.target.value })}
                      />
                      <span className="text-sm text-muted-foreground">/ {c.max_score}</span>
                    </div>
                  </div>
                  <Input
                    placeholder="Comments (optional)"
                    disabled={readOnly}
                    className="mt-2 h-8"
                    value={view[c.criterion_id]?.comments ?? ""}
                    onChange={(e) => setScore(c.criterion_id, { comments: e.target.value })}
                  />
                </div>
              ))}
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <Label>Manager comments</Label>
                <Input
                  disabled={readOnly}
                  value={mc}
                  onChange={(e) => setManagerComments(e.target.value)}
                />
              </div>
              <div>
                <Label>Self comments</Label>
                <Input
                  disabled={readOnly}
                  value={sc}
                  onChange={(e) => setSelfComments(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}
        {data && !readOnly && (
          <DialogFooter>
            <Button variant="outline" onClick={() => save.mutate()}>
              Save draft
            </Button>
            <Button onClick={() => complete.mutate()}>Complete appraisal</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
