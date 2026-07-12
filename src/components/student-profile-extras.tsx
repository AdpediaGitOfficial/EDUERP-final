import { useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPut, apiPatch, apiDelete } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useConfirm } from "@/components/confirm-dialog";
import { toast } from "sonner";
import {
  Users,
  HeartPulse,
  BedDouble,
  ShieldAlert,
  FileText,
  History,
  Bus,
  Pencil,
  Plus,
  Trash2,
  CheckCircle2,
  ExternalLink,
  CalendarDays,
  Megaphone,
  Clock,
  Wallet,
  Star,
  Printer,
  KeyRound,
  Mail,
  IdCard,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { QRCodeSVG } from "qrcode.react";
import Barcode from "react-barcode";

// ---------------------------------------------------------------- types ---

export type StudentProfile = {
  canEdit: boolean;
  medical: Record<string, any> | null;
  hostel: Record<string, any> | null;
  disciplinary: any[];
  documents: any[];
  activity: any[];
  admission: Record<string, any> | null;
  progressNotes: any[];
};

/** Shared query — every tab reads the same cache entry. */
export function useStudentProfile(studentId: string) {
  return useQuery({
    queryKey: ["student-profile", studentId],
    queryFn: () => apiGet<StudentProfile>(`/students/${studentId}/profile`),
  });
}

/** Consolidated SIS profile (header, fees, behavior, siblings, credentials). */
export function useSisProfile(studentId: string) {
  return useQuery({
    queryKey: ["sis-profile", studentId],
    queryFn: () => apiGet<any>(`/students/${studentId}/profile/sis`),
  });
}

const inr = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

function useProfileMutation(studentId: string) {
  const qc = useQueryClient();
  return (fn: () => Promise<StudentProfile>) =>
    fn().then((next) => {
      qc.setQueryData(["student-profile", studentId], next);
      return next;
    });
}

const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString() : "—");
const fmtDateTime = (d?: string | null) => (d ? new Date(d).toLocaleString() : "—");

// -------------------------------------------------------- small helpers ---

function DL({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs text-muted-foreground">{k}</dt>
          <dd className="font-medium break-words">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

function TabField({
  label,
  htmlFor,
  children,
  full,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
  full?: boolean;
}) {
  return (
    <div className={`space-y-1.5 ${full ? "sm:col-span-2" : ""}`}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function severityBadge(s: string) {
  if (s === "major") return <Badge className="bg-red-100 text-red-700 border-0">Major</Badge>;
  if (s === "moderate")
    return <Badge className="bg-orange-100 text-orange-700 border-0">Moderate</Badge>;
  return <Badge className="bg-amber-100 text-amber-700 border-0">Minor</Badge>;
}

// ========================================================= MEDICAL TAB ===

export function MedicalTab({ studentId }: { studentId: string }) {
  const { data } = useStudentProfile(studentId);
  const run = useProfileMutation(studentId);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const m = data?.medical;

  const openEdit = () => {
    setForm({
      bloodGroup: m?.bloodGroup ?? "",
      allergies: m?.allergies ?? "",
      chronicConditions: m?.chronicConditions ?? "",
      medications: m?.medications ?? "",
      disabilities: m?.disabilities ?? "",
      physicianName: m?.physicianName ?? "",
      physicianPhone: m?.physicianPhone ?? "",
      emergencyContactName: m?.emergencyContactName ?? "",
      emergencyContactPhone: m?.emergencyContactPhone ?? "",
      insuranceProvider: m?.insuranceProvider ?? "",
      insuranceNumber: m?.insuranceNumber ?? "",
      notes: m?.notes ?? "",
    });
    setOpen(true);
  };

  const save = async () => {
    setBusy(true);
    try {
      await run(() => apiPut<StudentProfile>(`/students/${studentId}/profile/medical`, form));
      toast.success("Medical information saved.");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const t = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Card className="rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 font-display font-semibold">
          <HeartPulse className="size-4 text-primary" /> Medical information
        </div>
        {data?.canEdit && (
          <Button size="sm" variant="outline" onClick={openEdit}>
            <Pencil className="size-4" /> {m ? "Edit" : "Add"}
          </Button>
        )}
      </div>
      {m ? (
        <DL
          items={[
            ["Blood group", m.bloodGroup],
            ["Allergies", m.allergies],
            ["Chronic conditions", m.chronicConditions],
            ["Regular medications", m.medications],
            ["Disabilities / special needs", m.disabilities],
            ["Physician", m.physicianName],
            ["Physician phone", m.physicianPhone],
            ["Emergency contact", m.emergencyContactName],
            ["Emergency phone", m.emergencyContactPhone],
            ["Insurance provider", m.insuranceProvider],
            ["Insurance number", m.insuranceNumber],
            ["Notes", m.notes],
          ]}
        />
      ) : (
        <p className="text-sm text-muted-foreground">No medical information recorded yet.</p>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Medical information</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto pr-1">
            <TabField label="Blood group" htmlFor="m-blood">
              <Input id="m-blood" value={form.bloodGroup} onChange={t("bloodGroup")} />
            </TabField>
            <TabField label="Physician name" htmlFor="m-phys">
              <Input id="m-phys" value={form.physicianName} onChange={t("physicianName")} />
            </TabField>
            <TabField label="Allergies" htmlFor="m-allergy" full>
              <Textarea id="m-allergy" value={form.allergies} onChange={t("allergies")} />
            </TabField>
            <TabField label="Chronic conditions" htmlFor="m-chronic" full>
              <Textarea
                id="m-chronic"
                value={form.chronicConditions}
                onChange={t("chronicConditions")}
              />
            </TabField>
            <TabField label="Regular medications" htmlFor="m-meds" full>
              <Textarea id="m-meds" value={form.medications} onChange={t("medications")} />
            </TabField>
            <TabField label="Disabilities / special needs" htmlFor="m-dis" full>
              <Textarea id="m-dis" value={form.disabilities} onChange={t("disabilities")} />
            </TabField>
            <TabField label="Physician phone" htmlFor="m-physph">
              <Input id="m-physph" value={form.physicianPhone} onChange={t("physicianPhone")} />
            </TabField>
            <TabField label="Emergency contact" htmlFor="m-ec">
              <Input
                id="m-ec"
                value={form.emergencyContactName}
                onChange={t("emergencyContactName")}
              />
            </TabField>
            <TabField label="Emergency phone" htmlFor="m-ecp">
              <Input
                id="m-ecp"
                value={form.emergencyContactPhone}
                onChange={t("emergencyContactPhone")}
              />
            </TabField>
            <TabField label="Insurance provider" htmlFor="m-ins">
              <Input id="m-ins" value={form.insuranceProvider} onChange={t("insuranceProvider")} />
            </TabField>
            <TabField label="Insurance number" htmlFor="m-insno">
              <Input id="m-insno" value={form.insuranceNumber} onChange={t("insuranceNumber")} />
            </TabField>
            <TabField label="Notes" htmlFor="m-notes" full>
              <Textarea id="m-notes" value={form.notes} onChange={t("notes")} />
            </TabField>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ========================================================== HOSTEL TAB ===

export function HostelTab({ studentId }: { studentId: string }) {
  const { data } = useStudentProfile(studentId);
  const run = useProfileMutation(studentId);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  const h = data?.hostel;

  const openEdit = () => {
    setForm({
      isResident: h?.isResident ?? false,
      hostelBlock: h?.hostelBlock ?? "",
      roomNo: h?.roomNo ?? "",
      bedNo: h?.bedNo ?? "",
      wardenName: h?.wardenName ?? "",
      wardenPhone: h?.wardenPhone ?? "",
      checkInDate: h?.checkInDate ?? "",
      checkOutDate: h?.checkOutDate ?? "",
      notes: h?.notes ?? "",
    });
    setOpen(true);
  };

  const save = async () => {
    setBusy(true);
    try {
      await run(() => apiPut<StudentProfile>(`/students/${studentId}/profile/hostel`, form));
      toast.success("Hostel details saved.");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const t = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Card className="rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 font-display font-semibold">
          <BedDouble className="size-4 text-primary" /> Hostel / boarding
        </div>
        {data?.canEdit && (
          <Button size="sm" variant="outline" onClick={openEdit}>
            <Pencil className="size-4" /> {h ? "Edit" : "Add"}
          </Button>
        )}
      </div>
      {h && h.isResident ? (
        <DL
          items={[
            ["Status", <Badge className="bg-emerald-100 text-emerald-700 border-0">Resident</Badge>],
            ["Block", h.hostelBlock],
            ["Room", h.roomNo],
            ["Bed", h.bedNo],
            ["Warden", h.wardenName],
            ["Warden phone", h.wardenPhone],
            ["Check-in", fmtDate(h.checkInDate)],
            ["Check-out", fmtDate(h.checkOutDate)],
            ["Notes", h.notes],
          ]}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Day scholar — not a boarding resident.
          {data?.canEdit ? " Use Edit to record hostel allocation." : ""}
        </p>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Hostel / boarding</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={!!form.isResident}
                onCheckedChange={(v) => setForm((f) => ({ ...f, isResident: !!v }))}
              />
              Boarding resident
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TabField label="Block" htmlFor="h-block">
                <Input id="h-block" value={form.hostelBlock} onChange={t("hostelBlock")} />
              </TabField>
              <TabField label="Room no." htmlFor="h-room">
                <Input id="h-room" value={form.roomNo} onChange={t("roomNo")} />
              </TabField>
              <TabField label="Bed no." htmlFor="h-bed">
                <Input id="h-bed" value={form.bedNo} onChange={t("bedNo")} />
              </TabField>
              <TabField label="Warden" htmlFor="h-warden">
                <Input id="h-warden" value={form.wardenName} onChange={t("wardenName")} />
              </TabField>
              <TabField label="Warden phone" htmlFor="h-wphone">
                <Input id="h-wphone" value={form.wardenPhone} onChange={t("wardenPhone")} />
              </TabField>
              <TabField label="Check-in date" htmlFor="h-in">
                <Input id="h-in" type="date" value={form.checkInDate} onChange={t("checkInDate")} />
              </TabField>
              <TabField label="Check-out date" htmlFor="h-out">
                <Input
                  id="h-out"
                  type="date"
                  value={form.checkOutDate}
                  onChange={t("checkOutDate")}
                />
              </TabField>
              <TabField label="Notes" htmlFor="h-notes" full>
                <Textarea id="h-notes" value={form.notes} onChange={t("notes")} />
              </TabField>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ==================================================== DISCIPLINARY TAB ===

export function DisciplinaryTab({ studentId }: { studentId: string }) {
  const { data } = useStudentProfile(studentId);
  const run = useProfileMutation(studentId);
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({
    severity: "minor",
    category: "general",
    description: "",
    actionTaken: "",
    incidentDate: "",
  });
  const [busy, setBusy] = useState(false);
  const rows = data?.disciplinary ?? [];

  const add = async () => {
    if (!form.description.trim()) return toast.error("Description is required.");
    setBusy(true);
    try {
      await run(() =>
        apiPost<StudentProfile>(`/students/${studentId}/profile/disciplinary`, {
          ...form,
          incidentDate: form.incidentDate || undefined,
        }),
      );
      toast.success("Incident logged.");
      setOpen(false);
      setForm({ severity: "minor", category: "general", description: "", actionTaken: "", incidentDate: "" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const toggleResolve = (r: any) =>
    run(() =>
      apiPatch<StudentProfile>(`/students/${studentId}/profile/disciplinary/${r.id}`, {
        status: r.status === "open" ? "resolved" : "open",
      }),
    ).catch((e) => toast.error(e instanceof Error ? e.message : "Failed"));

  const remove = async (r: any) => {
    if (!(await confirm({ title: "Remove incident?", description: r.description, confirmText: "Remove", destructive: true })))
      return;
    run(() => apiDelete<StudentProfile>(`/students/${studentId}/profile/disciplinary/${r.id}`))
      .then(() => toast.success("Removed."))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed"));
  };

  const t = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Card className="rounded-2xl overflow-hidden">
      <div className="p-4 flex items-center justify-between border-b">
        <div className="flex items-center gap-2 font-display font-semibold">
          <ShieldAlert className="size-4 text-primary" /> Disciplinary record
        </div>
        {data?.canEdit && (
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="size-4" /> Log incident
          </Button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-secondary text-muted-foreground text-left">
            <tr>
              <th className="p-3 font-medium">Date</th>
              <th className="p-3 font-medium">Category</th>
              <th className="p-3 font-medium">Severity</th>
              <th className="p-3 font-medium">Description</th>
              <th className="p-3 font-medium">Action taken</th>
              <th className="p-3 font-medium">Status</th>
              {data?.canEdit && <th className="p-3" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t align-top">
                <td className="p-3 text-muted-foreground whitespace-nowrap">{fmtDate(r.incidentDate)}</td>
                <td className="p-3 capitalize">{r.category}</td>
                <td className="p-3">{severityBadge(r.severity)}</td>
                <td className="p-3">{r.description}</td>
                <td className="p-3 text-muted-foreground">{r.actionTaken || "—"}</td>
                <td className="p-3">
                  {r.status === "resolved" ? (
                    <Badge className="bg-emerald-100 text-emerald-700 border-0">Resolved</Badge>
                  ) : (
                    <Badge className="bg-amber-100 text-amber-700 border-0">Open</Badge>
                  )}
                </td>
                {data?.canEdit && (
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleResolve(r)}
                        title={r.status === "open" ? "Mark resolved" : "Reopen"}
                      >
                        <CheckCircle2 className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => remove(r)}
                        aria-label="Remove incident"
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={data?.canEdit ? 7 : 6} className="p-8 text-center text-muted-foreground">
                  No disciplinary incidents on record. A clean slate.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Log disciplinary incident</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TabField label="Incident date" htmlFor="d-date">
              <Input id="d-date" type="date" value={form.incidentDate} onChange={t("incidentDate")} />
            </TabField>
            <TabField label="Category" htmlFor="d-cat">
              <Input id="d-cat" value={form.category} onChange={t("category")} placeholder="e.g. attendance" />
            </TabField>
            <TabField label="Severity" htmlFor="d-sev">
              <Select
                value={form.severity}
                onValueChange={(v) => setForm((f) => ({ ...f, severity: v }))}
              >
                <SelectTrigger id="d-sev">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="minor">Minor</SelectItem>
                  <SelectItem value="moderate">Moderate</SelectItem>
                  <SelectItem value="major">Major</SelectItem>
                </SelectContent>
              </Select>
            </TabField>
            <TabField label="Description" htmlFor="d-desc" full>
              <Textarea id="d-desc" value={form.description} onChange={t("description")} />
            </TabField>
            <TabField label="Action taken" htmlFor="d-action" full>
              <Textarea id="d-action" value={form.actionTaken} onChange={t("actionTaken")} />
            </TabField>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={add} disabled={busy}>
              {busy ? "Saving…" : "Log incident"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ======================================================= DOCUMENTS TAB ===

const DOC_TYPES = [
  "birth_certificate",
  "transfer_certificate",
  "report_card",
  "id_proof",
  "medical_record",
  "photo",
  "other",
];

export function DocumentsTab({ studentId }: { studentId: string }) {
  const { data } = useStudentProfile(studentId);
  const run = useProfileMutation(studentId);
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({
    docType: "other",
    title: "",
    fileUrl: "",
    issuedDate: "",
    expiryDate: "",
    verified: false,
  });
  const [busy, setBusy] = useState(false);
  const rows = data?.documents ?? [];

  const add = async () => {
    if (!form.title.trim()) return toast.error("Title is required.");
    setBusy(true);
    try {
      await run(() =>
        apiPost<StudentProfile>(`/students/${studentId}/profile/documents`, {
          ...form,
          issuedDate: form.issuedDate || undefined,
          expiryDate: form.expiryDate || undefined,
          fileUrl: form.fileUrl || undefined,
        }),
      );
      toast.success("Document added.");
      setOpen(false);
      setForm({ docType: "other", title: "", fileUrl: "", issuedDate: "", expiryDate: "", verified: false });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const toggleVerify = (r: any) =>
    run(() =>
      apiPatch<StudentProfile>(`/students/${studentId}/profile/documents/${r.id}`, {
        verified: !r.verified,
      }),
    ).catch((e) => toast.error(e instanceof Error ? e.message : "Failed"));

  const remove = async (r: any) => {
    if (!(await confirm({ title: "Remove document?", description: r.title, confirmText: "Remove", destructive: true })))
      return;
    run(() => apiDelete<StudentProfile>(`/students/${studentId}/profile/documents/${r.id}`))
      .then(() => toast.success("Removed."))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed"));
  };

  const t = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Card className="rounded-2xl overflow-hidden">
      <div className="p-4 flex items-center justify-between border-b">
        <div className="flex items-center gap-2 font-display font-semibold">
          <FileText className="size-4 text-primary" /> Documents
        </div>
        {data?.canEdit && (
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="size-4" /> Add document
          </Button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-secondary text-muted-foreground text-left">
            <tr>
              <th className="p-3 font-medium">Title</th>
              <th className="p-3 font-medium">Type</th>
              <th className="p-3 font-medium">Issued</th>
              <th className="p-3 font-medium">Expiry</th>
              <th className="p-3 font-medium">Status</th>
              {data?.canEdit && <th className="p-3" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-3 font-medium">
                  {r.fileUrl ? (
                    <a
                      href={r.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 hover:underline"
                    >
                      {r.title} <ExternalLink className="size-3" />
                    </a>
                  ) : (
                    r.title
                  )}
                </td>
                <td className="p-3 capitalize text-muted-foreground">
                  {(r.docType || "").replace(/_/g, " ")}
                </td>
                <td className="p-3 text-muted-foreground">{fmtDate(r.issuedDate)}</td>
                <td className="p-3 text-muted-foreground">{fmtDate(r.expiryDate)}</td>
                <td className="p-3">
                  {r.verified ? (
                    <Badge className="bg-emerald-100 text-emerald-700 border-0">Verified</Badge>
                  ) : (
                    <Badge className="bg-muted text-muted-foreground border-0">Unverified</Badge>
                  )}
                </td>
                {data?.canEdit && (
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleVerify(r)}
                        title={r.verified ? "Mark unverified" : "Mark verified"}
                      >
                        <CheckCircle2 className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => remove(r)}
                        aria-label="Remove document"
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={data?.canEdit ? 6 : 5} className="p-8 text-center text-muted-foreground">
                  No documents uploaded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Add document</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TabField label="Title" htmlFor="doc-title" full>
              <Input id="doc-title" value={form.title} onChange={t("title")} />
            </TabField>
            <TabField label="Type" htmlFor="doc-type">
              <Select value={form.docType} onValueChange={(v) => setForm((f) => ({ ...f, docType: v }))}>
                <SelectTrigger id="doc-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map((d) => (
                    <SelectItem key={d} value={d} className="capitalize">
                      {d.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </TabField>
            <TabField label="File URL" htmlFor="doc-url">
              <Input id="doc-url" value={form.fileUrl} onChange={t("fileUrl")} placeholder="https://…" />
            </TabField>
            <TabField label="Issued date" htmlFor="doc-issued">
              <Input id="doc-issued" type="date" value={form.issuedDate} onChange={t("issuedDate")} />
            </TabField>
            <TabField label="Expiry date" htmlFor="doc-expiry">
              <Input id="doc-expiry" type="date" value={form.expiryDate} onChange={t("expiryDate")} />
            </TabField>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <Checkbox
                checked={!!form.verified}
                onCheckedChange={(v) => setForm((f) => ({ ...f, verified: !!v }))}
              />
              Mark as verified
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={add} disabled={busy}>
              {busy ? "Saving…" : "Add document"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ======================================================== ACTIVITY TAB ===

export function ActivityTab({ studentId }: { studentId: string }) {
  const { data } = useStudentProfile(studentId);
  const rows = data?.activity ?? [];
  return (
    <Card className="rounded-2xl p-6">
      <div className="flex items-center gap-2 font-display font-semibold mb-4">
        <History className="size-4 text-primary" /> Activity log
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
      ) : (
        <ol className="relative border-l pl-6 space-y-4">
          {rows.map((r) => (
            <li key={r.id} className="relative">
              <span className="absolute -left-[27px] top-1 size-3 rounded-full bg-primary" />
              <div className="text-sm font-medium">{r.description}</div>
              <div className="text-xs text-muted-foreground">
                {fmtDateTime(r.createdAt)}
                {r.actor ? ` · ${r.actor}` : ""}
                {r.eventType ? ` · ${r.eventType.replace(/_/g, " ")}` : ""}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

// ======================================================= TRANSPORT TAB ===

export function TransportTab({ studentId }: { studentId: string }) {
  const { data: assignment } = useQuery({
    queryKey: ["child-transport", studentId],
    queryFn: () => apiGet<any>(`/students/${studentId}/transport`),
  });
  return (
    <Card className="rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 font-display font-semibold">
          <Bus className="size-4 text-primary" /> Transport
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/children/$studentId/transport" params={{ studentId }}>
            Live tracking <ExternalLink className="size-3.5" />
          </Link>
        </Button>
      </div>
      {!assignment ? (
        <p className="text-sm text-muted-foreground">
          Not assigned to any transport route. Uses own arrangement.
        </p>
      ) : (
        <DL
          items={[
            ["Route", assignment.route?.name],
            [
              "Bus",
              assignment.route?.vehicle?.registration_no
                ? `${assignment.route.vehicle.registration_no}${assignment.route.vehicle.model ? ` · ${assignment.route.vehicle.model}` : ""}`
                : null,
            ],
            ["Driver", assignment.route?.driver?.full_name],
            ["Driver phone", assignment.route?.driver?.phone],
            ["Pickup stop", assignment.stop?.name],
            ["Pickup time", assignment.pickup_time],
            ["Drop time", assignment.drop_time],
          ]}
        />
      )}
    </Card>
  );
}

// =============================================== ADMISSION SUMMARY CARD ===

/** Compact admission-details card for the Overview area. */
export function AdmissionDetailsCard({ studentId }: { studentId: string }) {
  const { data } = useStudentProfile(studentId);
  const a = data?.admission;
  const notes = data?.progressNotes ?? [];
  const recentNote = notes[0];
  const items = useMemo(() => {
    if (!a) return null;
    return [
      ["Admission #", a.admissionNo],
      ["Academic year", a.academicYear],
      ["Previous school", a.previousSchool],
      ["Admitted on", fmtDate(a.admittedAt)],
    ] as [string, ReactNode][];
  }, [a]);

  if (!a && !recentNote) return null;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
      {a && items && (
        <Card className="rounded-2xl p-5">
          <div className="font-display font-semibold mb-3">Admission details</div>
          <DL items={items} />
        </Card>
      )}
      {recentNote && (
        <Card className="rounded-2xl p-5">
          <div className="font-display font-semibold mb-2">Latest progress note</div>
          <p className="text-sm">{recentNote.note}</p>
          <div className="text-xs text-muted-foreground mt-2">
            {fmtDate(recentNote.noteDate)}
            {recentNote.teacher ? ` · ${recentNote.teacher}` : ""}
          </div>
        </Card>
      )}
    </div>
  );
}

// ======================================================= TIMETABLE TAB ===

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type TimetableRow = {
  id: string;
  dayOfWeek: number;
  startTime: string | null;
  endTime: string | null;
  room: string | null;
  subjectName: string | null;
  teacherName: string | null;
};

/** A child's weekly class timetable — the parent-portal view of /timetable. */
export function ClassTimetableTab({ studentId }: { studentId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["student-timetable", studentId],
    queryFn: () => apiGet<TimetableRow[]>(`/students/${studentId}/timetable`),
  });
  const rows = data ?? [];
  const byDay = useMemo(() => {
    const m = new Map<number, TimetableRow[]>();
    for (const r of rows) {
      const arr = m.get(r.dayOfWeek) ?? [];
      arr.push(r);
      m.set(r.dayOfWeek, arr);
    }
    return m;
  }, [rows]);

  if (isLoading) {
    return <Card className="rounded-2xl p-6 text-sm text-muted-foreground">Loading timetable…</Card>;
  }
  if (rows.length === 0) {
    return (
      <Card className="rounded-2xl p-6 text-sm text-muted-foreground">
        No timetable is published for this class yet.
      </Card>
    );
  }
  return (
    <div>
      <div className="flex items-center gap-2 font-display font-semibold mb-4">
        <CalendarDays className="size-4 text-primary" /> Weekly timetable
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((d) => {
          const periods = byDay.get(d) ?? [];
          if (periods.length === 0) return null;
          return (
            <Card key={d} className="rounded-2xl p-5">
              <div className="font-display font-semibold mb-3">{DAY_NAMES[d]}</div>
              <ul className="space-y-2">
                {periods.map((p) => (
                  <li key={p.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-sm">{p.subjectName ?? "—"}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1 whitespace-nowrap">
                        <Clock className="size-3" />
                        {p.startTime ?? "—"}
                        {p.endTime ? `–${p.endTime}` : ""}
                      </div>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground flex flex-wrap gap-x-3">
                      {p.teacherName && <span>{p.teacherName}</span>}
                      {p.room && <span>{/^room/i.test(p.room) ? p.room : `Room ${p.room}`}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ========================================================= NOTICES TAB ===

type Notice = {
  id: string;
  title: string;
  body: string;
  audience: string;
  className: string | null;
  author: string | null;
  createdAt: string;
};

function noticeBadge(audience: string, className: string | null) {
  if (audience === "class")
    return (
      <Badge className="bg-indigo-100 text-indigo-700 border-0">{className ?? "Class"}</Badge>
    );
  if (audience === "parents")
    return <Badge className="bg-emerald-100 text-emerald-700 border-0">Parents</Badge>;
  return <Badge className="bg-sky-100 text-sky-700 border-0">School-wide</Badge>;
}

// ============================================ SIS STAT STRIP + SIDEBAR ===

/** The reference header: 4 stat cards + QR/barcode + action buttons. */
export function SisProfilePanel({ studentId }: { studentId: string }) {
  const { data } = useSisProfile(studentId);
  const [busy, setBusy] = useState<string | null>(null);
  const [pass, setPass] = useState<{ label: string; value: string } | null>(null);
  if (!data) return null;
  const fee = data.feeSummary ?? { total: 0, paid: 0, balance: 0 };
  const behavior = data.behavior ?? { score: 0 };
  const admissionNo = data.header?.admissionNo ?? "";

  const sendPass = async (target: "student" | "parent") => {
    setBusy(target);
    try {
      const res = await apiPost<any>(`/students/${studentId}/profile/send-pass`, { target });
      setPass({ label: `${target === "student" ? "Student" : "Parent"} temp password`, value: res.tempPassword });
      toast.success(`${target === "student" ? "Student" : "Parent"} pass sent.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard tone="indigo" icon={<Wallet className="size-4" />} label="Total Fees" value={inr(fee.total)} />
        <StatCard tone="emerald" icon={<CheckCircle2 className="size-4" />} label="Amount Paid" value={inr(fee.paid)} />
        <StatCard
          tone={fee.balance > 0 ? "red" : "emerald"}
          icon={<Wallet className="size-4" />}
          label="Balance Due"
          value={inr(fee.balance)}
        />
        <StatCard
          tone={behavior.score < 0 ? "red" : "amber"}
          icon={<Star className="size-4" />}
          label="Behavior Score"
          value={`${behavior.score > 0 ? "+" : ""}${behavior.score}`}
        />
      </div>

      {admissionNo && (
        <Card className="rounded-2xl p-4 mb-4">
          <div className="flex flex-col lg:flex-row lg:items-center gap-4 justify-between">
            <div className="flex flex-wrap items-center gap-6">
              <div className="text-center">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">QR</div>
                <QRCodeSVG value={admissionNo} size={92} />
              </div>
              <div className="text-center">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Barcode</div>
                <Barcode value={admissionNo} height={48} width={1.4} fontSize={11} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => window.print()}>
                <Printer className="size-4" /> Print Profile
              </Button>
              {data.canEdit && (
                <>
                  <Button size="sm" variant="outline" disabled={busy === "student"} onClick={() => sendPass("student")}>
                    <KeyRound className="size-4" /> Send Student Pass
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy === "parent"} onClick={() => sendPass("parent")}>
                    <Mail className="size-4" /> Send Parent Pass
                  </Button>
                </>
              )}
              <Button asChild size="sm">
                <Link to="/fees">
                  <Wallet className="size-4" /> Collect Fees
                </Link>
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Dialog open={!!pass} onOpenChange={(o) => !o && setPass(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Pass sent</DialogTitle>
          </DialogHeader>
          {pass && (
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">
                Delivered to the portal inbox. The one-time password is shown here once — it is not
                stored.
              </p>
              <div className="flex items-center justify-between rounded-lg bg-muted/50 p-2.5">
                <div>
                  <div className="text-xs text-muted-foreground">{pass.label}</div>
                  <div className="font-mono">{pass.value}</div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    navigator.clipboard?.writeText(pass.value);
                    toast.success("Copied");
                  }}
                  aria-label="Copy password"
                >
                  <ExternalLink className="size-4" />
                </Button>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setPass(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function StatCard({
  tone,
  icon,
  label,
  value,
}: {
  tone: "indigo" | "emerald" | "red" | "amber";
  icon: ReactNode;
  label: string;
  value: string;
}) {
  const tones: Record<string, string> = {
    indigo: "from-indigo-500 to-indigo-600",
    emerald: "from-emerald-500 to-emerald-600",
    red: "from-rose-500 to-red-600",
    amber: "from-amber-500 to-orange-600",
  };
  return (
    <div className={`rounded-2xl p-4 text-white bg-gradient-to-br ${tones[tone]}`}>
      <div className="flex items-center gap-1.5 text-xs opacity-90">
        {icon}
        {label}
      </div>
      <div className="font-display text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}

// ========================================================= PROFILE TAB ===

/** Grouped Profile tab: academic, personal, contact, parents, health, bank, address. */
export function ProfileInfoTab({ studentId }: { studentId: string }) {
  const { data } = useSisProfile(studentId);
  if (!data) return <Card className="rounded-2xl p-6 text-sm text-muted-foreground">Loading…</Card>;
  const h = data.header ?? {};
  const d = data.details ?? {};
  const m = data.medical ?? {};
  const guardians = data.guardians ?? [];
  const father = guardians.find((g: any) => g.relationship === "father");
  const mother = guardians.find((g: any) => g.relationship === "mother");

  return (
    <div className="space-y-4">
      <Section title="Academic Information">
        <DL
          items={[
            ["Admission No", h.admissionNo],
            ["Roll Number", h.rollNo],
            ["Class", h.className],
            ["Admission Date", fmtDate(h.admissionDate)],
            ["Biometric ID", d.biometricId],
            ["Category", d.category],
            ["House", h.house],
            ["Academic Year", h.academicYear],
          ]}
        />
      </Section>
      <Section title="Personal Details">
        <DL
          items={[
            ["Date of Birth", fmtDate(d.dob)],
            ["Gender", h.gender],
            ["Nationality", d.nationality],
            ["Religion", d.religion],
            ["Caste", d.caste],
            ["Sub-Caste", d.subCaste],
            ["Mother Tongue", d.motherTongue],
            ["Place of Birth", d.placeOfBirth],
            ["Blood Group", h.bloodGroup],
            ["BPL", d.bpl ? "Yes" : "No"],
            ["RTE", d.rte ? "Yes" : "No"],
          ]}
        />
      </Section>
      <Section title="Contact & Identity">
        <DL
          items={[
            ["Student Email", d.studentEmail],
            ["Student Phone", d.studentPhone],
            ["Aadhaar / National ID", d.aadhaarNo],
            ["PEN / SSSM ID", d.penSssmId],
          ]}
        />
      </Section>
      <Section title="Parent & Guardian Details">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <GuardianCard title="Father Details" g={father} color="text-blue-600" />
          <GuardianCard title="Mother Details" g={mother} color="text-pink-600" />
        </div>
        {guardians.length === 0 && (
          <p className="text-sm text-muted-foreground">No guardians linked.</p>
        )}
      </Section>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="Health & Medical">
          <DL
            items={[
              ["Height", m.heightCm ? `${m.heightCm} cm` : null],
              ["Weight", m.weightKg ? `${m.weightKg} kg` : null],
              ["Allergies / History", m.allergies],
              ["Emergency Contact", m.emergencyContactName],
              ["Emergency Phone", m.emergencyContactPhone],
            ]}
          />
        </Section>
        <Section title="Bank Details">
          <DL
            items={[
              ["Bank Name", d.bankName],
              ["Account Number", d.bankAccount],
              ["IFSC Code", d.bankIfsc],
              ["Opening Due Balance", d.openingDueBalance != null ? inr(d.openingDueBalance) : null],
            ]}
          />
        </Section>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="Address">
          <DL
            items={[
              ["Current", d.currentAddress],
              ["Permanent", d.permanentAddress],
            ]}
          />
        </Section>
        <Section title="Previous School">
          <p className="text-sm">{d.previousSchool || "—"}</p>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="rounded-2xl p-5">
      <div className="font-display font-semibold mb-3">{title}</div>
      {children}
    </Card>
  );
}

function GuardianCard({ title, g, color }: { title: string; g: any; color: string }) {
  return (
    <div className="rounded-xl border p-4">
      <div className={`font-medium mb-2 ${color}`}>{title}</div>
      {g ? (
        <DL
          items={[
            ["Name", g.name],
            ["Phone", g.phone],
            ["Occupation", g.occupation],
            ["Qualification", g.qualification],
            ["Aadhaar", g.aadhaar],
            ["Annual Income", g.annualIncome != null ? inr(g.annualIncome) : null],
          ]}
        />
      ) : (
        <p className="text-sm text-muted-foreground">Not recorded.</p>
      )}
    </div>
  );
}

// ======================================================== SIBLINGS TAB ===

export function SiblingsTab({ studentId }: { studentId: string }) {
  const { data } = useSisProfile(studentId);
  const siblings = data?.siblings ?? [];
  return (
    <Card className="rounded-2xl p-6">
      <div className="flex items-center gap-2 font-display font-semibold mb-4">
        <Users className="size-4 text-primary" /> Sibling Information
        {siblings.length > 0 && <Badge className="bg-primary/10 text-primary">{siblings.length}</Badge>}
      </div>
      {siblings.length === 0 ? (
        <p className="text-sm text-muted-foreground">No siblings found for this student's guardians.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {siblings.map((s: any) => (
            <Card key={s.studentId} className="rounded-2xl overflow-hidden">
              <div className="p-4 bg-muted/40 flex items-center gap-3">
                <div className="size-11 rounded-full bg-primary/10 text-primary grid place-items-center font-semibold">
                  {(s.name ?? "?")
                    .split(" ")
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((x: string) => x[0]?.toUpperCase())
                    .join("")}
                </div>
                <div className="min-w-0">
                  <div className="font-medium truncate">{s.name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{s.className ?? "—"}</div>
                </div>
              </div>
              <div className="p-4 space-y-1.5 text-sm">
                <Row k="Admission No" v={s.admissionNo} />
                <Row k="Roll No" v={s.rollNo} />
                <Row k="Gender" v={s.gender} />
                <Row
                  k="Status"
                  v={
                    <Badge className={s.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}>
                      {s.status}
                    </Badge>
                  }
                />
              </div>
              <div className="p-4 pt-0">
                <Button asChild size="sm" className="w-full">
                  <Link to="/children/$studentId" params={{ studentId: s.studentId }}>
                    <ExternalLink className="size-3.5" /> View Profile
                  </Link>
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </Card>
  );
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium capitalize">{v ?? "—"}</span>
    </div>
  );
}

// ===================================================== CREDENTIALS TAB ===

export function CredentialsTab({ studentId }: { studentId: string }) {
  const { data } = useSisProfile(studentId);
  const [busy, setBusy] = useState<string | null>(null);
  const [pass, setPass] = useState<{ label: string; value: string } | null>(null);
  const c = data?.credentials ?? {};
  const canEdit = !!data?.canEdit;

  const regen = async (target: "student" | "parent") => {
    setBusy(target);
    try {
      const res = await apiPost<any>(`/students/${studentId}/profile/send-pass`, { target });
      setPass({ label: `New ${target} password`, value: res.tempPassword });
      toast.success("Password regenerated and sent.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="rounded-2xl p-6">
      <div className="flex items-center gap-2 font-display font-semibold">
        <IdCard className="size-4 text-primary" /> Portal Login Credentials
      </div>
      <p className="text-sm text-muted-foreground mt-1 mb-4">
        Auto-generated credentials. Passwords are never stored — regenerate to set a new one.
      </p>
      <div className="space-y-3">
        <CredCard
          accent="border-l-sky-500"
          title="Student Login"
          username={c.studentUsername}
          canEdit={canEdit}
          busy={busy === "student"}
          onRegen={() => regen("student")}
        />
        <CredCard
          accent="border-l-emerald-500"
          title="Parent Login"
          username={c.parentUsername}
          canEdit={canEdit}
          busy={busy === "parent"}
          onRegen={() => regen("parent")}
        />
      </div>

      <Dialog open={!!pass} onOpenChange={(o) => !o && setPass(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New password</DialogTitle>
          </DialogHeader>
          {pass && (
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">Shown once and delivered to the portal inbox.</p>
              <div className="flex items-center justify-between rounded-lg bg-muted/50 p-2.5">
                <div>
                  <div className="text-xs text-muted-foreground">{pass.label}</div>
                  <div className="font-mono">{pass.value}</div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    navigator.clipboard?.writeText(pass.value);
                    toast.success("Copied");
                  }}
                  aria-label="Copy password"
                >
                  <ExternalLink className="size-4" />
                </Button>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setPass(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function CredCard({
  accent,
  title,
  username,
  canEdit,
  busy,
  onRegen,
}: {
  accent: string;
  title: string;
  username?: string | null;
  canEdit: boolean;
  busy: boolean;
  onRegen: () => void;
}) {
  return (
    <div className={`rounded-xl border border-l-4 ${accent} p-4`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-medium">{title}</div>
          <div className="text-sm mt-1">
            <span className="text-muted-foreground">Username: </span>
            <span className="font-medium">{username ?? "—"}</span>
          </div>
          <div className="text-xs text-destructive mt-1">
            Password is not stored for security. Click "Regenerate" to set a new one.
          </div>
        </div>
        {canEdit && username && (
          <Button size="sm" variant="outline" onClick={onRegen} disabled={busy}>
            <KeyRound className="size-4" /> {busy ? "…" : "Regenerate Password"}
          </Button>
        )}
      </div>
    </div>
  );
}

// ======================================================== BEHAVIOR TAB ===

export function BehaviorTab({ studentId }: { studentId: string }) {
  const { data } = useSisProfile(studentId);
  const b = data?.behavior ?? { score: 0, positive: 0, neutral: 0, concern: 0, notes: [] };
  const toneBadge = (t: string) => {
    if (t === "positive") return <Badge className="bg-emerald-100 text-emerald-700 border-0">Positive</Badge>;
    if (t === "concern" || t === "needs_improvement")
      return <Badge className="bg-red-100 text-red-700 border-0">Concern</Badge>;
    return <Badge className="bg-muted text-muted-foreground border-0">Neutral</Badge>;
  };
  return (
    <div className="space-y-4">
      <Card className="rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 font-display font-semibold">
              <Star className="size-4 text-primary" /> Behavior Score
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Each positive note = +1, each concern = −1, neutral = 0.
            </p>
          </div>
          <div className={`font-display text-4xl font-semibold ${b.score < 0 ? "text-red-600" : "text-emerald-600"}`}>
            {b.score > 0 ? "+" : ""}
            {b.score}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3 text-center text-sm">
          <div className="rounded-xl bg-emerald-50 p-3">
            <ThumbsUp className="size-4 mx-auto text-emerald-600" />
            <div className="font-semibold text-lg text-emerald-700">{b.positive}</div>
            <div className="text-xs text-emerald-700">Positive</div>
          </div>
          <div className="rounded-xl bg-muted/50 p-3">
            <div className="font-semibold text-lg">{b.neutral}</div>
            <div className="text-xs text-muted-foreground">Neutral</div>
          </div>
          <div className="rounded-xl bg-red-50 p-3">
            <ThumbsDown className="size-4 mx-auto text-red-600" />
            <div className="font-semibold text-lg text-red-700">{b.concern}</div>
            <div className="text-xs text-red-700">Concern</div>
          </div>
        </div>
      </Card>
      <Card className="rounded-2xl overflow-hidden">
        <div className="p-4 border-b font-medium text-sm">Behavior notes</div>
        {(b.notes ?? []).length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">No behavior notes yet.</div>
        ) : (
          <ul className="divide-y">
            {b.notes.map((n: any) => (
              <li key={n.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm">{n.note}</p>
                  {toneBadge(n.tone)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {fmtDate(n.date)}
                  {n.teacher ? ` · ${n.teacher}` : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/** Per-child notices feed: school-wide + parent + this child's class notices. */
export function NoticesTab({ studentId }: { studentId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["student-notices", studentId],
    queryFn: () => apiGet<Notice[]>(`/students/${studentId}/notices`),
  });
  const rows = data ?? [];
  return (
    <Card className="rounded-2xl p-6">
      <div className="flex items-center gap-2 font-display font-semibold mb-4">
        <Megaphone className="size-4 text-primary" /> Notices
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading notices…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No notices for this student right now.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((n) => (
            <li key={n.id} className="rounded-xl border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="font-medium">{n.title}</div>
                {noticeBadge(n.audience, n.className)}
              </div>
              <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{n.body}</p>
              <div className="text-xs text-muted-foreground mt-2">
                {fmtDateTime(n.createdAt)}
                {n.author ? ` · ${n.author}` : ""}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
