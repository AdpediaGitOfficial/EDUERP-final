import { RequireRole } from "@/components/require-role";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";
import { apiPatch, apiPost } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useState } from "react";
import { Check, ChevronLeft, ChevronRight, Save } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admissions/new")({
  component: () => (
    <RequireRole roles={["admin", "reception"]}>
      <NewAdmissionWizard />
    </RequireRole>
  ),
});

const STEPS = ["Student", "Background", "Guardian", "Review"];

type Form = {
  studentName: string;
  applicantDob: string;
  applicantGender: string;
  gradeApplying: string;
  bloodGroup: string;
  applicantAddress: string;
  previousSchool: string;
  transportRequired: boolean;
  hostelRequired: boolean;
  medicalNotes: string;
  parentName: string;
  parentPhone: string;
  parentEmail: string;
};

const empty: Form = {
  studentName: "",
  applicantDob: "",
  applicantGender: "",
  gradeApplying: "",
  bloodGroup: "",
  applicantAddress: "",
  previousSchool: "",
  transportRequired: false,
  hostelRequired: false,
  medicalNotes: "",
  parentName: "",
  parentPhone: "",
  parentEmail: "",
};

function NewAdmissionWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>(empty);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const text = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    set(k, e.target.value as any);

  const payload = () => ({
    studentName: form.studentName.trim(),
    applicantDob: form.applicantDob || undefined,
    applicantGender: form.applicantGender || undefined,
    gradeApplying: form.gradeApplying || undefined,
    bloodGroup: form.bloodGroup || undefined,
    applicantAddress: form.applicantAddress || undefined,
    previousSchool: form.previousSchool || undefined,
    transportRequired: form.transportRequired,
    hostelRequired: form.hostelRequired,
    medicalNotes: form.medicalNotes || undefined,
    parentName: form.parentName || undefined,
    parentPhone: form.parentPhone || undefined,
    parentEmail: form.parentEmail || undefined,
  });

  /** Create the draft on first save, then PATCH thereafter. Returns the id. */
  const persist = async (): Promise<string> => {
    if (draftId) {
      await apiPatch(`/admissions/${draftId}`, payload());
      return draftId;
    }
    const res = await apiPost<{ id: string }>("/admissions", payload());
    setDraftId(res.id);
    return res.id;
  };

  const saveDraft = async () => {
    if (!form.studentName.trim()) return toast.error("Student name is required to save.");
    setBusy(true);
    try {
      await persist();
      toast.success("Draft saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!form.studentName.trim()) return toast.error("Student name is required.");
    setBusy(true);
    try {
      const id = await persist();
      await apiPost(`/admissions/${id}/submit`);
      toast.success("Application submitted.");
      navigate({ to: "/admissions/$admissionId", params: { admissionId: id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setBusy(false);
    }
  };

  const next = () => {
    if (step === 0 && !form.studentName.trim()) return toast.error("Student name is required.");
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };

  return (
    <AppShell>
      <div className="mb-4">
        <Link to="/admissions" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to admissions
        </Link>
      </div>
      <PageHeader
        title="New admission"
        subtitle="Capture the application. Save as draft any time and resume later."
        action={
          <Button variant="outline" onClick={saveDraft} disabled={busy}>
            <Save className="size-4" /> Save draft
          </Button>
        }
      />

      {/* Stepper */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`flex items-center gap-1.5 ${i <= step ? "text-primary" : "text-muted-foreground"}`}
            >
              <span
                className={`grid size-6 place-items-center rounded-full text-[11px] ${i < step ? "bg-primary text-primary-foreground" : i === step ? "border-2 border-primary" : "border"}`}
              >
                {i < step ? <Check className="size-3" /> : i + 1}
              </span>
              <span className="hidden sm:inline">{s}</span>
            </div>
          ))}
        </div>
        <Progress value={((step + 1) / STEPS.length) * 100} className="mt-2 h-1.5" />
      </div>

      <Card className="rounded-2xl p-6">
        {step === 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Student full name" required>
              <Input value={form.studentName} onChange={text("studentName")} />
            </Field>
            <Field label="Date of birth">
              <Input type="date" value={form.applicantDob} onChange={text("applicantDob")} />
            </Field>
            <Field label="Gender">
              <Select value={form.applicantGender} onValueChange={(v) => set("applicantGender", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {["male", "female", "other"].map((g) => (
                    <SelectItem key={g} value={g} className="capitalize">
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Grade applying for">
              <Input
                value={form.gradeApplying}
                onChange={text("gradeApplying")}
                placeholder="e.g. Grade 1"
              />
            </Field>
            <Field label="Blood group">
              <Input value={form.bloodGroup} onChange={text("bloodGroup")} placeholder="e.g. O+" />
            </Field>
            <Field label="Address" full>
              <Input value={form.applicantAddress} onChange={text("applicantAddress")} />
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Previous school" full>
              <Input value={form.previousSchool} onChange={text("previousSchool")} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.transportRequired}
                onChange={(e) => set("transportRequired", e.target.checked)}
              />
              Transport required
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.hostelRequired}
                onChange={(e) => set("hostelRequired", e.target.checked)}
              />
              Hostel required
            </label>
            <Field label="Medical notes / allergies" full>
              <Textarea value={form.medicalNotes} onChange={text("medicalNotes")} />
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Capture the guardian's contact details. During the Parent Verification stage you'll
              search for an existing parent (to avoid duplicates) or create the account.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Parent / guardian name">
                <Input value={form.parentName} onChange={text("parentName")} />
              </Field>
              <Field label="Mobile">
                <Input value={form.parentPhone} onChange={text("parentPhone")} />
              </Field>
              <Field label="Email" full>
                <Input type="email" value={form.parentEmail} onChange={text("parentEmail")} />
              </Field>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3 text-sm">
            <div className="font-medium">Review</div>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Review k="Student" v={form.studentName} />
              <Review k="DOB" v={form.applicantDob} />
              <Review k="Gender" v={form.applicantGender} />
              <Review k="Grade" v={form.gradeApplying} />
              <Review k="Blood group" v={form.bloodGroup} />
              <Review k="Previous school" v={form.previousSchool} />
              <Review k="Transport" v={form.transportRequired ? "Yes" : "No"} />
              <Review k="Hostel" v={form.hostelRequired ? "Yes" : "No"} />
              <Review k="Guardian" v={form.parentName} />
              <Review k="Mobile" v={form.parentPhone} />
              <Review k="Email" v={form.parentEmail} />
            </dl>
            <p className="text-xs text-muted-foreground">
              Submitting generates an admission number and moves the application into the review
              pipeline.
            </p>
          </div>
        )}

        <div className="mt-6 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
          >
            <ChevronLeft className="size-4" /> Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={next}>
              Next <ChevronRight className="size-4" />
            </Button>
          ) : (
            <Button onClick={submit} disabled={busy}>
              {busy ? "Submitting…" : "Submit application"}
            </Button>
          )}
        </div>
      </Card>
    </AppShell>
  );
}

function Field({
  label,
  children,
  required,
  full,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  full?: boolean;
}) {
  return (
    <div className={`space-y-1.5 ${full ? "sm:col-span-2" : ""}`}>
      <Label>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
    </div>
  );
}

function Review({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd className="font-medium break-words">{v || "—"}</dd>
    </div>
  );
}
