import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/lib/api/client";
import { AppShell, PageHeader } from "@/components/app-shell";
import { RequireRole } from "@/components/require-role";
import { useConfirm } from "@/components/confirm-dialog";
import { useCurrentUser } from "@/hooks/use-current-user";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { badgeClass, fmtDate, money, niceLabel, downloadCsv } from "@/lib/module-util";
import {
  Download,
  Printer,
  Mail,
  Phone,
  Pencil,
  Plus,
  Trash2,
  IdCard,
  KeyRound,
  RefreshCw,
  Send,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/_authenticated/teachers/$teacherId")({
  component: () => (
    <RequireRole roles={["admin", "hr"]}>
      <TeacherDetailPage />
    </RequireRole>
  ),
});

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS = [1, 2, 3, 4, 5];

function initials(name?: string | null) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground truncate">{label}</div>
      <div className="font-medium break-words">{value ?? "—"}</div>
    </div>
  );
}

function Empty({ colSpan, msg }: { colSpan: number; msg: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="p-6 text-center text-muted-foreground text-sm">
        {msg}
      </td>
    </tr>
  );
}

/* ---------------------------- generic form dialog ---------------------------- */
type FieldSpec = {
  name: string;
  label: string;
  kind?: "text" | "number" | "date" | "textarea" | "select";
  options?: { value: string; label: string }[];
  required?: boolean;
  placeholder?: string;
  full?: boolean;
};

function RecordFormDialog({
  open,
  onOpenChange,
  title,
  fields,
  initial,
  submitLabel,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  fields: FieldSpec[];
  initial?: Record<string, string>;
  submitLabel?: string;
  onSubmit: (values: Record<string, string>) => Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, string>>(initial ?? {});
  const [saving, setSaving] = useState(false);
  // Reset when reopened with new initial values.
  const key = open ? JSON.stringify(initial ?? {}) : "";
  const [seenKey, setSeenKey] = useState("");
  if (open && key !== seenKey) {
    setValues(initial ?? {});
    setSeenKey(key);
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSubmit(values);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {fields.map((f) => {
            const fid = `fld-${f.name}`;
            return (
              <div key={f.name} className={`space-y-1.5 ${f.full ? "sm:col-span-2" : ""}`}>
                <Label htmlFor={fid}>{f.label}</Label>
                {f.kind === "textarea" ? (
                  <Textarea
                    id={fid}
                    value={values[f.name] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                    placeholder={f.placeholder}
                  />
                ) : f.kind === "select" ? (
                  <Select
                    value={values[f.name] ?? ""}
                    onValueChange={(val) => setValues((v) => ({ ...v, [f.name]: val }))}
                  >
                    <SelectTrigger id={fid} aria-label={f.label}>
                      <SelectValue placeholder="Select…" />
                    </SelectTrigger>
                    <SelectContent>
                      {(f.options ?? []).map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id={fid}
                    type={f.kind === "number" ? "number" : f.kind === "date" ? "date" : "text"}
                    value={values[f.name] ?? ""}
                    required={f.required}
                    placeholder={f.placeholder}
                    onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                  />
                )}
              </div>
            );
          })}
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : (submitLabel ?? "Save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------- generic collection (CRUD) ------------------------- */
function CollectionCard<T extends { id: string }>({
  title,
  teacherId,
  path,
  rows,
  columns,
  addTitle,
  addFields,
  mapAdd,
  canManage,
  emptyMsg,
  onChanged,
}: {
  title: string;
  teacherId: string;
  path: string; // e.g. "qualifications"
  rows: T[];
  columns: { header: string; cell: (row: T) => React.ReactNode }[];
  addTitle: string;
  addFields: FieldSpec[];
  mapAdd: (v: Record<string, string>) => Record<string, unknown>;
  canManage: boolean;
  emptyMsg: string;
  onChanged: () => void;
}) {
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);

  const del = async (row: T) => {
    if (
      !(await confirm({
        title: `Remove this ${title.toLowerCase()} entry?`,
        destructive: true,
        confirmText: "Remove",
      }))
    )
      return;
    try {
      await apiDelete(`/teachers/${teacherId}/${path}/${row.id}`);
      toast.success("Removed.");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Remove failed");
    }
  };

  return (
    <Card className="rounded-2xl overflow-hidden">
      <div className="p-4 border-b flex items-center justify-between">
        <div className="font-medium text-sm">{title}</div>
        {canManage && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="size-4 mr-1" /> Add
          </Button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-muted/40">
            <tr className="text-left">
              {columns.map((c) => (
                <th key={c.header} className="p-3">
                  {c.header}
                </th>
              ))}
              {canManage && <th className="p-3 w-10" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t">
                {columns.map((c) => (
                  <td key={c.header} className="p-3 align-top">
                    {c.cell(row)}
                  </td>
                ))}
                {canManage && (
                  <td className="p-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Remove entry"
                      className="text-destructive hover:text-destructive"
                      onClick={() => del(row)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <Empty colSpan={columns.length + (canManage ? 1 : 0)} msg={emptyMsg} />
            )}
          </tbody>
        </table>
      </div>
      <RecordFormDialog
        open={adding}
        onOpenChange={setAdding}
        title={addTitle}
        fields={addFields}
        submitLabel="Add"
        onSubmit={async (v) => {
          await apiPost(`/teachers/${teacherId}/${path}`, mapAdd(v));
          toast.success("Added.");
          onChanged();
        }}
      />
    </Card>
  );
}

function TeacherDetailPage() {
  const { teacherId } = Route.useParams();
  const qc = useQueryClient();
  const { user } = useCurrentUser();
  const canManage = !!user?.roles.some((r) => r === "admin" || r === "hr");

  const { data: detail } = useQuery({
    queryKey: ["teacher-detail", teacherId],
    queryFn: () => apiGet<any>(`/teachers/${teacherId}/detail`),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["teacher-detail", teacherId] });

  const teacher = detail?.teacher ?? null;
  const staff = detail?.staff ?? null;
  const qualifications = (detail?.qualifications ?? []) as any[];
  const experience = (detail?.experience ?? []) as any[];
  const classes = (detail?.classes ?? []) as any[];
  const attendance = (detail?.attendance ?? []) as any[];
  const reviews = (detail?.reviews ?? []) as any[];
  const payroll = (detail?.payroll ?? []) as any[];
  const leaves = (detail?.leaves ?? []) as any[];
  const docs = (detail?.docs ?? []) as any[];
  const history = (detail?.history ?? []) as any[];
  const assets = (detail?.assets ?? []) as any[];
  const training = (detail?.training ?? []) as any[];

  const [editCore, setEditCore] = useState(false);
  const [editPersonal, setEditPersonal] = useState(false);
  const [editEmployment, setEditEmployment] = useState(false);
  const [editBank, setEditBank] = useState(false);

  const patchStaff = async (body: Record<string, unknown>) => {
    await apiPatch(`/teachers/${teacherId}/staff`, body);
    toast.success("Saved.");
    invalidate();
  };

  if (!teacher) {
    return (
      <AppShell>
        <div className="p-8 text-sm text-muted-foreground">Loading teacher…</div>
      </AppShell>
    );
  }

  const attStats = (() => {
    const list = attendance ?? [];
    const total = list.length || 1;
    const p = list.filter((a: any) => a.status === "present").length;
    const a = list.filter((a: any) => a.status === "absent").length;
    const l = list.filter((a: any) => a.status === "late").length;
    return { p, a, l, pct: Math.round((p / total) * 100) };
  })();

  const leaveBalance = (() => {
    const list = leaves ?? [];
    const approved = list.filter((l: any) => l.status === "approved");
    const used = approved.reduce((s: number, l: any) => s + (l.days ?? 0), 0);
    const pending = list.filter((l: any) => l.status === "pending").length;
    return { used, pending, total: 24, remaining: Math.max(0, 24 - used) };
  })();

  return (
    <AppShell>
      <div className="mb-4">
        <Link to="/teachers" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to teachers
        </Link>
      </div>
      <PageHeader
        title={teacher.full_name}
        subtitle={`${staff?.designation ?? "Teacher"} · ${staff?.department ?? teacher.subject} · ${staff?.employee_code ?? teacher.id.slice(0, 8)}`}
        action={
          <div className="flex items-center gap-2">
            <Badge className={badgeClass(teacher.status)}>{niceLabel(teacher.status)}</Badge>
            {canManage && (
              <Button size="sm" variant="outline" onClick={() => setEditCore(true)}>
                <Pencil className="size-4 mr-1" /> Edit
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => window.print()}>
              <Printer className="size-4 mr-1" /> Print
            </Button>
          </div>
        }
      />

      {/* Overview header card */}
      <Card className="rounded-2xl p-4 sm:p-6 mb-6 flex flex-col md:flex-row gap-6">
        <div className="flex items-center gap-4 min-w-0">
          {staff?.photo_url ? (
            <img
              src={staff.photo_url}
              alt={teacher.full_name}
              className="size-20 sm:size-24 rounded-2xl object-cover shrink-0"
            />
          ) : (
            <div className="size-20 sm:size-24 shrink-0 rounded-2xl bg-primary/10 text-primary grid place-items-center text-2xl font-semibold">
              {initials(teacher.full_name)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-lg font-semibold truncate">{teacher.full_name}</div>
            <div className="text-sm text-muted-foreground truncate">
              {staff?.designation ?? "Teacher"}
            </div>
            <div className="text-xs text-muted-foreground mt-1 truncate">
              Code · {staff?.employee_code ?? teacher.id.slice(0, 8)}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 min-w-0 max-w-full">
                <Mail className="size-3 shrink-0" />{" "}
                <span className="truncate">{teacher.email}</span>
              </span>
              {teacher.phone && (
                <span className="inline-flex items-center gap-1 shrink-0">
                  <Phone className="size-3" /> {teacher.phone}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 flex-1 min-w-0 text-sm">
          <Field label="Subject" value={<Badge variant="secondary">{teacher.subject}</Badge>} />
          <Field label="Experience" value={`${teacher.experience_years} yrs`} />
          <Field label="Joined" value={fmtDate(teacher.joined_date)} />
          <Field label="Qualification" value={teacher.qualification} />
          <Field label="Classes" value={(classes ?? []).length} />
          <Field label="Attendance" value={`${attStats.pct}%`} />
          <Field label="Leaves used" value={`${leaveBalance.used}/${leaveBalance.total}`} />
          <Field label="Rating" value={reviews?.[0]?.rating ? `${reviews[0].rating}/5` : "—"} />
        </div>
      </Card>

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="personal">Personal</TabsTrigger>
          <TabsTrigger value="employment">Employment</TabsTrigger>
          <TabsTrigger value="payroll">Payroll</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="leave">Leave</TabsTrigger>
          <TabsTrigger value="timetable">Timetable</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="assets">Assets</TabsTrigger>
          <TabsTrigger value="training">Training</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="pt-4">
          <Card className="p-6 rounded-2xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
            <Field label="Employee ID" value={staff?.employee_code ?? teacher.id.slice(0, 8)} />
            <Field label="Staff Code" value={teacher.id.slice(0, 8)} />
            <Field label="Full name" value={teacher.full_name} />
            <Field label="Designation" value={staff?.designation ?? "Teacher"} />
            <Field label="Department" value={staff?.department ?? "Academic"} />
            <Field label="Qualification" value={teacher.qualification} />
            <Field label="Experience" value={`${teacher.experience_years} yrs`} />
            <Field
              label="Employment status"
              value={
                <Badge className={badgeClass(teacher.status)}>{niceLabel(teacher.status)}</Badge>
              }
            />
            <Field label="Joining date" value={fmtDate(staff?.join_date ?? teacher.joined_date)} />
            <Field label="Email" value={teacher.email} />
            <Field label="Phone" value={teacher.phone ?? "—"} />
            <Field
              label="Reporting manager"
              value={staff?.reporting_manager_id ? "Assigned" : "—"}
            />
          </Card>
          {canManage && (
            <TeacherLoginCard
              teacherId={teacherId}
              credentials={detail?.credentials}
              onDone={invalidate}
            />
          )}
        </TabsContent>

        {/* PERSONAL */}
        <TabsContent value="personal" className="pt-4 space-y-4">
          <Card className="p-6 rounded-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="font-medium text-sm">Personal details</div>
              {canManage && (
                <Button size="sm" variant="outline" onClick={() => setEditPersonal(true)}>
                  <Pencil className="size-4 mr-1" /> Edit
                </Button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
              <Field label="Date of birth" value={fmtDate(staff?.dob)} />
              <Field label="Blood group" value={staff?.blood_group ?? "—"} />
              <Field label="Address" value={staff?.address ?? "—"} />
              <Field
                label="Emergency contact"
                value={
                  staff?.emergency_contact
                    ? `${(staff.emergency_contact as any).name ?? ""} · ${(staff.emergency_contact as any).phone ?? ""}`
                    : "—"
                }
              />
              <Field label="Medical info" value={(staff?.medical_info as any)?.notes ?? "—"} />
              <Field label="Skills" value={(staff?.skills ?? []).join(", ") || "—"} />
            </div>
          </Card>
        </TabsContent>

        {/* EMPLOYMENT */}
        <TabsContent value="employment" className="pt-4 space-y-4">
          <Card className="p-6 rounded-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="font-medium text-sm">Employment details</div>
              {canManage && (
                <Button size="sm" variant="outline" onClick={() => setEditEmployment(true)}>
                  <Pencil className="size-4 mr-1" /> Edit
                </Button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
              <Field label="Department" value={staff?.department ?? "—"} />
              <Field label="Designation" value={staff?.designation ?? "—"} />
              <Field
                label="Employment type"
                value={staff ? niceLabel(staff.employment_type) : "—"}
              />
              <Field
                label="Confirmation"
                value={staff ? niceLabel(staff.confirmation_status) : "—"}
              />
              <Field label="Probation end" value={fmtDate(staff?.probation_end_date)} />
              <Field label="Join date" value={fmtDate(staff?.join_date)} />
            </div>
          </Card>

          <CollectionCard
            title="Promotion & transfer history"
            teacherId={teacherId}
            path="history"
            rows={history}
            canManage={canManage}
            onChanged={invalidate}
            emptyMsg="No history records."
            columns={[
              { header: "Date", cell: (h: any) => fmtDate(h.effective_date) },
              { header: "Event", cell: (h: any) => niceLabel(h.event_type) },
              { header: "From", cell: (h: any) => h.from_value ?? "—" },
              { header: "To", cell: (h: any) => h.to_value ?? "—" },
              {
                header: "Notes",
                cell: (h: any) => (
                  <span className="text-xs text-muted-foreground">{h.notes ?? "—"}</span>
                ),
              },
            ]}
            addTitle="Add history record"
            addFields={[
              {
                name: "eventType",
                label: "Event",
                kind: "select",
                required: true,
                options: ["promotion", "transfer", "revised", "increment", "warning"].map((v) => ({
                  value: v,
                  label: niceLabel(v),
                })),
              },
              { name: "effectiveDate", label: "Effective date", kind: "date", required: true },
              { name: "fromValue", label: "From" },
              { name: "toValue", label: "To" },
              { name: "notes", label: "Notes", full: true },
            ]}
            mapAdd={(v) => ({
              eventType: v.eventType,
              effectiveDate: v.effectiveDate,
              fromValue: v.fromValue || undefined,
              toValue: v.toValue || undefined,
              notes: v.notes || undefined,
            })}
          />

          <CollectionCard
            title="Prior experience"
            teacherId={teacherId}
            path="experience"
            rows={experience}
            canManage={canManage}
            onChanged={invalidate}
            emptyMsg="No prior experience recorded."
            columns={[
              { header: "Employer", cell: (e: any) => e.employer },
              { header: "Role", cell: (e: any) => e.role ?? "—" },
              { header: "From", cell: (e: any) => fmtDate(e.start_date) },
              { header: "To", cell: (e: any) => fmtDate(e.end_date) },
            ]}
            addTitle="Add prior experience"
            addFields={[
              { name: "employer", label: "Employer", required: true },
              { name: "role", label: "Role" },
              { name: "startDate", label: "From", kind: "date" },
              { name: "endDate", label: "To", kind: "date" },
            ]}
            mapAdd={(v) => ({
              employer: v.employer,
              role: v.role || undefined,
              startDate: v.startDate || undefined,
              endDate: v.endDate || undefined,
            })}
          />

          <CollectionCard
            title="Qualifications"
            teacherId={teacherId}
            path="qualifications"
            rows={qualifications}
            canManage={canManage}
            onChanged={invalidate}
            emptyMsg="No qualifications recorded."
            columns={[
              { header: "Degree", cell: (q: any) => q.degree },
              { header: "Institution", cell: (q: any) => q.institution ?? "—" },
              { header: "Year", cell: (q: any) => q.year ?? "—" },
              { header: "Certification", cell: (q: any) => q.certification ?? "—" },
            ]}
            addTitle="Add qualification"
            addFields={[
              { name: "degree", label: "Degree", required: true },
              { name: "institution", label: "Institution" },
              { name: "year", label: "Year", kind: "number" },
              { name: "certification", label: "Certification" },
            ]}
            mapAdd={(v) => ({
              degree: v.degree,
              institution: v.institution || undefined,
              year: v.year ? Number(v.year) : undefined,
              certification: v.certification || undefined,
            })}
          />
        </TabsContent>

        {/* PAYROLL */}
        <TabsContent value="payroll" className="pt-4 space-y-4">
          <Card className="p-6 rounded-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="font-medium text-sm">Bank & latest pay</div>
              {canManage && (
                <Button size="sm" variant="outline" onClick={() => setEditBank(true)}>
                  <Pencil className="size-4 mr-1" /> Edit bank
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <Field label="Latest month" value={payroll?.[0] ? fmtDate(payroll[0].month) : "—"} />
              <Field label="Latest net" value={payroll?.[0] ? money(payroll[0].net_salary) : "—"} />
              <Field label="Bank" value={(staff?.bank_details as any)?.bank ?? "—"} />
              <Field label="Account" value={(staff?.bank_details as any)?.account ?? "—"} />
            </div>
          </Card>

          <CollectionCard
            title="Payroll history"
            teacherId={teacherId}
            path="payroll"
            rows={payroll}
            canManage={canManage}
            onChanged={invalidate}
            emptyMsg="No payroll records."
            columns={[
              { header: "Month", cell: (p: any) => fmtDate(p.month) },
              { header: "Base", cell: (p: any) => money(p.base_salary) },
              { header: "Allowances", cell: (p: any) => money(p.allowances) },
              { header: "Deductions", cell: (p: any) => money(p.deductions) },
              {
                header: "Net",
                cell: (p: any) => <span className="font-medium">{money(p.net_salary)}</span>,
              },
              {
                header: "Status",
                cell: (p: any) => (
                  <Badge className={badgeClass(p.status)}>{niceLabel(p.status)}</Badge>
                ),
              },
            ]}
            addTitle="Add / update payroll (by month)"
            addFields={[
              { name: "month", label: "Month", kind: "date", required: true },
              { name: "baseSalary", label: "Base salary", kind: "number", required: true },
              { name: "allowances", label: "Allowances", kind: "number" },
              { name: "deductions", label: "Deductions", kind: "number" },
              {
                name: "status",
                label: "Status",
                kind: "select",
                options: ["pending", "processed", "paid"].map((v) => ({
                  value: v,
                  label: niceLabel(v),
                })),
              },
              { name: "payDate", label: "Pay date", kind: "date" },
            ]}
            mapAdd={(v) => ({
              month: v.month,
              baseSalary: Number(v.baseSalary),
              allowances: v.allowances ? Number(v.allowances) : undefined,
              deductions: v.deductions ? Number(v.deductions) : undefined,
              status: v.status || undefined,
              payDate: v.payDate || undefined,
            })}
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={() => downloadCsv(payroll ?? [], `payroll-${teacher.full_name}`)}
            >
              <Download className="size-4 mr-1" /> Export CSV
            </Button>
          </div>
        </TabsContent>

        {/* ATTENDANCE (read-only — sourced from HR attendance) */}
        <TabsContent value="attendance" className="pt-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-5 rounded-2xl">
              <div className="text-2xl font-semibold text-emerald-600">{attStats.p}</div>
              <div className="text-xs text-muted-foreground">Present</div>
            </Card>
            <Card className="p-5 rounded-2xl">
              <div className="text-2xl font-semibold text-red-600">{attStats.a}</div>
              <div className="text-xs text-muted-foreground">Absent</div>
            </Card>
            <Card className="p-5 rounded-2xl">
              <div className="text-2xl font-semibold text-amber-600">{attStats.l}</div>
              <div className="text-xs text-muted-foreground">Late</div>
            </Card>
            <Card className="p-5 rounded-2xl">
              <div className="text-2xl font-semibold">{attStats.pct}%</div>
              <div className="text-xs text-muted-foreground">Attendance rate</div>
            </Card>
          </div>
          <Card className="rounded-2xl overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between">
              <div className="font-medium text-sm">Daily attendance (last 90)</div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => downloadCsv(attendance ?? [], `attendance-${teacher.full_name}`)}
              >
                <Download className="size-4 mr-1" /> Export CSV
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="p-3">Date</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {(attendance ?? []).map((a: any) => (
                    <tr key={a.id} className="border-t">
                      <td className="p-3">{fmtDate(a.date)}</td>
                      <td className="p-3">
                        <Badge className={badgeClass(a.status)}>{niceLabel(a.status)}</Badge>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">{a.notes ?? "—"}</td>
                    </tr>
                  ))}
                  {(attendance ?? []).length === 0 && (
                    <Empty colSpan={3} msg="No attendance records." />
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* LEAVE (read-only — managed by the leave workflow) */}
        <TabsContent value="leave" className="pt-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-5 rounded-2xl">
              <div className="text-2xl font-semibold">{leaveBalance.remaining}</div>
              <div className="text-xs text-muted-foreground">Balance remaining</div>
            </Card>
            <Card className="p-5 rounded-2xl">
              <div className="text-2xl font-semibold">{leaveBalance.used}</div>
              <div className="text-xs text-muted-foreground">Days used</div>
            </Card>
            <Card className="p-5 rounded-2xl">
              <div className="text-2xl font-semibold text-amber-600">{leaveBalance.pending}</div>
              <div className="text-xs text-muted-foreground">Pending</div>
            </Card>
            <Card className="p-5 rounded-2xl">
              <div className="text-2xl font-semibold">{leaveBalance.total}</div>
              <div className="text-xs text-muted-foreground">Annual entitlement</div>
            </Card>
          </div>
          <Card className="rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="p-3">Type</th>
                    <th className="p-3">Dates</th>
                    <th className="p-3">Days</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {(leaves ?? []).map((l: any) => (
                    <tr key={l.id} className="border-t">
                      <td className="p-3">{niceLabel(l.leave_type)}</td>
                      <td className="p-3">
                        {fmtDate(l.start_date)} → {fmtDate(l.end_date)}
                      </td>
                      <td className="p-3">{l.days}</td>
                      <td className="p-3">
                        <Badge className={badgeClass(l.status)}>{niceLabel(l.status)}</Badge>
                      </td>
                      <td className="p-3 text-muted-foreground">{l.reason ?? "—"}</td>
                    </tr>
                  ))}
                  {(leaves ?? []).length === 0 && <Empty colSpan={5} msg="No leave records." />}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* TIMETABLE */}
        <TabsContent value="timetable" className="pt-4">
          <TimetableTab teacherId={teacherId} canManage={canManage} />
        </TabsContent>

        {/* PERFORMANCE */}
        <TabsContent value="performance" className="pt-4">
          <CollectionCard
            title="Performance reviews"
            teacherId={teacherId}
            path="reviews"
            rows={reviews}
            canManage={canManage}
            onChanged={invalidate}
            emptyMsg="No reviews yet."
            columns={[
              { header: "Period", cell: (r: any) => r.period },
              {
                header: "Rating",
                cell: (r: any) => <span className="font-medium">{r.rating}/5</span>,
              },
              { header: "Reviewer", cell: (r: any) => r.profiles?.full_name ?? "—" },
              {
                header: "Notes",
                cell: (r: any) => <span className="text-muted-foreground">{r.notes ?? "—"}</span>,
              },
            ]}
            addTitle="Add performance review"
            addFields={[
              { name: "period", label: "Period", required: true, placeholder: "2026-H1" },
              { name: "rating", label: "Rating (0–5)", kind: "number", required: true },
              { name: "notes", label: "Notes", kind: "textarea", full: true },
            ]}
            mapAdd={(v) => ({
              period: v.period,
              rating: Number(v.rating),
              notes: v.notes || undefined,
            })}
          />
        </TabsContent>

        {/* DOCUMENTS */}
        <TabsContent value="documents" className="pt-4">
          <CollectionCard
            title="Documents"
            teacherId={teacherId}
            path="documents"
            rows={docs}
            canManage={canManage}
            onChanged={invalidate}
            emptyMsg="No documents uploaded."
            columns={[
              { header: "Type", cell: (d: any) => niceLabel(d.doc_type) },
              { header: "Title", cell: (d: any) => d.title },
              { header: "Uploaded", cell: (d: any) => fmtDate(d.uploaded_at) },
              {
                header: "Expiry",
                cell: (d: any) => (d.expiry_date ? fmtDate(d.expiry_date) : "—"),
              },
            ]}
            addTitle="Add document"
            addFields={[
              {
                name: "docType",
                label: "Type",
                kind: "select",
                required: true,
                options: ["certificate", "id_proof", "contract", "resume", "other"].map((v) => ({
                  value: v,
                  label: niceLabel(v),
                })),
              },
              { name: "title", label: "Title", required: true, full: true },
              { name: "fileUrl", label: "File URL", full: true, placeholder: "Optional link" },
              { name: "expiryDate", label: "Expiry", kind: "date" },
            ]}
            mapAdd={(v) => ({
              docType: v.docType,
              title: v.title,
              fileUrl: v.fileUrl || undefined,
              expiryDate: v.expiryDate || undefined,
            })}
          />
        </TabsContent>

        {/* ASSETS (read-only — managed by the asset module) */}
        <TabsContent value="assets" className="pt-4">
          <Card className="rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="p-3">Code</th>
                    <th className="p-3">Name</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Assigned</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Condition</th>
                  </tr>
                </thead>
                <tbody>
                  {(assets ?? []).map((a: any) => (
                    <tr key={a.id} className="border-t">
                      <td className="p-3 font-mono text-xs">{a.asset_code}</td>
                      <td className="p-3">{a.name}</td>
                      <td className="p-3">{a.category ?? "—"}</td>
                      <td className="p-3">{fmtDate(a.updated_at)}</td>
                      <td className="p-3">{niceLabel(a.status ?? "—")}</td>
                      <td className="p-3">{niceLabel(a.condition ?? "—")}</td>
                    </tr>
                  ))}
                  {(assets ?? []).length === 0 && <Empty colSpan={6} msg="No assets allocated." />}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* TRAINING */}
        <TabsContent value="training" className="pt-4">
          <CollectionCard
            title="Training"
            teacherId={teacherId}
            path="training"
            rows={training}
            canManage={canManage}
            onChanged={invalidate}
            emptyMsg="No training records."
            columns={[
              { header: "Program", cell: (t: any) => t.training_programs?.name ?? "—" },
              { header: "Provider", cell: (t: any) => t.training_programs?.provider ?? "—" },
              { header: "From", cell: (t: any) => fmtDate(t.training_programs?.start_date) },
              { header: "To", cell: (t: any) => fmtDate(t.training_programs?.end_date) },
              {
                header: "Status",
                cell: (t: any) => (
                  <Badge className={badgeClass(t.attended ? "completed" : "pending")}>
                    {t.attended ? "Completed" : "Pending"}
                  </Badge>
                ),
              },
            ]}
            addTitle="Add training"
            addFields={[
              { name: "title", label: "Program", required: true, full: true },
              { name: "provider", label: "Provider" },
              {
                name: "programType",
                label: "Type",
                kind: "select",
                options: ["workshop", "seminar", "course", "certification"].map((v) => ({
                  value: v,
                  label: niceLabel(v),
                })),
              },
              { name: "startDate", label: "From", kind: "date" },
              { name: "endDate", label: "To", kind: "date" },
              {
                name: "status",
                label: "Status",
                kind: "select",
                options: ["pending", "enrolled", "completed"].map((v) => ({
                  value: v,
                  label: niceLabel(v),
                })),
              },
            ]}
            mapAdd={(v) => ({
              title: v.title,
              provider: v.provider || undefined,
              programType: v.programType || undefined,
              startDate: v.startDate || undefined,
              endDate: v.endDate || undefined,
              status: v.status || undefined,
            })}
          />
        </TabsContent>

        {/* ACTIVITY (read-only audit trail) */}
        <TabsContent value="activity" className="pt-4">
          <Card className="rounded-2xl overflow-hidden">
            <div className="p-4 border-b font-medium text-sm">Recent audit trail</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="p-3">When</th>
                    <th className="p-3">Event</th>
                    <th className="p-3">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ...(history ?? []).map((h: any) => ({
                      ts: h.effective_date,
                      event: niceLabel(h.event_type),
                      detail: `${h.from_value ?? "—"} → ${h.to_value ?? "—"}`,
                    })),
                    ...(attendance ?? []).slice(0, 20).map((a: any) => ({
                      ts: a.date,
                      event: `Attendance · ${niceLabel(a.status)}`,
                      detail: a.notes ?? "",
                    })),
                    ...(payroll ?? []).map((p: any) => ({
                      ts: p.month,
                      event: `Payroll ${niceLabel(p.status)}`,
                      detail: money(p.net_salary),
                    })),
                  ]
                    .sort((a, b) => (b.ts ?? "").localeCompare(a.ts ?? ""))
                    .slice(0, 40)
                    .map((row, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-3">{fmtDate(row.ts)}</td>
                        <td className="p-3">{row.event}</td>
                        <td className="p-3 text-xs text-muted-foreground">{row.detail}</td>
                      </tr>
                    ))}
                  {(history ?? []).length + (attendance ?? []).length + (payroll ?? []).length ===
                    0 && <Empty colSpan={3} msg="No activity yet." />}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ---- Edit dialogs ---- */}
      <RecordFormDialog
        open={editCore}
        onOpenChange={setEditCore}
        title="Edit teacher"
        initial={{
          subject: teacher.subject ?? "",
          qualification: teacher.qualification ?? "",
          experienceYears: String(teacher.experience_years ?? 0),
          phone: teacher.phone ?? "",
          status: teacher.status ?? "active",
          joinedDate: teacher.joined_date ? String(teacher.joined_date).slice(0, 10) : "",
        }}
        fields={[
          { name: "subject", label: "Subject", required: true },
          { name: "qualification", label: "Qualification" },
          { name: "experienceYears", label: "Experience (yrs)", kind: "number" },
          { name: "phone", label: "Phone" },
          {
            name: "status",
            label: "Status",
            kind: "select",
            options: ["active", "on_leave", "inactive"].map((v) => ({
              value: v,
              label: niceLabel(v),
            })),
          },
          { name: "joinedDate", label: "Joined date", kind: "date" },
        ]}
        onSubmit={async (v) => {
          await apiPatch(`/teachers/${teacherId}`, {
            subject: v.subject,
            qualification: v.qualification || null,
            experienceYears: v.experienceYears ? Number(v.experienceYears) : undefined,
            phone: v.phone || null,
            status: v.status,
            joinedDate: v.joinedDate || undefined,
          });
          toast.success("Saved.");
          invalidate();
        }}
      />

      <RecordFormDialog
        open={editPersonal}
        onOpenChange={setEditPersonal}
        title="Edit personal details"
        initial={{
          dob: staff?.dob ? String(staff.dob).slice(0, 10) : "",
          bloodGroup: staff?.blood_group ?? "",
          address: staff?.address ?? "",
          emName: (staff?.emergency_contact as any)?.name ?? "",
          emPhone: (staff?.emergency_contact as any)?.phone ?? "",
          medicalInfo: (staff?.medical_info as any)?.notes ?? "",
          skills: (staff?.skills ?? []).join(", "),
        }}
        fields={[
          { name: "dob", label: "Date of birth", kind: "date" },
          { name: "bloodGroup", label: "Blood group" },
          { name: "address", label: "Address", full: true },
          { name: "emName", label: "Emergency contact name" },
          { name: "emPhone", label: "Emergency contact phone" },
          { name: "medicalInfo", label: "Medical info", kind: "textarea", full: true },
          { name: "skills", label: "Skills (comma-separated)", full: true },
        ]}
        onSubmit={(v) =>
          patchStaff({
            dob: v.dob || null,
            bloodGroup: v.bloodGroup || null,
            address: v.address || null,
            emergencyContact: v.emName || v.emPhone ? { name: v.emName, phone: v.emPhone } : null,
            medicalInfo: v.medicalInfo || null,
            skills: v.skills
              ? v.skills
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
              : [],
          })
        }
      />

      <RecordFormDialog
        open={editEmployment}
        onOpenChange={setEditEmployment}
        title="Edit employment"
        initial={{
          department: staff?.department ?? "Academic",
          designation: staff?.designation ?? "Teacher",
          employmentType: staff?.employment_type ?? "full_time",
          confirmationStatus: staff?.confirmation_status ?? "confirmed",
          probationEndDate: staff?.probation_end_date
            ? String(staff.probation_end_date).slice(0, 10)
            : "",
          joinDate: staff?.join_date ? String(staff.join_date).slice(0, 10) : "",
        }}
        fields={[
          { name: "department", label: "Department" },
          { name: "designation", label: "Designation" },
          {
            name: "employmentType",
            label: "Employment type",
            kind: "select",
            options: ["full_time", "part_time", "contract", "visiting"].map((v) => ({
              value: v,
              label: niceLabel(v),
            })),
          },
          {
            name: "confirmationStatus",
            label: "Confirmation",
            kind: "select",
            options: ["confirmed", "probation", "notice_period"].map((v) => ({
              value: v,
              label: niceLabel(v),
            })),
          },
          { name: "probationEndDate", label: "Probation end", kind: "date" },
          { name: "joinDate", label: "Join date", kind: "date" },
        ]}
        onSubmit={(v) =>
          patchStaff({
            department: v.department,
            designation: v.designation,
            employmentType: v.employmentType,
            confirmationStatus: v.confirmationStatus,
            probationEndDate: v.probationEndDate || null,
            joinDate: v.joinDate || undefined,
          })
        }
      />

      <RecordFormDialog
        open={editBank}
        onOpenChange={setEditBank}
        title="Edit bank details"
        initial={{
          bank: (staff?.bank_details as any)?.bank ?? "",
          account: (staff?.bank_details as any)?.account ?? "",
          ifsc: (staff?.bank_details as any)?.ifsc ?? "",
        }}
        fields={[
          { name: "bank", label: "Bank" },
          { name: "account", label: "Account number" },
          { name: "ifsc", label: "IFSC" },
        ]}
        onSubmit={(v) =>
          patchStaff({ bankDetails: { bank: v.bank, account: v.account, ifsc: v.ifsc } })
        }
      />
    </AppShell>
  );
}

/* ------------------------------ Timetable tab ------------------------------ */
type TTEntry = {
  id?: string;
  classId: string;
  className?: string | null;
  section?: string | null;
  subjectId?: string | null;
  subjectName?: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room?: string | null;
};

function TimetableTab({ teacherId, canManage }: { teacherId: string; canManage: boolean }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<TTEntry[]>([]);
  const [saving, setSaving] = useState(false);

  const { data } = useQuery({
    queryKey: ["teacher-timetable", teacherId],
    queryFn: () =>
      apiGet<{ profileLinked: boolean; entries: TTEntry[] }>(`/teachers/${teacherId}/timetable`),
  });
  const { data: classList } = useQuery({
    queryKey: ["tt-classes"],
    queryFn: () => apiGet<{ id: string; name: string; section: string }[]>("/classes"),
    enabled: canManage,
  });
  const { data: subjectList } = useQuery({
    queryKey: ["tt-subjects"],
    queryFn: () => apiGet<{ id: string; classId: string; name: string }[]>("/subjects"),
    enabled: canManage,
  });

  const entries = data?.entries ?? [];

  // Derive the period grid: distinct start–end windows, sorted by start.
  const periods = useMemo(() => {
    const set = new Map<string, { start: string; end: string }>();
    for (const e of entries)
      set.set(`${e.startTime}-${e.endTime}`, { start: e.startTime, end: e.endTime });
    return [...set.values()].sort((a, b) => a.start.localeCompare(b.start));
  }, [entries]);

  const cellFor = (day: number, start: string, end: string) =>
    entries.find((e) => e.dayOfWeek === day && e.startTime === start && e.endTime === end);

  const startEdit = () => {
    setDraft(entries.map((e) => ({ ...e })));
    setEditing(true);
  };
  const addRow = () =>
    setDraft((d) => [
      ...d,
      {
        classId: classList?.[0]?.id ?? "",
        dayOfWeek: 1,
        startTime: "08:00",
        endTime: "08:45",
        subjectId: null,
        room: "",
      },
    ]);
  const updateRow = (i: number, patch: Partial<TTEntry>) =>
    setDraft((d) => d.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const removeRow = (i: number) => setDraft((d) => d.filter((_, idx) => idx !== i));

  const save = async () => {
    setSaving(true);
    try {
      await apiPut(`/teachers/${teacherId}/timetable`, {
        entries: draft.map((e) => ({
          classId: e.classId,
          subjectId: e.subjectId || null,
          dayOfWeek: e.dayOfWeek,
          startTime: e.startTime,
          endTime: e.endTime,
          room: e.room || null,
        })),
      });
      toast.success("Timetable saved.");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["teacher-timetable", teacherId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (data && !data.profileLinked && !editing) {
    return (
      <Card className="rounded-2xl p-6 text-sm text-muted-foreground">
        This teacher has no linked login account yet, so a timetable can't be assigned. Create their
        user account (Users → Add user with the same email) first.
      </Card>
    );
  }

  if (editing) {
    return (
      <Card className="rounded-2xl overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <div className="font-medium text-sm">Edit weekly timetable</div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="p-2">Day</th>
                <th className="p-2">Start</th>
                <th className="p-2">End</th>
                <th className="p-2">Class</th>
                <th className="p-2">Subject</th>
                <th className="p-2">Room</th>
                <th className="p-2 w-10" />
              </tr>
            </thead>
            <tbody>
              {draft.map((row, i) => (
                <tr key={i} className="border-t">
                  <td className="p-2">
                    <select
                      className="h-9 rounded-md border bg-background px-2"
                      value={row.dayOfWeek}
                      onChange={(e) => updateRow(i, { dayOfWeek: Number(e.target.value) })}
                    >
                      {WEEKDAYS.map((d) => (
                        <option key={d} value={d}>
                          {DAYS[d]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2">
                    <Input
                      type="time"
                      value={row.startTime}
                      onChange={(e) => updateRow(i, { startTime: e.target.value })}
                      className="w-28"
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      type="time"
                      value={row.endTime}
                      onChange={(e) => updateRow(i, { endTime: e.target.value })}
                      className="w-28"
                    />
                  </td>
                  <td className="p-2">
                    <select
                      className="h-9 rounded-md border bg-background px-2 max-w-[180px]"
                      value={row.classId}
                      onChange={(e) => updateRow(i, { classId: e.target.value, subjectId: null })}
                    >
                      {(classList ?? []).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.section}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2">
                    <select
                      className="h-9 rounded-md border bg-background px-2 max-w-[160px]"
                      value={row.subjectId ?? ""}
                      onChange={(e) => updateRow(i, { subjectId: e.target.value || null })}
                    >
                      <option value="">—</option>
                      {(subjectList ?? [])
                        .filter((s) => s.classId === row.classId)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                    </select>
                  </td>
                  <td className="p-2">
                    <Input
                      value={row.room ?? ""}
                      onChange={(e) => updateRow(i, { room: e.target.value })}
                      className="w-24"
                      placeholder="Room"
                    />
                  </td>
                  <td className="p-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Remove slot"
                      className="text-destructive"
                      onClick={() => removeRow(i)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {draft.length === 0 && <Empty colSpan={7} msg="No slots. Add one below." />}
            </tbody>
          </table>
        </div>
        <div className="p-3 border-t">
          <Button size="sm" variant="outline" onClick={addRow}>
            <Plus className="size-4 mr-1" /> Add slot
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl overflow-hidden">
      <div className="p-4 border-b flex items-center justify-between">
        <div className="font-medium text-sm">Weekly teaching schedule</div>
        {canManage && (
          <Button size="sm" variant="outline" onClick={startEdit}>
            <Pencil className="size-4 mr-1" /> Edit timetable
          </Button>
        )}
      </div>
      {periods.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">
          No timetable set. {canManage ? "Use “Edit timetable” to add slots." : ""}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px] border-separate border-spacing-1 p-2">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="p-2 w-28">Period</th>
                {WEEKDAYS.map((d) => (
                  <th key={d} className="p-2 text-center font-medium">
                    {DAYS[d]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {periods.map((p, pi) => (
                <tr key={pi}>
                  <td className="p-2 align-top">
                    <div className="font-semibold">P{pi + 1}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.start}–{p.end}
                    </div>
                  </td>
                  {WEEKDAYS.map((d) => {
                    const cell = cellFor(d, p.start, p.end);
                    return (
                      <td key={d} className="p-1 align-top">
                        {cell ? (
                          <div className="rounded-lg border border-primary/20 bg-primary/5 p-2 text-center">
                            <div className="text-primary font-semibold text-xs uppercase">
                              {cell.subjectName ?? "Class"}
                            </div>
                            <div className="text-xs">
                              {cell.className}
                              {cell.section ? `-${cell.section}` : ""}
                            </div>
                            {cell.room && (
                              <div className="text-[11px] text-muted-foreground">{cell.room}</div>
                            )}
                          </div>
                        ) : (
                          <div className="rounded-lg border border-dashed p-2 text-center text-muted-foreground">
                            —
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ===================================================== TEACHER LOGIN CARD ===

function TeacherLoginCard({
  teacherId,
  credentials,
  onDone,
}: {
  teacherId: string;
  credentials?: { username: string | null; hasLogin: boolean };
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const username = credentials?.username ?? null;
  const hasLogin = !!credentials?.hasLogin;
  return (
    <Card className="p-6 rounded-2xl mt-4">
      <div className="flex items-center gap-2 font-display font-semibold">
        <IdCard className="size-4 text-primary" /> Portal Login Credentials
      </div>
      <p className="text-sm text-muted-foreground mt-1 mb-4">
        The teacher signs in with their email as the username. For security, passwords are stored
        only as encrypted hashes and can never be viewed — set a new one to share it.
      </p>
      <div className="rounded-xl border border-l-4 border-l-violet-500 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-medium">Teacher Login</div>
            <div className="text-sm mt-1 truncate">
              <span className="text-muted-foreground">Username: </span>
              <span className="font-medium">{username ?? "—"}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {hasLogin ? "Active login" : "No login yet — set a password to create one"}
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <KeyRound className="size-4" /> Set password
          </Button>
        </div>
      </div>

      {open && (
        <TeacherSetPasswordDialog
          teacherId={teacherId}
          username={username}
          onClose={() => setOpen(false)}
          onDone={onDone}
        />
      )}
    </Card>
  );
}

function TeacherSetPasswordDialog({
  teacherId,
  username,
  onClose,
  onDone,
}: {
  teacherId: string;
  username: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<"auto" | "custom">("auto");
  const [custom, setCustom] = useState("");
  const [send, setSend] = useState(true);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ password: string; sent: boolean } | null>(null);

  const save = async () => {
    if (mode === "custom" && custom.trim().length < 6) {
      return toast.error("Custom password must be at least 6 characters.");
    }
    setSaving(true);
    try {
      const res = await apiPost<any>(`/teachers/${teacherId}/set-password`, {
        password: mode === "custom" ? custom.trim() : undefined,
        send,
      });
      setResult({ password: res.tempPassword, sent: !!res.sent });
      toast.success(send ? "Password set and sent." : "Password set.");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not set the password.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Set teacher password</DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              This password is shown once. Copy it now and share it securely
              {result.sent ? " (a copy was also sent to their inbox)" : ""}.
            </p>
            <div className="flex items-center justify-between rounded-lg bg-muted/50 p-2.5">
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground truncate">
                  {username ?? "teacher"}
                </div>
                <div className="font-mono break-all">{result.password}</div>
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  navigator.clipboard?.writeText(result.password);
                  toast.success("Copied");
                }}
                aria-label="Copy password"
              >
                <Copy className="size-4" />
              </Button>
            </div>
            <DialogFooter>
              <Button onClick={onClose}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            {!username && (
              <p className="text-xs text-muted-foreground">
                No login exists yet — saving will create one from this teacher's profile.
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode("auto")}
                className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm ${mode === "auto" ? "border-primary bg-primary/10" : "text-muted-foreground hover:bg-muted"}`}
              >
                <RefreshCw className="size-4" /> Auto-generate
              </button>
              <button
                type="button"
                onClick={() => setMode("custom")}
                className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm ${mode === "custom" ? "border-primary bg-primary/10" : "text-muted-foreground hover:bg-muted"}`}
              >
                <KeyRound className="size-4" /> Set custom
              </button>
            </div>
            {mode === "custom" && (
              <div className="space-y-1.5">
                <Label>Custom password</Label>
                <Input
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  placeholder="At least 6 characters"
                  autoComplete="new-password"
                />
              </div>
            )}
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={send} onCheckedChange={(v) => setSend(!!v)} />
              <Send className="size-3.5 text-muted-foreground" /> Also send to their inbox
            </label>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Set password"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
