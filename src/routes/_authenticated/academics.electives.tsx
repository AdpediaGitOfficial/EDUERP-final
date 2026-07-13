import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { apiGet, apiFetch } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { QueryError, TableSkeleton } from "@/components/query-states";
import { Plus, Pencil, Trash2, Sparkles, UserPlus, X, ArrowLeft } from "lucide-react";
import { fmtDate, type Tone } from "@/lib/module-util";

export const Route = createFileRoute("/_authenticated/academics/electives")({ component: Page });

type Offering = {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  session: string | null;
  grade_level: string | null;
  seat_capacity: number;
  is_active: boolean;
  enrolled: number;
  waitlisted: number;
  seatsLeft: number;
};
type Enrollment = {
  id: string;
  studentId: string;
  studentName: string;
  admissionNo: string | null;
  rollNo: string | null;
  status: string;
  enrolledAt: string;
};

const STATUS_TONE: Record<string, Tone> = {
  enrolled: "success",
  waitlisted: "warning",
  dropped: "neutral",
};
const EMPTY = {
  name: "",
  code: "",
  description: "",
  session: "",
  grade_level: "",
  seat_capacity: "30",
};

function Page() {
  const [openOffering, setOpenOffering] = useState<string | null>(null);
  return openOffering ? (
    <EnrollmentView offeringId={openOffering} onBack={() => setOpenOffering(null)} />
  ) : (
    <OfferingsList onOpen={setOpenOffering} />
  );
}

function OfferingsList({ onOpen }: { onOpen: (id: string) => void }) {
  const qc = useQueryClient();
  const {
    data: offerings,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["electives"],
    queryFn: () => apiGet<Offering[]>("/academics/electives"),
  });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Offering | null>(null);
  const [form, setForm] = useState<any>(EMPTY);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["electives"] });

  const save = useMutation({
    mutationFn: async () => {
      const body = JSON.stringify({
        name: form.name,
        code: form.code || undefined,
        description: form.description || undefined,
        session: form.session || undefined,
        grade_level: form.grade_level || undefined,
        seat_capacity: Number(form.seat_capacity) || 30,
      });
      const res = editing
        ? await apiFetch(`/academics/electives/${editing.id}`, { method: "PATCH", body })
        : await apiFetch("/academics/electives", { method: "POST", body });
      if (!res || !res.ok) {
        const b = res ? await res.json().catch(() => null) : null;
        throw new Error(b?.message ?? "Could not save elective");
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Elective updated" : "Elective created");
      setOpen(false);
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/academics/electives/${id}`, { method: "DELETE" });
      if (!res || !res.ok) throw new Error("Could not delete elective");
    },
    onSuccess: () => {
      toast.success("Elective deleted");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  };
  const openEdit = (o: Offering) => {
    setEditing(o);
    setForm({
      name: o.name,
      code: o.code ?? "",
      description: o.description ?? "",
      session: o.session ?? "",
      grade_level: o.grade_level ?? "",
      seat_capacity: String(o.seat_capacity),
    });
    setOpen(true);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">Elective offerings</h3>
        <Button size="sm" onClick={openAdd}>
          <Plus className="size-4 mr-1" />
          New elective
        </Button>
      </div>
      {isError ? (
        <Card className="rounded-2xl">
          <QueryError onRetry={() => refetch()} />
        </Card>
      ) : isLoading ? (
        <Card className="rounded-2xl overflow-hidden">
          <TableSkeleton rows={6} cols={4} />
        </Card>
      ) : (
        <>
          {offerings && offerings.length === 0 && (
            <EmptyState
              icon={Sparkles}
              title="No electives yet"
              hint="Create an elective offering with a seat capacity."
            />
          )}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(offerings ?? []).map((o) => {
              const pct =
                o.seat_capacity > 0
                  ? Math.min(100, Math.round((o.enrolled / o.seat_capacity) * 100))
                  : 0;
              const full = o.seatsLeft === 0;
              return (
                <Card key={o.id} className="p-5 rounded-2xl">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-semibold">{o.name}</h4>
                      <p className="text-xs text-muted-foreground font-mono">
                        {o.code ?? "—"} · {o.grade_level ?? "all grades"}
                      </p>
                    </div>
                    <div className="flex">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Edit ${o.name}`}
                        onClick={() => openEdit(o)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Delete ${o.name}`}
                        onClick={() => remove.mutate(o.id)}
                      >
                        <Trash2 className="size-4 text-red-600" />
                      </Button>
                    </div>
                  </div>
                  {o.description && (
                    <p className="text-sm text-muted-foreground mt-1">{o.description}</p>
                  )}
                  <div className="mt-3">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">
                        {o.enrolled}/{o.seat_capacity} seats
                        {o.waitlisted > 0 && ` · ${o.waitlisted} waitlisted`}
                      </span>
                      <StatusBadge
                        tone={full ? "danger" : "success"}
                        label={full ? "Full" : `${o.seatsLeft} left`}
                      />
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={full ? "h-full bg-red-500" : "h-full bg-primary"}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3 w-full"
                    onClick={() => onOpen(o.id)}
                  >
                    Manage enrolment
                  </Button>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit elective" : "New elective"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="col-span-2">
              <Label>
                Name <span className="text-red-500">*</span>
              </Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <Label>Code</Label>
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
            </div>
            <div>
              <Label>Seat capacity</Label>
              <Input
                type="number"
                value={form.seat_capacity}
                onChange={(e) => setForm({ ...form, seat_capacity: e.target.value })}
              />
            </div>
            <div>
              <Label>Session</Label>
              <Input
                value={form.session}
                placeholder="2026-2027"
                onChange={(e) => setForm({ ...form, session: e.target.value })}
              />
            </div>
            <div>
              <Label>Grade eligibility</Label>
              <Input
                value={form.grade_level}
                placeholder="Grade 6-10"
                onChange={(e) => setForm({ ...form, grade_level: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <Label>Description</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={!form.name}>
              {editing ? "Save changes" : "Create elective"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EnrollmentView({ offeringId, onBack }: { offeringId: string; onBack: () => void }) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const { data: enrollments } = useQuery({
    queryKey: ["elective-enrollments", offeringId],
    queryFn: () => apiGet<Enrollment[]>(`/academics/electives/${offeringId}/enrollments`),
  });
  const { data: search } = useQuery({
    queryKey: ["student-search", q],
    queryFn: () => apiGet<{ rows: any[] }>(`/students/search?q=${encodeURIComponent(q)}&limit=8`),
    enabled: q.length >= 2,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["elective-enrollments", offeringId] });
    qc.invalidateQueries({ queryKey: ["electives"] });
  };

  const enroll = useMutation({
    mutationFn: async (studentId: string) => {
      const res = await apiFetch(`/academics/electives/${offeringId}/enroll`, {
        method: "POST",
        body: JSON.stringify({ student_id: studentId }),
      });
      if (!res || !res.ok) {
        const b = res ? await res.json().catch(() => null) : null;
        throw new Error(b?.message ?? "Could not enrol");
      }
      return res.json().catch(() => ({}));
    },
    onSuccess: (r: any) => {
      toast.success(r?.status === "waitlisted" ? "Added to waitlist (full)" : "Student enrolled");
      setQ("");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const drop = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/academics/elective-enrollments/${id}`, { method: "DELETE" });
      if (!res || !res.ok) throw new Error("Could not drop");
      return res.json().catch(() => ({}));
    },
    onSuccess: (r: any) => {
      toast.success(r?.promoted ? "Dropped — waitlisted student promoted" : "Enrolment dropped");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const enrolledSet = new Set((enrollments ?? []).map((e) => e.studentId));

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Button size="sm" variant="ghost" onClick={onBack}>
          <ArrowLeft className="size-4 mr-1" />
          All electives
        </Button>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-4">
        <Card className="rounded-2xl overflow-hidden">
          <div className="p-4 border-b font-semibold">Enrolled &amp; waitlisted</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="p-3 font-medium">Student</th>
                  <th className="p-3 font-medium">Admission</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3 font-medium">Since</th>
                  <th className="p-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {(enrollments ?? []).map((e) => (
                  <tr key={e.id} className="border-t">
                    <td className="p-3 font-medium">{e.studentName}</td>
                    <td className="p-3 font-mono text-xs">{e.admissionNo ?? "—"}</td>
                    <td className="p-3">
                      <StatusBadge tone={STATUS_TONE[e.status] ?? "neutral"} label={e.status} />
                    </td>
                    <td className="p-3">{fmtDate(e.enrolledAt)}</td>
                    <td className="p-3 text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Drop ${e.studentName}`}
                        onClick={() => drop.mutate(e.id)}
                      >
                        <X className="size-4 text-red-600" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {enrollments && enrollments.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-muted-foreground">
                      No students enrolled yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="rounded-2xl p-4 h-fit">
          <div className="flex items-center gap-2 mb-2">
            <UserPlus className="size-4" />
            <h4 className="font-semibold">Enrol a student</h4>
          </div>
          <Input
            placeholder="Search by name / admission no…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="mt-2 space-y-1 max-h-[50vh] overflow-y-auto">
            {q.length >= 2 &&
              (search?.rows ?? [])
                .filter((r: any) => !enrolledSet.has(r.id))
                .map((r: any) => (
                  <button
                    key={r.id}
                    onClick={() => enroll.mutate(r.id)}
                    className="w-full text-left rounded-lg px-3 py-2 text-sm hover:bg-muted"
                  >
                    <div className="font-medium">{r.full_name ?? r.name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {r.admission_no ?? r.admissionNo ?? ""}
                    </div>
                  </button>
                ))}
            {q.length >= 2 && (search?.rows ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground px-1">No matching students.</p>
            )}
            {q.length < 2 && (
              <p className="text-xs text-muted-foreground px-1">
                Type at least 2 characters to search.
              </p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
