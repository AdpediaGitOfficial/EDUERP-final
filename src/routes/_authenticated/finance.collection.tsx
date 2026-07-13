import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiFileObjectUrl, apiGet } from "@/lib/api/client";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { QueryError, TableSkeleton } from "@/components/query-states";
import { downloadCsv, fmtDate, todayISO } from "@/lib/module-util";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronsDownUp,
  ChevronsUpDown,
  Download,
  IndianRupee,
  Printer,
  Receipt as ReceiptIcon,
  HandCoins,
} from "lucide-react";
import {
  CollectionSubNav,
  CollectStat,
  FilterBar,
  emptyFilters,
  filtersToQuery,
  inr,
  useFilterOptions,
  type Filters,
} from "@/components/fees-collection";

export const Route = createFileRoute("/_authenticated/finance/collection")({
  component: CollectPage,
});

type StudentRow = {
  studentId: string;
  admissionNo: string | null;
  rollNo: string | null;
  name: string | null;
  className: string | null;
  items: number;
  assigned: number;
  paid: number;
  due: number;
  daysOverdue: number;
};
type StudentList = {
  total: number;
  totals: { due: number; students: number };
  rows: StudentRow[];
};

function CollectPage() {
  const [filters, setFilters] = useState<Filters>({ ...emptyFilters });
  const [active, setActive] = useState<string | null>(null);
  const { data: options } = useFilterOptions();

  const q = useQuery<StudentList>({
    queryKey: ["fees-collection", "students", filters],
    queryFn: () => apiGet<StudentList>(`/fees/collection/students${filtersToQuery(filters)}`),
    enabled: !active,
  });

  if (active) {
    return <StudentSheet studentId={active} onBack={() => setActive(null)} />;
  }

  const rows = q.data?.rows ?? [];

  return (
    <div>
      <PageHeader
        title="Fees Collection"
        subtitle="Filter students, drill into their fee heads, and collect payments fast."
        action={<CollectionSubNav active="collect" />}
      />

      <div className="grid gap-3 sm:grid-cols-3 mb-4">
        <CollectStat label="Students shown" value={String(q.data?.totals.students ?? 0)} />
        <CollectStat label="Total outstanding" value={inr(q.data?.totals.due ?? 0)} tone="danger" />
        <CollectStat
          label="Filters active"
          value={
            Object.values(filters).filter(Boolean).length
              ? `${Object.values(filters).filter(Boolean).length}`
              : "None"
          }
        />
      </div>

      <div className="mb-4">
        <FilterBar value={filters} onChange={setFilters} options={options} />
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-2 p-3 border-b">
          <div className="text-sm font-medium">Students</div>
          <Button
            variant="outline"
            size="sm"
            disabled={!rows.length}
            onClick={() =>
              downloadCsv(
                rows.map((r) => ({
                  AdmissionNo: r.admissionNo ?? "",
                  Name: r.name ?? "",
                  Class: r.className ?? "",
                  Items: r.items,
                  Assigned: r.assigned,
                  Paid: r.paid,
                  Due: r.due,
                })),
                "fees-collection",
              )
            }
          >
            <Download className="size-4" /> Export CSV
          </Button>
        </div>

        {q.isLoading ? (
          <div className="p-4">
            <TableSkeleton rows={6} cols={5} />
          </div>
        ) : q.isError ? (
          <div className="p-4">
            <QueryError onRetry={() => q.refetch()} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title="No students match" hint="Adjust the filters to widen the search." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium">Admission No</th>
                  <th className="px-3 py-2 font-medium">Student</th>
                  <th className="px-3 py-2 font-medium">Class</th>
                  <th className="px-3 py-2 font-medium text-right">Total Due</th>
                  <th className="px-3 py-2 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.studentId} className="border-t hover:bg-muted/30">
                    <td className="px-3 py-2 font-mono text-xs">{r.admissionNo ?? "—"}</td>
                    <td className="px-3 py-2 font-medium">{r.name ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.className ?? "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <span
                        className={r.due > 0 ? "font-semibold text-red-600 dark:text-red-400" : ""}
                      >
                        {inr(r.due)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button size="sm" onClick={() => setActive(r.studentId)}>
                        <HandCoins className="size-4" /> View &amp; Collect
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ------------------------------ Student drill-down ------------------------------

type DetailRow = {
  id: string;
  feesType: string;
  dueDate: string;
  status: string;
  amount: number;
  paid: number;
  discount: number;
  fine: number;
  balance: number;
};
type Head = {
  title: string;
  rows: DetailRow[];
  subtotal: { amount: number; paid: number; balance: number };
};
type Detail = {
  student: {
    id: string;
    name: string | null;
    admissionNo: string | null;
    rollNo: string | null;
    className: string | null;
  };
  summary: {
    totalAssigned: number;
    totalPaid: number;
    concession: number;
    fine: number;
    balanceDue: number;
  };
  heads: Head[];
};

function StudentSheet({ studentId, onBack }: { studentId: string; onBack: () => void }) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [collectOpen, setCollectOpen] = useState(false);

  const q = useQuery<Detail>({
    queryKey: ["fees-collection", "detail", studentId],
    queryFn: () => apiGet<Detail>(`/fees/collection/students/${studentId}`),
  });

  const detail = q.data;
  const payableRows = useMemo(
    () => (detail?.heads.flatMap((h) => h.rows) ?? []).filter((r) => r.balance > 0),
    [detail],
  );
  const selectedRows = useMemo(
    () => payableRows.filter((r) => selected.has(r.id)),
    [payableRows, selected],
  );

  const toggle = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleHead = (h: Head) => {
    const ids = h.rows.filter((r) => r.balance > 0).map((r) => r.id);
    setSelected((prev) => {
      const n = new Set(prev);
      const allOn = ids.every((id) => n.has(id));
      ids.forEach((id) => (allOn ? n.delete(id) : n.add(id)));
      return n;
    });
  };
  const selectAll = () => {
    const ids = payableRows.map((r) => r.id);
    setSelected((prev) => (ids.every((id) => prev.has(id)) ? new Set() : new Set(ids)));
  };

  const allCollapsed = detail ? detail.heads.every((h) => collapsed.has(h.title)) : false;
  const toggleAllHeads = () => {
    if (!detail) return;
    setCollapsed(allCollapsed ? new Set() : new Set(detail.heads.map((h) => h.title)));
  };

  return (
    <div>
      <PageHeader
        title="Collect Fees"
        subtitle={detail?.student.name ?? "Student fee sheet"}
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onBack}>
              <ChevronLeft className="size-4" /> Back
            </Button>
            <Button disabled={selectedRows.length === 0} onClick={() => setCollectOpen(true)}>
              <IndianRupee className="size-4" /> Collect Selected ({selectedRows.length})
            </Button>
          </div>
        }
      />

      {q.isLoading ? (
        <Card className="p-4">
          <TableSkeleton rows={6} cols={5} />
        </Card>
      ) : q.isError || !detail ? (
        <QueryError onRetry={() => q.refetch()} />
      ) : (
        <>
          {/* Student header card */}
          <Card className="p-4 mb-4">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 mb-3">
              <div className="font-display text-lg font-semibold">{detail.student.name}</div>
              <div className="text-sm text-muted-foreground">
                {detail.student.admissionNo && (
                  <span className="font-mono">{detail.student.admissionNo}</span>
                )}
                {detail.student.className ? ` · ${detail.student.className}` : ""}
                {detail.student.rollNo ? ` · Roll ${detail.student.rollNo}` : ""}
              </div>
            </div>
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-5">
              <Mini label="Total Assigned" value={inr(detail.summary.totalAssigned)} />
              <Mini label="Total Paid" value={inr(detail.summary.totalPaid)} tone="success" />
              <Mini label="Concession" value={inr(detail.summary.concession)} />
              <Mini label="Fine" value={inr(detail.summary.fine)} />
              <Mini label="Balance Due" value={inr(detail.summary.balanceDue)} tone="danger" />
            </div>
          </Card>

          <div className="flex items-center justify-between mb-2">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={payableRows.length > 0 && payableRows.every((r) => selected.has(r.id))}
                onCheckedChange={selectAll}
                aria-label="Select all payable fees"
              />
              Select all payable
            </label>
            <Button variant="ghost" size="sm" onClick={toggleAllHeads}>
              {allCollapsed ? (
                <>
                  <ChevronsUpDown className="size-4" /> Expand all
                </>
              ) : (
                <>
                  <ChevronsDownUp className="size-4" /> Collapse all
                </>
              )}
            </Button>
          </div>

          {detail.heads.length === 0 ? (
            <EmptyState title="No fees assigned" hint="This student has no fee assignments." />
          ) : (
            <div className="space-y-3">
              {detail.heads.map((h) => {
                const isCollapsed = collapsed.has(h.title);
                const payable = h.rows.filter((r) => r.balance > 0);
                return (
                  <Card key={h.title} className="overflow-hidden">
                    <button
                      className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/30"
                      onClick={() =>
                        setCollapsed((prev) => {
                          const n = new Set(prev);
                          if (n.has(h.title)) n.delete(h.title);
                          else n.add(h.title);
                          return n;
                        })
                      }
                    >
                      {payable.length > 0 && (
                        <Checkbox
                          checked={payable.every((r) => selected.has(r.id))}
                          onCheckedChange={() => toggleHead(h)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Select all in ${h.title}`}
                        />
                      )}
                      <span className="font-medium">{h.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {h.rows.length} item{h.rows.length !== 1 ? "s" : ""}
                      </span>
                      <span className="ml-auto text-sm">
                        Balance{" "}
                        <span className="font-semibold text-red-600 dark:text-red-400">
                          {inr(h.subtotal.balance)}
                        </span>
                      </span>
                    </button>
                    {!isCollapsed && (
                      <div className="overflow-x-auto border-t">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/30 text-muted-foreground">
                            <tr className="text-left">
                              <th className="px-3 py-2 w-8"></th>
                              <th className="px-3 py-2 font-medium">Fees Type</th>
                              <th className="px-3 py-2 font-medium">Due Date</th>
                              <th className="px-3 py-2 font-medium">Status</th>
                              <th className="px-3 py-2 font-medium text-right">Amount</th>
                              <th className="px-3 py-2 font-medium text-right">Paid</th>
                              <th className="px-3 py-2 font-medium text-right">Balance</th>
                            </tr>
                          </thead>
                          <tbody>
                            {h.rows.map((r) => (
                              <tr key={r.id} className="border-t">
                                <td className="px-3 py-2">
                                  {r.balance > 0 && (
                                    <Checkbox
                                      checked={selected.has(r.id)}
                                      onCheckedChange={() => toggle(r.id)}
                                      aria-label={`Select ${r.feesType}`}
                                    />
                                  )}
                                </td>
                                <td className="px-3 py-2">{r.feesType}</td>
                                <td className="px-3 py-2 text-muted-foreground">
                                  {fmtDate(r.dueDate)}
                                </td>
                                <td className="px-3 py-2">
                                  <StatusBadge status={r.status} />
                                </td>
                                <td className="px-3 py-2 text-right">{inr(r.amount)}</td>
                                <td className="px-3 py-2 text-right">{inr(r.paid)}</td>
                                <td className="px-3 py-2 text-right font-medium">
                                  {inr(r.balance)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {collectOpen && detail && (
        <CollectModal
          studentId={studentId}
          studentName={detail.student.name}
          rows={selectedRows}
          onClose={() => setCollectOpen(false)}
          onDone={() => {
            setCollectOpen(false);
            setSelected(new Set());
            qc.invalidateQueries({ queryKey: ["fees-collection"] });
          }}
        />
      )}
    </div>
  );
}

function Mini({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "danger" | "success";
}) {
  const cls =
    tone === "danger"
      ? "text-red-600 dark:text-red-400"
      : tone === "success"
        ? "text-emerald-600 dark:text-emerald-400"
        : "";
  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`font-display text-base font-semibold mt-0.5 ${cls}`}>{value}</div>
    </div>
  );
}

// ------------------------------ Collect modal ------------------------------

const METHODS = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "bank", label: "Bank Transfer" },
  { value: "cheque", label: "Cheque" },
];
const NON_CASH = new Set(["upi", "card", "bank", "cheque"]);

type LineInput = { paying: string; discount: string; fine: string };

function CollectModal({
  studentId,
  studentName,
  rows,
  onClose,
  onDone,
}: {
  studentId: string;
  studentName: string | null;
  rows: DetailRow[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [paymentDate, setPaymentDate] = useState(todayISO());
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [depositAccount, setDepositAccount] = useState("");
  const [receiptNo, setReceiptNo] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [lines, setLines] = useState<Record<string, LineInput>>(() =>
    Object.fromEntries(
      rows.map((r) => [r.id, { paying: String(r.balance), discount: "", fine: "" }]),
    ),
  );

  const setLine = (id: string, patch: Partial<LineInput>) =>
    setLines((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const totalPayable = rows.reduce((s, r) => s + (Number(lines[r.id]?.paying) || 0), 0);

  const submit = async (print: boolean) => {
    if (NON_CASH.has(method) && !reference.trim()) {
      return toast.error("A reference number is required for non-cash payments.");
    }
    const payload = {
      studentId,
      paymentDate,
      method,
      reference: reference.trim() || undefined,
      depositAccount: depositAccount.trim() || undefined,
      receiptNo: receiptNo.trim() || undefined,
      note: note.trim() || undefined,
      lines: rows.map((r) => ({
        feeAssignmentId: r.id,
        paying: Number(lines[r.id]?.paying) || 0,
        discount: Number(lines[r.id]?.discount) || 0,
        fine: Number(lines[r.id]?.fine) || 0,
      })),
    };
    setSaving(true);
    let res: { paymentIds: string[]; total: number } | null = null;
    try {
      const r = await apiFetch("/fees/collection/payments", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      res = r ? await r.json() : null;
    } catch (err) {
      setSaving(false);
      return toast.error(err instanceof Error ? err.message : "Could not save the payment.");
    }
    setSaving(false);
    toast.success(`Payment of ${inr(res?.total ?? totalPayable)} recorded.`);
    if (print && res?.paymentIds?.length) {
      const url = await apiFileObjectUrl(
        `/fees/collection/receipt.pdf?ids=${res.paymentIds.join(",")}`,
      );
      if (url) window.open(url, "_blank");
    }
    onDone();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ReceiptIcon className="size-4" /> Collect Fees — {studentName}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Payment Date</Label>
            <Input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Payment Mode</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {NON_CASH.has(method) && (
            <div className="space-y-1.5">
              <Label>Reference No</Label>
              <Input
                placeholder="Txn / cheque / bank ref"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Deposit To Account</Label>
            <Input
              placeholder="e.g. School Current A/c"
              value={depositAccount}
              onChange={(e) => setDepositAccount(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>School Receipt No</Label>
            <Input
              placeholder="Optional manual no."
              value={receiptNo}
              onChange={(e) => setReceiptNo(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Special Note</Label>
            <Textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note on this collection"
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border mt-1">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">Fee</th>
                <th className="px-3 py-2 font-medium text-right">Balance</th>
                <th className="px-3 py-2 font-medium text-right">Paying</th>
                <th className="px-3 py-2 font-medium text-right">Discount</th>
                <th className="px-3 py-2 font-medium text-right">Fine</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2">{r.feesType}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{inr(r.balance)}</td>
                  <td className="px-2 py-1.5">
                    <Input
                      type="number"
                      step="0.01"
                      className="h-8 w-24 ml-auto text-right"
                      value={lines[r.id]?.paying ?? ""}
                      onChange={(e) => setLine(r.id, { paying: e.target.value })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      type="number"
                      step="0.01"
                      className="h-8 w-20 ml-auto text-right"
                      value={lines[r.id]?.discount ?? ""}
                      onChange={(e) => setLine(r.id, { discount: e.target.value })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      type="number"
                      step="0.01"
                      className="h-8 w-20 ml-auto text-right"
                      value={lines[r.id]?.fine ?? ""}
                      onChange={(e) => setLine(r.id, { fine: e.target.value })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between rounded-lg bg-secondary/60 px-4 py-3">
          <span className="text-sm text-muted-foreground">Total Payable</span>
          <span className="font-display text-xl font-semibold">{inr(totalPayable)}</span>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Close
          </Button>
          <Button variant="secondary" onClick={() => submit(false)} disabled={saving}>
            {saving ? "Saving…" : "Save Payment"}
          </Button>
          <Button onClick={() => submit(true)} disabled={saving}>
            <Printer className="size-4" /> Save &amp; Print Receipt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
