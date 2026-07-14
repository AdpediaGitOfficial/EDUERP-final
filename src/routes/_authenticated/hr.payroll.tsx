import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { apiGet, apiFetch, apiFileObjectUrl } from "@/lib/api/client";
import { PageHeader } from "@/components/app-shell";
import { QueryError, TableSkeleton } from "@/components/query-states";
import { EmptyRow } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useConfirm } from "@/components/confirm-dialog";
import { money } from "@/lib/module-util";
import {
  ArrowLeft,
  Play,
  Eye,
  Pencil,
  IndianRupee,
  FileText,
  AlertTriangle,
  Wallet,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/hr/payroll")({ component: Page });

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

type MonthRow = {
  month: string;
  employees: number;
  totalNet: number;
  paid: number;
  pending: number;
  generatedOn: string;
  status: string;
};
type DetailRow = {
  id: string;
  staffName: string | null;
  employeeCode: string | null;
  designation: string | null;
  grossSalary: number;
  workingDays: number | null;
  daysWorked: number | null;
  attendanceDeduction: number;
  statutoryDeductions: number;
  otherDeductions: number;
  netSalary: number;
  status: string;
  payDate: string | null;
};
type Coverage = { activeStaff: number; withSalary: number; withoutSalary: number };
type DueRow = {
  id: string;
  staffName: string | null;
  employeeCode: string | null;
  department: string | null;
  designation: string | null;
  month: string;
  netSalary: number;
};
type Dues = {
  summary: {
    totalDue: number;
    runCount: number;
    staffCount: number;
    oldestMonth: string | null;
  };
  rows: DueRow[];
};

function Page() {
  const [selected, setSelected] = useState<{ year: number; month: number } | null>(null);
  return (
    <>
      <PageHeader
        title="Payroll"
        subtitle="Generate monthly payroll, then pay staff and issue payslips."
      />
      {selected ? (
        <RunDetail sel={selected} onBack={() => setSelected(null)} />
      ) : (
        <RunList onOpen={(y, m) => setSelected({ year: y, month: m })} />
      )}
    </>
  );
}

/* ─────────────────────────── Generate + list ─────────────────────────── */
function RunList({ onOpen }: { onOpen: (year: number, month: number) => void }) {
  const qc = useQueryClient();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["payroll-months"],
    queryFn: () => apiGet<MonthRow[]>("/hr/payroll/months"),
  });

  const generate = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/hr/payroll/generate", {
        method: "POST",
        body: JSON.stringify({ year, month }),
      });
      if (!res || !res.ok) {
        const b = res ? await res.json().catch(() => null) : null;
        throw new Error(b?.message ?? "Could not generate payroll");
      }
      return res.json();
    },
    onSuccess: (r: any) => {
      const parts = [`${r.generated} generated`];
      if (r.skippedPaid) parts.push(`${r.skippedPaid} already paid`);
      if (r.noStructure) parts.push(`${r.noStructure} skipped (no salary set)`);
      toast.success(`Payroll for ${MONTHS[month - 1]} ${year}: ${parts.join(", ")}`);
      qc.invalidateQueries({ queryKey: ["payroll-months"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <>
      <CoverageBanner />
      <Card className="rounded-2xl p-5 mb-6">
        <h3 className="font-semibold mb-4">Generate new payroll</h3>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <div>
            <Label>Month</Label>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger aria-label="Month">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => (
                  <SelectItem key={m} value={String(i + 1)}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Year</Label>
            <Input
              type="number"
              value={year}
              min={2000}
              max={2100}
              onChange={(e) => setYear(Number(e.target.value))}
              aria-label="Year"
            />
          </div>
          <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
            <Play className="size-4 mr-1" />
            {generate.isPending ? "Generating…" : "Generate payroll"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Creates a payroll run for every active staff member with a salary structure. Re-running a
          month refreshes unpaid runs and leaves paid ones untouched.
        </p>
      </Card>

      <Card className="rounded-2xl overflow-hidden">
        <div className="p-4 border-b font-semibold">Generated payroll list</div>
        {isError ? (
          <QueryError onRetry={() => refetch()} />
        ) : isLoading ? (
          <TableSkeleton rows={5} cols={5} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="p-3 font-medium">Month &amp; Year</th>
                  <th className="p-3 font-medium text-right">Employees</th>
                  <th className="p-3 font-medium text-right">Total Net</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3 font-medium">Generated On</th>
                  <th className="p-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {(data ?? []).map((r) => {
                  const d = new Date(r.month);
                  const y = d.getUTCFullYear();
                  const m = d.getUTCMonth() + 1;
                  return (
                    <tr key={r.month} className="border-t hover:bg-muted/30">
                      <td className="p-3 font-medium">
                        {MONTHS[m - 1]} {y}
                      </td>
                      <td className="p-3 text-right">{r.employees}</td>
                      <td className="p-3 text-right font-medium">{money(r.totalNet)}</td>
                      <td className="p-3">
                        <StatusBadge
                          tone={r.status === "paid" ? "success" : "info"}
                          label={
                            r.status === "paid" ? "Fully paid" : `${r.paid}/${r.employees} paid`
                          }
                        />
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {new Date(r.generatedOn).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="p-3 text-right">
                        <Button size="sm" variant="outline" onClick={() => onOpen(y, m)}>
                          <Eye className="size-4 mr-1" />
                          View
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {data && data.length === 0 && (
                  <EmptyRow
                    colSpan={6}
                    title="No payroll generated yet"
                    hint="Generate a month above to begin."
                  />
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <DuesSection />
    </>
  );
}

/* ─────────────────────── Coverage banner ─────────────────────── */
function CoverageBanner() {
  const { data } = useQuery({
    queryKey: ["payroll-coverage"],
    queryFn: () => apiGet<Coverage>("/hr/payroll/coverage"),
  });
  if (!data || data.withoutSalary === 0) return null;
  return (
    <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-amber-300/60 bg-amber-50 p-4 text-amber-900 sm:flex-row sm:items-center sm:justify-between dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0" />
        <div>
          <div className="font-semibold">
            {data.withoutSalary} of {data.activeStaff} active staff have no salary set
          </div>
          <div className="text-sm opacity-90">
            They will be skipped when you generate payroll. Assign a salary structure so they get
            paid.
          </div>
        </div>
      </div>
      <Button asChild variant="outline" className="shrink-0 border-amber-400">
        <Link to="/hr/salary">Set salaries</Link>
      </Button>
    </div>
  );
}

/* ─────────────────────── Salary dues (pending) ─────────────────────── */
function DuesSection() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["payroll-dues"],
    queryFn: () => apiGet<Dues>("/hr/payroll/dues"),
  });

  const pay = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/hr/payroll/runs/${id}/pay`, { method: "PATCH" });
      if (!res || !res.ok) throw new Error("Could not record the payment");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Marked as paid");
      qc.invalidateQueries({ queryKey: ["payroll-dues"] });
      qc.invalidateQueries({ queryKey: ["payroll-months"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const monthLabel = (iso: string) => {
    const d = new Date(iso);
    return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  };

  return (
    <Card className="rounded-2xl overflow-hidden mt-6">
      <div className="p-4 border-b flex items-center gap-2">
        <Wallet className="size-4" />
        <span className="font-semibold">Salary pending &amp; dues</span>
        {data && data.summary.runCount > 0 && (
          <span className="ml-auto text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{money(data.summary.totalDue)}</span> due
            · {data.summary.staffCount} staff · {data.summary.runCount} run
            {data.summary.runCount === 1 ? "" : "s"}
            {data.summary.oldestMonth ? ` · since ${monthLabel(data.summary.oldestMonth)}` : ""}
          </span>
        )}
      </div>
      {isError ? (
        <QueryError onRetry={() => refetch()} />
      ) : isLoading ? (
        <TableSkeleton rows={4} cols={5} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="p-3 font-medium">Employee</th>
                <th className="p-3 font-medium">Department</th>
                <th className="p-3 font-medium">Month</th>
                <th className="p-3 font-medium text-right">Net payable</th>
                <th className="p-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {(data?.rows ?? []).map((r) => (
                <tr key={r.id} className="border-t hover:bg-muted/30">
                  <td className="p-3">
                    <div className="font-medium">{r.staffName}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.employeeCode ?? ""}
                      {r.designation ? ` · ${r.designation}` : ""}
                    </div>
                  </td>
                  <td className="p-3 text-muted-foreground">{r.department ?? "—"}</td>
                  <td className="p-3">{monthLabel(r.month)}</td>
                  <td className="p-3 text-right font-medium">{money(Number(r.netSalary))}</td>
                  <td className="p-3 text-right">
                    <Button
                      size="sm"
                      aria-label={`Pay ${r.staffName}`}
                      disabled={pay.isPending}
                      onClick={() =>
                        confirm({
                          title: `Pay ${r.staffName}?`,
                          description: `${monthLabel(r.month)} · ${money(Number(r.netSalary))}`,
                          confirmText: "Mark paid",
                        }).then((ok) => ok && pay.mutate(r.id))
                      }
                    >
                      <IndianRupee className="size-4 mr-1" />
                      Pay
                    </Button>
                  </td>
                </tr>
              ))}
              {data && data.rows.length === 0 && (
                <EmptyRow
                  colSpan={5}
                  title="No pending salaries"
                  hint="Every generated payroll run has been paid."
                />
              )}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/* ─────────────────────────── Run detail ─────────────────────────── */
function RunDetail({ sel, onBack }: { sel: { year: number; month: number }; onBack: () => void }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<DetailRow | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["payroll-detail", sel.year, sel.month],
    queryFn: () =>
      apiGet<{ month: string; rows: DetailRow[] }>(
        `/hr/payroll/detail?year=${sel.year}&month=${sel.month}`,
      ),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["payroll-detail", sel.year, sel.month] });
    qc.invalidateQueries({ queryKey: ["payroll-months"] });
  };

  const pay = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/hr/payroll/runs/${id}/pay`, { method: "PATCH" });
      if (!res || !res.ok) throw new Error("Could not mark as paid");
    },
    onSuccess: () => {
      toast.success("Marked as paid");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openPayslip = async (id: string) => {
    const url = await apiFileObjectUrl(`/hr/payroll/runs/${id}/payslip.pdf`);
    if (url) window.open(url, "_blank", "noopener");
    else toast.error("Could not open the payslip");
  };

  const rows = data?.rows ?? [];
  const totals = rows.reduce(
    (a, r) => ({ gross: a.gross + Number(r.grossSalary), net: a.net + Number(r.netSalary) }),
    { gross: 0, net: 0 },
  );

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-lg">
          Payroll for {MONTHS[sel.month - 1]} {sel.year}
        </h3>
        <Button variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4 mr-1" />
          Back to list
        </Button>
      </div>

      <Card className="rounded-2xl overflow-hidden">
        {isError ? (
          <QueryError onRetry={() => refetch()} />
        ) : isLoading ? (
          <TableSkeleton rows={6} cols={8} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="p-3 font-medium">Staff Name</th>
                  <th className="p-3 font-medium text-right">Gross</th>
                  <th className="p-3 font-medium text-center">Days</th>
                  <th className="p-3 font-medium text-right">Attendance</th>
                  <th className="p-3 font-medium text-right">Statutory</th>
                  <th className="p-3 font-medium text-right">Other</th>
                  <th className="p-3 font-medium text-right">Net</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-muted/30">
                    <td className="p-3">
                      <div className="font-medium">{r.staffName}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.employeeCode}
                        {r.designation ? ` · ${r.designation}` : ""}
                      </div>
                    </td>
                    <td className="p-3 text-right">{money(r.grossSalary)}</td>
                    <td className="p-3 text-center text-muted-foreground">
                      {r.daysWorked ?? "—"}/{r.workingDays ?? "—"}
                    </td>
                    <td className="p-3 text-right text-destructive">
                      {Number(r.attendanceDeduction) > 0 ? money(r.attendanceDeduction) : "—"}
                    </td>
                    <td className="p-3 text-right">
                      {Number(r.statutoryDeductions) > 0 ? money(r.statutoryDeductions) : "—"}
                    </td>
                    <td className="p-3 text-right">
                      {Number(r.otherDeductions) > 0 ? money(r.otherDeductions) : "—"}
                    </td>
                    <td className="p-3 text-right font-semibold">{money(r.netSalary)}</td>
                    <td className="p-3">
                      <StatusBadge
                        tone={r.status === "paid" ? "success" : "warning"}
                        label={r.status === "paid" ? "Paid" : "Unpaid"}
                      />
                    </td>
                    <td className="p-3">
                      <div className="flex justify-end gap-1">
                        {r.status !== "paid" && (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Edit payroll for ${r.staffName}`}
                              title="Edit"
                              onClick={() => setEditing(r)}
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Pay ${r.staffName}`}
                              title="Mark as paid"
                              onClick={() =>
                                confirm({
                                  title: `Pay ${r.staffName}?`,
                                  description: `Mark ${money(r.netSalary)} as paid. This can't be undone.`,
                                  confirmText: "Mark paid",
                                }).then((ok) => ok && pay.mutate(r.id))
                              }
                            >
                              <IndianRupee className="size-4 text-emerald-600" />
                            </Button>
                          </>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Payslip for ${r.staffName}`}
                          title="View payslip"
                          onClick={() => openPayslip(r.id)}
                        >
                          <FileText className="size-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && <EmptyRow colSpan={9} title="No runs for this month" />}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr className="border-t bg-muted/30 font-medium">
                    <td className="p-3">Total ({rows.length})</td>
                    <td className="p-3 text-right">{money(totals.gross)}</td>
                    <td colSpan={4} />
                    <td className="p-3 text-right">{money(totals.net)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </Card>

      {editing && (
        <EditRunDialog run={editing} onClose={() => setEditing(null)} onSaved={invalidate} />
      )}
    </>
  );
}

/* ─────────────────────────── Edit dialog ─────────────────────────── */
function EditRunDialog({
  run,
  onClose,
  onSaved,
}: {
  run: DetailRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [attendance, setAttendance] = useState(String(run.attendanceDeduction));
  const [statutory, setStatutory] = useState(String(run.statutoryDeductions));
  const [other, setOther] = useState(String(run.otherDeductions));

  const save = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/hr/payroll/runs/${run.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          attendance_deduction: Number(attendance) || 0,
          statutory_deductions: Number(statutory) || 0,
          other_deductions: Number(other) || 0,
        }),
      });
      if (!res || !res.ok) {
        const b = res ? await res.json().catch(() => null) : null;
        throw new Error(b?.message ?? "Could not save");
      }
    },
    onSuccess: () => {
      toast.success("Payroll updated");
      onClose();
      onSaved();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const net = Math.max(
    0,
    Number(run.grossSalary) -
      (Number(attendance) || 0) -
      (Number(statutory) || 0) -
      (Number(other) || 0),
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit payroll — {run.staffName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Gross salary</span>
            <span className="font-medium text-foreground">{money(run.grossSalary)}</span>
          </div>
          <div>
            <Label>Attendance deduction</Label>
            <Input
              type="number"
              value={attendance}
              onChange={(e) => setAttendance(e.target.value)}
            />
          </div>
          <div>
            <Label>Statutory deductions (PF / ESI / PT / TDS)</Label>
            <Input type="number" value={statutory} onChange={(e) => setStatutory(e.target.value)} />
          </div>
          <div>
            <Label>Other deductions</Label>
            <Input type="number" value={other} onChange={(e) => setOther(e.target.value)} />
          </div>
          <div className="flex justify-between border-t pt-3 font-semibold">
            <span>Net salary</span>
            <span>{money(net)}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
