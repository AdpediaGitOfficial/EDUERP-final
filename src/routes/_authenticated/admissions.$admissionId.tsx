import { RequireRole } from "@/components/require-role";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell, PageHeader } from "@/components/app-shell";
import { apiGet, apiPost } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useState } from "react";
import { Check, Search, UserCheck } from "lucide-react";
import { ADMISSION_STAGES, STAGE_LABEL, stageBadgeClass } from "@/lib/admission-stages";
import { fmtDate } from "@/lib/module-util";

export const Route = createFileRoute("/_authenticated/admissions/$admissionId")({
  component: () => (
    <RequireRole roles={["admin", "reception"]}>
      <AdmissionDetail />
    </RequireRole>
  ),
});

function AdmissionDetail() {
  const { admissionId } = Route.useParams();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [feeStructureId, setFeeStructureId] = useState("");
  const [classId, setClassId] = useState("");
  const [section, setSection] = useState("A");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const { data } = useQuery({
    queryKey: ["admission", admissionId],
    queryFn: () => apiGet<any>(`/admissions/${admissionId}`),
  });
  const { data: classes } = useQuery({
    queryKey: ["adm-classes"],
    queryFn: () => apiGet<{ id: string; name: string; section: string }[]>("/classes"),
  });
  const { data: feeStructures } = useQuery({
    queryKey: ["adm-fees"],
    queryFn: () => apiGet<{ id: string; name: string; amount: number }[]>("/fees/structures"),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["admission", admissionId] });

  if (!data) {
    return (
      <AppShell>
        <div className="p-8 text-sm text-muted-foreground">Loading admission…</div>
      </AppShell>
    );
  }

  const stage: string = data.stage;
  const terminal = stage === "admitted" || stage === "rejected";
  const currentIdx = ADMISSION_STAGES.indexOf(stage as any);

  const act = async (fn: () => Promise<any>, okMsg: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(okMsg);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const advanceBody = () => {
    if (stage === "fee_assignment") return { feeStructureId: feeStructureId || undefined };
    if (stage === "class_allocation") return { classId: classId || undefined, section };
    return {};
  };

  return (
    <AppShell>
      <div className="mb-4">
        <Link to="/admissions" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to admissions
        </Link>
      </div>
      <PageHeader
        title={data.studentName}
        subtitle={`${data.admissionNo ? data.admissionNo + " · " : ""}${data.gradeApplying ?? "Applicant"}`}
        action={<Badge className={stageBadgeClass(stage)}>{STAGE_LABEL[stage] ?? stage}</Badge>}
      />

      {/* Stage tracker */}
      <Card className="rounded-2xl p-4 mb-4 overflow-x-auto">
        <div className="flex items-center gap-2 min-w-[720px]">
          {ADMISSION_STAGES.map((s, i) => {
            const done = currentIdx > i || stage === "admitted";
            const active = currentIdx === i;
            return (
              <div key={s} className="flex items-center gap-2 shrink-0">
                <div className="flex flex-col items-center gap-1">
                  <span
                    className={`grid size-7 place-items-center rounded-full text-[11px] ${
                      done
                        ? "bg-primary text-primary-foreground"
                        : active
                          ? "border-2 border-primary text-primary"
                          : "border text-muted-foreground"
                    }`}
                  >
                    {done ? <Check className="size-3.5" /> : i + 1}
                  </span>
                  <span
                    className={`text-[10px] text-center w-20 ${active ? "text-primary font-medium" : "text-muted-foreground"}`}
                  >
                    {STAGE_LABEL[s]}
                  </span>
                </div>
                {i < ADMISSION_STAGES.length - 1 && (
                  <div className={`h-px w-6 ${done ? "bg-primary" : "bg-border"}`} />
                )}
              </div>
            );
          })}
        </div>
        {stage === "rejected" && (
          <div className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
            Rejected — {data.rejectionReason}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Applicant details */}
        <Card className="rounded-2xl p-6 lg:col-span-2">
          <div className="font-medium text-sm mb-4">Applicant</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <Info
              label="Date of birth"
              value={data.applicantDob ? fmtDate(data.applicantDob) : "—"}
            />
            <Info label="Gender" value={data.applicantGender ?? "—"} />
            <Info label="Blood group" value={data.bloodGroup ?? "—"} />
            <Info label="Previous school" value={data.previousSchool ?? "—"} />
            <Info label="Transport" value={data.transportRequired ? "Required" : "No"} />
            <Info label="Hostel" value={data.hostelRequired ? "Required" : "No"} />
            <Info label="Address" value={data.applicantAddress ?? "—"} />
            <Info label="Class allocated" value={data.className ?? "—"} />
            <Info label="Fee structure" value={data.feeStructureName ?? "—"} />
          </div>
          {data.medicalNotes && (
            <div className="mt-4 text-sm">
              <div className="text-xs text-muted-foreground">Medical notes</div>
              <div>{data.medicalNotes}</div>
            </div>
          )}
          {data.convertedStudentId && (
            <div className="mt-4">
              <Button asChild size="sm" variant="outline">
                <Link to="/children/$studentId" params={{ studentId: data.convertedStudentId }}>
                  Open student record
                </Link>
              </Button>
            </div>
          )}
        </Card>

        {/* Action panel */}
        <div className="space-y-4">
          <Card className="rounded-2xl p-6">
            <div className="font-medium text-sm mb-3">Workflow</div>
            {stage === "draft" && (
              <Button
                className="w-full"
                disabled={busy}
                onClick={() => act(() => apiPost(`/admissions/${admissionId}/submit`), "Submitted")}
              >
                Submit for review
              </Button>
            )}
            {!terminal && stage !== "draft" && (
              <div className="space-y-3">
                {stage === "fee_assignment" && (
                  <div className="space-y-1.5">
                    <Label>Fee structure</Label>
                    <Select value={feeStructureId} onValueChange={setFeeStructureId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a fee structure" />
                      </SelectTrigger>
                      <SelectContent>
                        {(feeStructures ?? []).map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.name} · ₹{Number(f.amount).toLocaleString()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {stage === "class_allocation" && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5 col-span-2">
                      <Label>Class</Label>
                      <Select value={classId} onValueChange={setClassId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a class" />
                        </SelectTrigger>
                        <SelectContent>
                          {(classes ?? []).map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name} {c.section}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Section</Label>
                      <Input value={section} onChange={(e) => setSection(e.target.value)} />
                    </div>
                  </div>
                )}
                <Button
                  className="w-full"
                  disabled={busy || (stage === "class_allocation" && !classId)}
                  onClick={() =>
                    act(
                      () => apiPost(`/admissions/${admissionId}/advance`, advanceBody()),
                      "Advanced",
                    )
                  }
                >
                  {stage === "approved"
                    ? "Admit student"
                    : `Advance → ${STAGE_LABEL[ADMISSION_STAGES[currentIdx + 1]]}`}
                </Button>
                <Button
                  variant="outline"
                  className="w-full text-destructive"
                  onClick={() => setRejectOpen(true)}
                >
                  Reject
                </Button>
              </div>
            )}
            {stage === "admitted" && (
              <div className="text-sm text-emerald-700">
                <UserCheck className="size-4 inline mr-1" /> Admitted — student & portal account
                created.
              </div>
            )}
          </Card>

          {/* Parent link */}
          <Card className="rounded-2xl p-6">
            <div className="font-medium text-sm mb-3">Parent / guardian</div>
            {data.parent ? (
              <div className="text-sm">
                <div className="font-medium">{data.parent.fullName}</div>
                <div className="text-muted-foreground text-xs">
                  {data.parent.email ?? "—"} · {data.parent.phone ?? "—"}
                </div>
                <Link
                  to="/parents/$parentId"
                  params={{ parentId: data.parent.id }}
                  className="text-xs text-primary hover:underline"
                >
                  Open parent profile
                </Link>
                {!terminal && <ParentLinker admissionId={admissionId} onLinked={refresh} relabel />}
              </div>
            ) : (
              <div className="text-sm">
                <p className="text-muted-foreground text-xs mb-2">
                  Search an existing parent to link (prevents duplicates) before admitting.
                </p>
                {!terminal && <ParentLinker admissionId={admissionId} onLinked={refresh} />}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Stage history */}
      <Card className="rounded-2xl overflow-hidden mt-4">
        <div className="p-4 border-b font-medium text-sm">Stage history</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="p-3">When</th>
                <th className="p-3">Stage</th>
                <th className="p-3">Note</th>
              </tr>
            </thead>
            <tbody>
              {(data.history ?? []).map((h: any) => (
                <tr key={h.id} className="border-t">
                  <td className="p-3 text-muted-foreground">{new Date(h.at).toLocaleString()}</td>
                  <td className="p-3">
                    <Badge className={stageBadgeClass(h.toStage)}>
                      {STAGE_LABEL[h.toStage] ?? h.toStage}
                    </Badge>
                  </td>
                  <td className="p-3 text-muted-foreground">{h.note ?? "—"}</td>
                </tr>
              ))}
              {(data.history ?? []).length === 0 && (
                <tr>
                  <td colSpan={3} className="p-6 text-center text-muted-foreground text-sm">
                    No stage changes yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject admission</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Reason</Label>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Why is this application rejected?"
            />
            <Button
              variant="destructive"
              className="w-full"
              disabled={busy || rejectReason.trim().length < 2}
              onClick={() =>
                act(async () => {
                  await apiPost(`/admissions/${admissionId}/reject`, {
                    reason: rejectReason.trim(),
                  });
                  setRejectOpen(false);
                  setRejectReason("");
                }, "Rejected")
              }
            >
              Confirm rejection
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium break-words">{value}</div>
    </div>
  );
}

function ParentLinker({
  admissionId,
  onLinked,
  relabel,
}: {
  admissionId: string;
  onLinked: () => void;
  relabel?: boolean;
}) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const { data } = useQuery({
    queryKey: ["adm-parent-search", q],
    queryFn: () => apiGet<{ matches: any[] }>(`/parents/search?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length >= 2,
  });

  const link = async (parentId: string) => {
    setBusy(true);
    try {
      await apiPost(`/admissions/${admissionId}/parent`, { parentId });
      toast.success("Parent linked.");
      setQ("");
      onLinked();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Link failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={relabel ? "Change parent…" : "Search existing parent…"}
          className="pl-8 h-9"
        />
      </div>
      {q.trim().length >= 2 && (
        <div className="max-h-48 overflow-y-auto rounded-lg border divide-y">
          {(data?.matches ?? []).map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-2 p-2">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{m.fullName}</div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {m.email ?? "—"} · {m.phone ?? "—"}
                </div>
              </div>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => link(m.id)}>
                Link
              </Button>
            </div>
          ))}
          {(data?.matches ?? []).length === 0 && (
            <div className="p-3 text-center text-xs text-muted-foreground">
              No match — create the parent from the Parents page first.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
