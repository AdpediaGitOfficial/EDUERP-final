import { RequireRole } from "@/components/require-role";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell, PageHeader } from "@/components/app-shell";
import { apiGet, apiPost } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  User,
  Users,
  HeartPulse,
  FolderOpen,
  Search,
  Wand2,
  Copy,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admissions/new")({
  component: () => (
    <RequireRole roles={["admin", "reception"]}>
      <NewAdmissionWizard />
    </RequireRole>
  ),
});

const STEPS = [
  { label: "Academic", icon: GraduationCap },
  { label: "Personal Info", icon: User },
  { label: "Parents", icon: Users },
  { label: "Health & Bank", icon: HeartPulse },
  { label: "Documents & Fees", icon: FolderOpen },
];

type Guardian = {
  name: string;
  middleName: string;
  phone: string;
  occupation: string;
  qualification: string;
  aadhaar: string;
  annualIncome: string;
};
const emptyGuardian = (): Guardian => ({
  name: "",
  middleName: "",
  phone: "",
  occupation: "",
  qualification: "",
  aadhaar: "",
  annualIncome: "",
});

type ClassRow = { id: string; name: string; section: string };
type Fee = { id: string; name: string; amount: string; frequency?: string; academicYear?: string };
type CustomField = { id: string; label: string; fieldType: string; options: string[] };
type ParentMatch = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  hasLogin?: boolean;
  children?: { name?: string }[];
};

function NewAdmissionWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any | null>(null);

  const { data: classes = [] } = useQuery({
    queryKey: ["classes"],
    queryFn: () => apiGet<ClassRow[]>("/classes"),
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["sis-categories"],
    queryFn: () => apiGet<{ id: string; name: string }[]>("/sis/categories"),
  });
  const { data: feeGroups = [] } = useQuery({
    queryKey: ["fee-structures"],
    queryFn: () => apiGet<Fee[]>("/fees/structures"),
  });
  const { data: customFields = [] } = useQuery({
    queryKey: ["sis-custom-fields-active"],
    queryFn: () => apiGet<CustomField[]>("/sis/custom-fields"),
  });

  const [f, setF] = useState({
    admissionNo: "",
    rollNo: "",
    admissionDate: new Date().toISOString().slice(0, 10),
    className: "",
    classId: "",
    biometricId: "",
    previousSchool: "",
    openingDueBalance: "0",
    firstName: "",
    middleName: "",
    lastName: "",
    gender: "",
    dob: "",
    categoryId: "",
    house: "",
    bloodGroup: "",
    religion: "",
    aadhaarNo: "",
    penSssmId: "",
    caste: "",
    subCaste: "",
    motherTongue: "",
    placeOfBirth: "",
    nationality: "Indian",
    bpl: false,
    rte: false,
    studentPhone: "",
    studentEmail: "",
    parentMode: "new" as "new" | "existing",
    existingParentId: "",
    primaryGuardian: "father" as "father" | "mother" | "other",
    parentLoginEmail: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
    guardianAddress: "",
    currentAddress: "",
    permanentAddress: "",
    sameAsGuardian: false,
    heightCm: "",
    weightKg: "",
    medicalHistory: "",
    bankName: "",
    bankAccount: "",
    bankIfsc: "",
    feeGroupIds: [] as string[],
    customValues: {} as Record<string, string>,
  });
  const [father, setFather] = useState<Guardian>(emptyGuardian());
  const [mother, setMother] = useState<Guardian>(emptyGuardian());

  const set = (k: keyof typeof f, v: any) => setF((s) => ({ ...s, [k]: v }));
  const txt =
    (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      set(k, e.target.value);

  // "Auto" buttons: fetch (and reserve) a real admission / roll number.
  const [autoBusy, setAutoBusy] = useState<"adm" | "roll" | null>(null);
  const fillAuto = async (which: "adm" | "roll") => {
    if (which === "roll" && !f.classId) return toast.error("Select a class & section first.");
    setAutoBusy(which);
    try {
      const q = which === "roll" ? `?classId=${f.classId}` : "";
      const res = await apiGet<{ admissionNo: string | null; rollNo: string | null }>(
        `/admissions/next-numbers${q}`,
      );
      if (which === "adm" && res.admissionNo) set("admissionNo", res.admissionNo);
      if (which === "roll" && res.rollNo) set("rollNo", res.rollNo);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate");
    } finally {
      setAutoBusy(null);
    }
  };

  // De-duplicate fee groups by name for a tidy picker (test data can repeat names).
  const feeOptions = useMemo(() => {
    const seen = new Set<string>();
    return feeGroups.filter((fee) => (seen.has(fee.name) ? false : seen.add(fee.name)));
  }, [feeGroups]);

  const classNames = useMemo(() => Array.from(new Set(classes.map((c) => c.name))), [classes]);
  const sectionsForClass = useMemo(
    () => classes.filter((c) => c.name === f.className),
    [classes, f.className],
  );

  const [parentQuery, setParentQuery] = useState("");
  const [pq, setPq] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setPq(parentQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [parentQuery]);
  const { data: parentSearch } = useQuery({
    queryKey: ["parent-search", pq],
    queryFn: () =>
      apiGet<{ matches: ParentMatch[] }>(`/parents/search?q=${encodeURIComponent(pq)}`),
    enabled: f.parentMode === "existing" && pq.length >= 2,
  });
  const [pickedParent, setPickedParent] = useState<ParentMatch | null>(null);

  const toggleFee = (id: string) =>
    set(
      "feeGroupIds",
      f.feeGroupIds.includes(id) ? f.feeGroupIds.filter((x) => x !== id) : [...f.feeGroupIds, id],
    );

  const payload = () => ({
    admissionNo: f.admissionNo || undefined,
    rollNo: f.rollNo || undefined,
    admissionDate: f.admissionDate || undefined,
    classId: f.classId,
    section: sectionsForClass.find((c) => c.id === f.classId)?.section || undefined,
    biometricId: f.biometricId || undefined,
    previousSchool: f.previousSchool || undefined,
    openingDueBalance: Number(f.openingDueBalance) || 0,
    firstName: f.firstName.trim(),
    middleName: f.middleName || undefined,
    lastName: f.lastName || undefined,
    gender: f.gender || undefined,
    dob: f.dob || undefined,
    categoryId: f.categoryId || undefined,
    house: f.house || undefined,
    bloodGroup: f.bloodGroup || undefined,
    religion: f.religion || undefined,
    aadhaarNo: f.aadhaarNo || undefined,
    penSssmId: f.penSssmId || undefined,
    caste: f.caste || undefined,
    subCaste: f.subCaste || undefined,
    motherTongue: f.motherTongue || undefined,
    placeOfBirth: f.placeOfBirth || undefined,
    nationality: f.nationality || undefined,
    bpl: f.bpl,
    rte: f.rte,
    studentPhone: f.studentPhone || undefined,
    studentEmail: f.studentEmail || undefined,
    parentMode: f.parentMode,
    existingParentId: f.parentMode === "existing" ? f.existingParentId || undefined : undefined,
    primaryGuardian: f.primaryGuardian,
    father: guardianPayload(father),
    mother: guardianPayload(mother),
    parentLoginEmail: f.parentLoginEmail || undefined,
    emergencyContactName: f.emergencyContactName || undefined,
    emergencyContactPhone: f.emergencyContactPhone || undefined,
    guardianAddress: f.guardianAddress || undefined,
    currentAddress: f.currentAddress || undefined,
    permanentAddress: (f.sameAsGuardian ? f.guardianAddress : f.permanentAddress) || undefined,
    heightCm: f.heightCm ? Number(f.heightCm) : undefined,
    weightKg: f.weightKg ? Number(f.weightKg) : undefined,
    medicalHistory: f.medicalHistory || undefined,
    bankName: f.bankName || undefined,
    bankAccount: f.bankAccount || undefined,
    bankIfsc: f.bankIfsc || undefined,
    feeGroupIds: f.feeGroupIds,
    customFields: f.customValues,
  });

  const validateStep = (): string | null => {
    if (step === 0 && !f.classId) return "Select a class and section.";
    if (step === 1 && !f.firstName.trim()) return "First name is required.";
    if (step === 2) {
      if (f.parentMode === "existing" && !f.existingParentId)
        return "Search and select an existing parent.";
      if (f.parentMode === "new" && !f.parentLoginEmail.trim())
        return "Enter the Parent Account Login Email.";
      if (f.parentMode === "new" && !father.name.trim() && !mother.name.trim())
        return "Enter at least the father's or mother's name.";
    }
    return null;
  };

  const next = () => {
    const err = validateStep();
    if (err) return toast.error(err);
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };

  const submit = async () => {
    if (!f.classId) return toast.error("Select a class and section.");
    if (!f.firstName.trim()) return toast.error("First name is required.");
    if (f.admissionNo.trim() && !/^ADM-\d{4}-\d{5}$/.test(f.admissionNo.trim()))
      return toast.error(
        "Admission number must look like ADM-2026-00001 — use the wand to auto-generate, or leave it blank.",
      );
    if (f.parentMode === "existing" && !f.existingParentId)
      return toast.error("Select an existing parent.");
    if (f.parentMode === "new" && !f.parentLoginEmail.trim())
      return toast.error("Enter the Parent Account Login Email.");
    setBusy(true);
    try {
      const res = await apiPost<any>("/admissions/admit", payload());
      setResult(res);
      toast.success("Student admitted.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Admission failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell>
      <div className="mb-4">
        <Link to="/admissions" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to admissions
        </Link>
      </div>
      <PageHeader
        title="Student Admission"
        subtitle="Capture the full admission and admit the student in one step."
      />

      <div className="mb-4">
        <div className="flex items-center justify-between text-xs overflow-x-auto">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <button
                key={s.label}
                onClick={() => i < step && setStep(i)}
                className={`flex items-center gap-1.5 whitespace-nowrap px-1 ${i <= step ? "text-primary" : "text-muted-foreground"}`}
              >
                <span
                  className={`grid size-6 place-items-center rounded-full text-[11px] ${i < step ? "bg-primary text-primary-foreground" : i === step ? "border-2 border-primary" : "border"}`}
                >
                  {i < step ? <Check className="size-3" /> : <Icon className="size-3.5" />}
                </span>
                <span className="hidden sm:inline">
                  {i + 1}. {s.label}
                </span>
              </button>
            );
          })}
        </div>
        <Progress value={((step + 1) / STEPS.length) * 100} className="mt-2 h-1.5" />
      </div>

      <Card className="rounded-2xl p-6">
        {step === 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Admission No" hint="Format ADM-YYYY-NNNNN · use the wand to auto-generate, or leave blank">
              <div className="flex gap-2">
                <Input value={f.admissionNo} onChange={txt("admissionNo")} placeholder="ADM-2026-00001" />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => fillAuto("adm")}
                  disabled={autoBusy === "adm"}
                  title="Auto-generate admission number"
                  aria-label="Auto-generate admission number"
                >
                  <Wand2 className="size-4" />
                </Button>
              </div>
            </Field>
            <Field label="Roll Number" hint="Editable · wand auto-numbers per section (pick a class first)">
              <div className="flex gap-2">
                <Input value={f.rollNo} onChange={txt("rollNo")} placeholder="Auto" />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => fillAuto("roll")}
                  disabled={autoBusy === "roll"}
                  title="Auto-generate roll number"
                  aria-label="Auto-generate roll number"
                >
                  <Wand2 className="size-4" />
                </Button>
              </div>
            </Field>
            <Field label="Admission Date">
              <Input type="date" value={f.admissionDate} onChange={txt("admissionDate")} />
            </Field>
            <Field label="Class" required>
              <Select
                value={f.className}
                onValueChange={(v) => setF((s) => ({ ...s, className: v, classId: "" }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select class" />
                </SelectTrigger>
                <SelectContent>
                  {classNames.map((n) => (
                    <SelectItem key={n} value={n}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Section" required>
              <Select
                value={f.classId}
                onValueChange={(v) => set("classId", v)}
                disabled={!f.className}
              >
                <SelectTrigger>
                  <SelectValue placeholder={f.className ? "Select section" : "Select class first"} />
                </SelectTrigger>
                <SelectContent>
                  {sectionsForClass.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.section || "—"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Biometric ID" hint="Optional, hardware-ready">
              <Input value={f.biometricId} onChange={txt("biometricId")} placeholder="Device User ID" />
            </Field>
            <Field label="Previous School Name & Details" full>
              <Textarea value={f.previousSchool} onChange={txt("previousSchool")} />
            </Field>
            <Field label="Opening Due Balance" hint="Flows into the fee ledger as a starting balance">
              <Input type="number" value={f.openingDueBalance} onChange={txt("openingDueBalance")} />
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="First Name" required>
              <Input value={f.firstName} onChange={txt("firstName")} />
            </Field>
            <Field label="Middle Name">
              <Input value={f.middleName} onChange={txt("middleName")} />
            </Field>
            <Field label="Last Name">
              <Input value={f.lastName} onChange={txt("lastName")} />
            </Field>
            <Field label="Gender" required>
              <Select value={f.gender} onValueChange={(v) => set("gender", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
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
            <Field label="Date of Birth">
              <Input type="date" value={f.dob} onChange={txt("dob")} />
            </Field>
            <Field label="Category">
              <Select value={f.categoryId} onValueChange={(v) => set("categoryId", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="House">
              <Input value={f.house} onChange={txt("house")} />
            </Field>
            <Field label="Blood Group">
              <Input value={f.bloodGroup} onChange={txt("bloodGroup")} placeholder="e.g. O+" />
            </Field>
            <Field label="Religion">
              <Input value={f.religion} onChange={txt("religion")} />
            </Field>
            <Field label="Aadhaar / National ID">
              <Input value={f.aadhaarNo} onChange={txt("aadhaarNo")} />
            </Field>
            <Field label="PEN / SSSM ID">
              <Input value={f.penSssmId} onChange={txt("penSssmId")} />
            </Field>
            <Field label="Caste">
              <Input value={f.caste} onChange={txt("caste")} />
            </Field>
            <Field label="Sub-Caste">
              <Input value={f.subCaste} onChange={txt("subCaste")} />
            </Field>
            <Field label="Mother Tongue">
              <Input value={f.motherTongue} onChange={txt("motherTongue")} />
            </Field>
            <Field label="Place of Birth">
              <Input value={f.placeOfBirth} onChange={txt("placeOfBirth")} />
            </Field>
            <Field label="Nationality">
              <Input value={f.nationality} onChange={txt("nationality")} />
            </Field>
            <div className="flex flex-wrap items-center gap-4 sm:col-span-3">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={f.bpl} onCheckedChange={(v) => set("bpl", !!v)} /> Below Poverty
                Line (BPL)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={f.rte} onCheckedChange={(v) => set("rte", !!v)} /> RTE (Right to
                Education)
              </label>
            </div>
            <Field label="Student Phone" hint="Optional">
              <Input value={f.studentPhone} onChange={txt("studentPhone")} />
            </Field>
            <Field label="Student Email" hint="Optional login">
              <Input type="email" value={f.studentEmail} onChange={txt("studentEmail")} />
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div className="rounded-xl bg-teal-600 text-white p-4">
              <div className="font-medium mb-2">Parent Account Options</div>
              <div className="flex flex-col gap-2 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={f.parentMode === "new"}
                    onChange={() => set("parentMode", "new")}
                  />
                  Create New Parent Account
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={f.parentMode === "existing"}
                    onChange={() => set("parentMode", "existing")}
                  />
                  Link to Existing Parent Account
                </label>
              </div>
            </div>

            {f.parentMode === "existing" ? (
              <div className="space-y-2">
                <Label>Search Existing Parent *</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    value={parentQuery}
                    onChange={(e) => setParentQuery(e.target.value)}
                    placeholder="Search by Parent's Name, Email or Phone…"
                  />
                </div>
                {pickedParent && (
                  <div className="flex items-center justify-between rounded-lg border p-3 text-sm">
                    <div>
                      <span className="font-medium">{pickedParent.fullName}</span>{" "}
                      <span className="text-muted-foreground">
                        {pickedParent.email ?? pickedParent.phone ?? ""}
                      </span>
                    </div>
                    <Badge className="bg-emerald-100 text-emerald-700">Selected</Badge>
                  </div>
                )}
                {pq.length >= 2 && (parentSearch?.matches ?? []).length > 0 && (
                  <div className="rounded-lg border divide-y max-h-64 overflow-y-auto">
                    {(parentSearch?.matches ?? []).map((m) => (
                      <button
                        key={m.id}
                        className="w-full text-left p-3 hover:bg-muted/50 text-sm"
                        onClick={() => {
                          setPickedParent(m);
                          set("existingParentId", m.id);
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{m.fullName}</span>
                          {m.hasLogin ? (
                            <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">
                              Portal
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px]">
                              Guardian
                            </Badge>
                          )}
                          {(m.children?.length ?? 0) > 0 && (
                            <span className="text-[10px] text-muted-foreground">
                              {m.children!.length} child(ren)
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {m.email ?? "—"} · {m.phone ?? "—"}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {pq.length >= 2 && (parentSearch?.matches ?? []).length === 0 && (
                  <p className="text-sm text-muted-foreground">No matching parent found.</p>
                )}
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <span className="font-medium">Primary Guardian is:</span>
                  {(["father", "mother", "other"] as const).map((g) => (
                    <label key={g} className="flex items-center gap-1.5 capitalize">
                      <input
                        type="radio"
                        checked={f.primaryGuardian === g}
                        onChange={() => set("primaryGuardian", g)}
                      />
                      {g}
                    </label>
                  ))}
                </div>

                <GuardianBlock
                  title="Father Details"
                  color="text-blue-600"
                  g={father}
                  onChange={setFather}
                />
                <GuardianBlock
                  title="Mother Details"
                  color="text-pink-600"
                  g={mother}
                  onChange={setMother}
                />

                <Field
                  label="Parent Account Login Email"
                  required
                  hint="Used for the Parent Portal login"
                >
                  <Input type="email" value={f.parentLoginEmail} onChange={txt("parentLoginEmail")} />
                </Field>
              </>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Emergency Contact Name">
                <Input value={f.emergencyContactName} onChange={txt("emergencyContactName")} />
              </Field>
              <Field label="Emergency Contact Phone">
                <Input value={f.emergencyContactPhone} onChange={txt("emergencyContactPhone")} />
              </Field>
              <Field label="Guardian Address" full>
                <Textarea value={f.guardianAddress} onChange={txt("guardianAddress")} />
              </Field>
              <div className="sm:col-span-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={f.sameAsGuardian}
                    onCheckedChange={(v) => set("sameAsGuardian", !!v)}
                  />
                  Permanent Address is same as Guardian Address
                </label>
              </div>
              <Field label="Current Address">
                <Textarea value={f.currentAddress} onChange={txt("currentAddress")} />
              </Field>
              {!f.sameAsGuardian && (
                <Field label="Permanent Address">
                  <Textarea value={f.permanentAddress} onChange={txt("permanentAddress")} />
                </Field>
              )}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Height (cm)">
                <Input type="number" value={f.heightCm} onChange={txt("heightCm")} />
              </Field>
              <Field label="Weight (kg)">
                <Input type="number" value={f.weightKg} onChange={txt("weightKg")} />
              </Field>
              <Field label="Medical History / Allergies" full>
                <Textarea value={f.medicalHistory} onChange={txt("medicalHistory")} />
              </Field>
            </div>
            <div className="text-sm font-medium text-primary">Bank Details</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Bank Name">
                <Input value={f.bankName} onChange={txt("bankName")} />
              </Field>
              <Field label="Account Number">
                <Input value={f.bankAccount} onChange={txt("bankAccount")} />
              </Field>
              <Field label="IFSC Code">
                <Input value={f.bankIfsc} onChange={txt("bankIfsc")} />
              </Field>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <div>
              <div className="text-sm font-medium mb-2">Fee Groups</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {feeOptions.map((fee) => (
                  <label
                    key={fee.id}
                    className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm cursor-pointer hover:bg-muted/30"
                  >
                    <span className="flex items-center gap-2">
                      <Checkbox
                        checked={f.feeGroupIds.includes(fee.id)}
                        onCheckedChange={() => toggleFee(fee.id)}
                      />
                      {fee.name}
                    </span>
                    <span className="text-muted-foreground">
                      ₹{Number(fee.amount).toLocaleString("en-IN")}
                    </span>
                  </label>
                ))}
                {feeOptions.length === 0 && (
                  <p className="text-sm text-muted-foreground">No fee structures configured.</p>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {f.feeGroupIds.length} selected · an invoice is raised for each on admit.
              </p>
            </div>

            {customFields.length > 0 && (
              <div>
                <div className="text-sm font-medium mb-2">Additional Details</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {customFields.map((cf) => (
                    <Field key={cf.id} label={cf.label}>
                      {cf.fieldType === "dropdown" ? (
                        <Select
                          value={f.customValues[cf.id] ?? ""}
                          onValueChange={(v) =>
                            set("customValues", { ...f.customValues, [cf.id]: v })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={`Select ${cf.label}`} />
                          </SelectTrigger>
                          <SelectContent>
                            {cf.options.map((o) => (
                              <SelectItem key={o} value={o}>
                                {o}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          value={f.customValues[cf.id] ?? ""}
                          onChange={(e) =>
                            set("customValues", { ...f.customValues, [cf.id]: e.target.value })
                          }
                        />
                      )}
                    </Field>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-xl bg-muted/40 p-4 text-sm">
              <div className="font-medium mb-1">Ready to admit</div>
              <p className="text-muted-foreground">
                Submitting creates the student record, raises a fee invoice for each selected fee
                group{Number(f.openingDueBalance) > 0 ? " plus the opening balance" : ""}, and{" "}
                {f.parentMode === "new"
                  ? "creates the parent portal account"
                  : "links the selected parent"}{" "}
                — all in one operation.
              </p>
            </div>
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
              Next Step <ChevronRight className="size-4" />
            </Button>
          ) : (
            <Button onClick={submit} disabled={busy}>
              {busy ? "Admitting…" : "Admit Student"}
            </Button>
          )}
        </div>
      </Card>

      <Dialog open={!!result} onOpenChange={(o) => !o && setResult(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Student admitted</DialogTitle>
          </DialogHeader>
          {result && (
            <div className="space-y-3 text-sm">
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Admission No</div>
                <div className="font-mono font-medium">{result.admissionNo}</div>
                <div className="text-xs text-muted-foreground mt-2">Roll No</div>
                <div className="font-medium">{result.rollNo ?? "—"}</div>
              </div>
              <CredLine label="Student temp password" value={result.tempPassword} />
              {result.parentTempPassword && (
                <CredLine label="Parent temp password" value={result.parentTempPassword} />
              )}
              <p className="text-xs text-muted-foreground">
                Copy these now — passwords are not stored and can only be regenerated later.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setResult(null);
                navigate({ to: "/admissions" });
              }}
            >
              Done
            </Button>
            {result?.studentId && (
              <Button
                onClick={() =>
                  navigate({ to: "/children/$studentId", params: { studentId: result.studentId } })
                }
              >
                Open profile
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function guardianPayload(g: Guardian) {
  if (!g.name.trim()) return undefined;
  return {
    name: g.name.trim(),
    middleName: g.middleName || undefined,
    phone: g.phone || undefined,
    occupation: g.occupation || undefined,
    qualification: g.qualification || undefined,
    aadhaar: g.aadhaar || undefined,
    annualIncome: g.annualIncome ? Number(g.annualIncome) : undefined,
  };
}

function GuardianBlock({
  title,
  color,
  g,
  onChange,
}: {
  title: string;
  color: string;
  g: Guardian;
  onChange: (g: Guardian) => void;
}) {
  const set = (k: keyof Guardian) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...g, [k]: e.target.value });
  return (
    <div className="rounded-xl border p-4">
      <div className={`font-medium mb-3 ${color}`}>{title}</div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="Name">
          <Input value={g.name} onChange={set("name")} />
        </Field>
        <Field label="Phone">
          <Input value={g.phone} onChange={set("phone")} />
        </Field>
        <Field label="Occupation">
          <Input value={g.occupation} onChange={set("occupation")} />
        </Field>
        <Field label="Qualification">
          <Input value={g.qualification} onChange={set("qualification")} />
        </Field>
        <Field label="Aadhaar No.">
          <Input value={g.aadhaar} onChange={set("aadhaar")} />
        </Field>
        <Field label="Annual Income">
          <Input type="number" value={g.annualIncome} onChange={set("annualIncome")} />
        </Field>
      </div>
    </div>
  );
}

function CredLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-muted/50 p-2.5">
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-mono">{value}</div>
      </div>
      <Button
        size="icon"
        variant="ghost"
        onClick={() => {
          navigator.clipboard?.writeText(value);
          toast.success("Copied");
        }}
        aria-label={`Copy ${label}`}
      >
        <Copy className="size-4" />
      </Button>
    </div>
  );
}

function Field({
  label,
  children,
  required,
  full,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  full?: boolean;
  hint?: string;
}) {
  return (
    <div className={`space-y-1.5 ${full ? "sm:col-span-2 lg:col-span-3" : ""}`}>
      <Label>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
