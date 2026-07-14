import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiFileObjectUrl, apiGet } from "@/lib/api/client";
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
import { inr } from "@/components/fees-collection";
import { fmtDate, todayISO } from "@/lib/module-util";
import { toast } from "sonner";
import {
  Wallet,
  CheckCircle2,
  AlertTriangle,
  CalendarClock,
  Clock,
  HandCoins,
  IndianRupee,
  Printer,
  Receipt as ReceiptIcon,
  Search,
} from "lucide-react";

// ---- shapes returned by /fees/collection/students/:id ----
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
// A flattened installment row tagged with its fee head/category.
type Row = DetailRow & { head: string };
type Detail = {
  student: {
    id: string;
    name: string | null;
    admissionNo: string | null;
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
type PaymentRow = {
  id: string;
  feeTitle: string | null;
  amount: number | string;
  method: string | null;
  reference: string | null;
  receiptNo: string | null;
  paidAt: string;
  status: string | null;
  paymentSource: string | null;
};

const isoDay = () => new Date(new Date().toISOString().slice(0, 10));
const rowState = (r: DetailRow): "paid" | "partial" | "overdue" | "due" => {
  if (r.balance <= 0) return "paid";
  const overdue = r.dueDate && new Date(r.dueDate) < isoDay();
  if (r.paid > 0) return overdue ? "overdue" : "partial";
  return overdue ? "overdue" : "due";
};

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "due", label: "Due" },
  { value: "overdue", label: "Overdue" },
  { value: "paid", label: "Paid" },
  { value: "partial", label: "Partially paid" },
];

/**
 * Self-contained fee workspace for the student profile: summary cards, filters,
 * a flat installment table with inline selection, an in-page collect drawer, and
 * a payment-history list — all without leaving the page. Collection is gated to
 * admin/accountant via `canCollect`; everyone else sees a read-only view.
 */
export function StudentFeesInline({
  studentId,
  canCollect,
  fallbackFees = [],
}: {
  studentId: string;
  canCollect: boolean;
  fallbackFees?: any[];
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collectRows, setCollectRows] = useState<Row[] | null>(null);

  const detailQ = useQuery<Detail>({
    queryKey: ["student-fees", "detail", studentId],
    queryFn: () => apiGet<Detail>(`/fees/collection/students/${studentId}`),
    enabled: canCollect,
  });
  const paymentsQ = useQuery<{ rows: PaymentRow[] }>({
    queryKey: ["student-fees", "payments", studentId],
    queryFn: () => apiGet<{ rows: PaymentRow[] }>(`/payments?studentId=${studentId}&pageSize=200`),
  });

  const detail = detailQ.data;
  const payments = useMemo(() => paymentsQ.data?.rows ?? [], [paymentsQ.data]);

  // Unify the installment rows: staff read the authoritative collection sheet;
  // parents/students fall back to the dashboard fee rows (same shape, no fines).
  const allRows: Row[] = useMemo(() => {
    if (canCollect) {
      return (detail?.heads ?? []).flatMap((h) => h.rows.map((r) => ({ ...r, head: h.title })));
    }
    return (fallbackFees ?? []).map((r: any) => {
      const amount = Number(r.amount_due ?? 0);
      const paid = Number(r.amount_paid ?? 0);
      return {
        id: r.id,
        feesType: r.fee_structures?.name ?? r.title ?? "Fee",
        dueDate: r.due_date,
        status: r.status ?? "",
        amount,
        paid,
        discount: 0,
        fine: 0,
        balance: amount - paid,
        head: r.fee_structures?.term ?? r.fee_structures?.name ?? "Fees",
      };
    });
  }, [canCollect, detail, fallbackFees]);

  const categories = useMemo(() => Array.from(new Set(allRows.map((r) => r.head))), [allRows]);

  // ---- summary metrics (real-time: recomputed off the live rows) ----
  const summary = useMemo(() => {
    const total =
      canCollect && detail
        ? detail.summary.totalAssigned
        : allRows.reduce((a, r) => a + r.amount, 0);
    const paid =
      canCollect && detail ? detail.summary.totalPaid : allRows.reduce((a, r) => a + r.paid, 0);
    const balance =
      canCollect && detail ? detail.summary.balanceDue : allRows.reduce((a, r) => a + r.balance, 0);
    const overdue = allRows
      .filter((r) => rowState(r) === "overdue")
      .reduce((a, r) => a + r.balance, 0);
    const upcoming = allRows
      .filter((r) => r.balance > 0 && r.dueDate && new Date(r.dueDate) >= isoDay())
      .sort((a, b) => +new Date(a.dueDate) - +new Date(b.dueDate));
    const lastPay = payments[0] ?? null;
    return {
      total,
      paid,
      balance,
      overdue,
      nextDue: upcoming[0]?.dueDate ?? null,
      lastPaymentAt: lastPay?.paidAt ?? null,
      lastPaymentAmt: lastPay ? Number(lastPay.amount) : null,
    };
  }, [canCollect, detail, allRows, payments]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allRows.filter((r) => {
      if (category !== "all" && r.head !== category) return false;
      if (status !== "all" && rowState(r) !== status) return false;
      if (term && !(r.feesType || "").toLowerCase().includes(term)) return false;
      return true;
    });
  }, [allRows, search, status, category]);

  const payableFiltered = filtered.filter((r) => r.balance > 0);
  const selectedRows = allRows.filter((r) => selected.has(r.id));
  const toggle = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const selectAllPayable = () => {
    const ids = payableFiltered.map((r) => r.id);
    setSelected((prev) => (ids.every((id) => prev.has(id)) ? new Set() : new Set(ids)));
  };

  const onCollected = () => {
    setCollectRows(null);
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ["student-fees"] });
    qc.invalidateQueries({ queryKey: ["child-dashboard", studentId] });
    qc.invalidateQueries({ queryKey: ["sis-profile", studentId] });
    qc.invalidateQueries({ queryKey: ["fees-collection"] });
  };

  const openReceipt = async (paymentId: string) => {
    const url = await apiFileObjectUrl(`/payments/${paymentId}/receipt.pdf`);
    if (url) window.open(url, "_blank");
    else toast.error("Could not open the receipt.");
  };

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <SummaryCard
          icon={<Wallet className="size-4" />}
          label="Total Fees"
          value={inr(summary.total)}
        />
        <SummaryCard
          icon={<CheckCircle2 className="size-4" />}
          label="Total Paid"
          value={inr(summary.paid)}
          tone="success"
        />
        <SummaryCard
          icon={<Wallet className="size-4" />}
          label="Balance Due"
          value={inr(summary.balance)}
          tone={summary.balance > 0 ? "danger" : "success"}
        />
        <SummaryCard
          icon={<AlertTriangle className="size-4" />}
          label="Overdue"
          value={inr(summary.overdue)}
          tone={summary.overdue > 0 ? "danger" : undefined}
        />
        <SummaryCard
          icon={<CalendarClock className="size-4" />}
          label="Next Due"
          value={summary.nextDue ? fmtDate(summary.nextDue) : "—"}
        />
        <SummaryCard
          icon={<Clock className="size-4" />}
          label="Last Payment"
          value={summary.lastPaymentAt ? fmtDate(summary.lastPaymentAt) : "—"}
          sub={summary.lastPaymentAmt != null ? inr(summary.lastPaymentAmt) : undefined}
        />
      </div>

      {canCollect && detailQ.isLoading ? (
        <Card className="p-4">
          <TableSkeleton rows={6} cols={5} />
        </Card>
      ) : canCollect && (detailQ.isError || !detail) ? (
        <QueryError onRetry={() => detailQ.refetch()} />
      ) : (
        <>
          {/* Filters (+ collect bar for staff) */}
          <Card className="p-3">
            <div className="flex flex-col lg:flex-row lg:items-center gap-2">
              <div className="relative flex-1 min-w-[10rem]">
                <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search fee / installment…"
                  className="pl-9 h-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-9 w-full lg:w-44">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_FILTERS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-9 w-full lg:w-52">
                  <SelectValue placeholder="Fee category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {canCollect && (
                <Button
                  className="h-9"
                  disabled={selectedRows.length === 0}
                  onClick={() => setCollectRows(selectedRows)}
                >
                  <IndianRupee className="size-4" /> Collect Selected ({selectedRows.length})
                </Button>
              )}
            </div>
          </Card>

          {/* Installment table */}
          <Card className="overflow-hidden">
            {filtered.length === 0 ? (
              <EmptyState
                title="No fees match"
                hint={allRows.length ? "Adjust the filters above." : "No fees assigned yet."}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr className="text-left">
                      {canCollect && (
                        <th className="px-3 py-2 w-8">
                          <Checkbox
                            checked={
                              payableFiltered.length > 0 &&
                              payableFiltered.every((r) => selected.has(r.id))
                            }
                            onCheckedChange={selectAllPayable}
                            aria-label="Select all payable"
                          />
                        </th>
                      )}
                      <th className="px-3 py-2 font-medium">Fee / Installment</th>
                      <th className="px-3 py-2 font-medium">Category</th>
                      <th className="px-3 py-2 font-medium">Due Date</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium text-right">Amount</th>
                      <th className="px-3 py-2 font-medium text-right">Paid</th>
                      <th className="px-3 py-2 font-medium text-right">Balance</th>
                      {canCollect && <th className="px-3 py-2 font-medium text-right">Action</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => {
                      const st = rowState(r);
                      return (
                        <tr key={r.id} className="border-t hover:bg-muted/20">
                          {canCollect && (
                            <td className="px-3 py-2">
                              {r.balance > 0 && (
                                <Checkbox
                                  checked={selected.has(r.id)}
                                  onCheckedChange={() => toggle(r.id)}
                                  aria-label={`Select ${r.feesType}`}
                                />
                              )}
                            </td>
                          )}
                          <td className="px-3 py-2 font-medium">{r.feesType}</td>
                          <td className="px-3 py-2 text-muted-foreground">{r.head}</td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {st === "overdue" && (
                              <AlertTriangle className="size-3.5 inline mr-1 text-red-500" />
                            )}
                            {fmtDate(r.dueDate)}
                          </td>
                          <td className="px-3 py-2">
                            <StatusBadge status={st === "due" ? "pending" : st} />
                          </td>
                          <td className="px-3 py-2 text-right">{inr(r.amount)}</td>
                          <td className="px-3 py-2 text-right text-emerald-600 dark:text-emerald-400">
                            {inr(r.paid)}
                          </td>
                          <td className="px-3 py-2 text-right font-medium">
                            <span className={r.balance > 0 ? "text-red-600 dark:text-red-400" : ""}>
                              {inr(r.balance)}
                            </span>
                          </td>
                          {canCollect && (
                            <td className="px-3 py-2 text-right">
                              {r.balance > 0 && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setCollectRows([r])}
                                >
                                  <HandCoins className="size-4" /> Collect
                                </Button>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Payment history */}
          <PaymentHistory
            payments={payments}
            onReceipt={openReceipt}
            loading={paymentsQ.isLoading}
          />
        </>
      )}

      {collectRows && (
        <CollectDrawer
          studentId={studentId}
          studentName={detail?.student.name ?? null}
          rows={collectRows}
          onClose={() => setCollectRows(null)}
          onDone={onCollected}
        />
      )}
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: "success" | "danger";
}) {
  const valueCls =
    tone === "danger"
      ? "text-red-600 dark:text-red-400"
      : tone === "success"
        ? "text-emerald-600 dark:text-emerald-400"
        : "";
  return (
    <Card className="p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className={`font-display text-lg font-semibold mt-0.5 ${valueCls}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </Card>
  );
}

function PaymentHistory({
  payments,
  onReceipt,
  loading,
}: {
  payments: PaymentRow[];
  onReceipt: (id: string) => void;
  loading: boolean;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 p-3 border-b">
        <ReceiptIcon className="size-4" />
        <div className="text-sm font-medium">Payment History</div>
        <span className="text-xs text-muted-foreground">
          {payments.length} record{payments.length !== 1 ? "s" : ""}
        </span>
      </div>
      {loading ? (
        <div className="p-4">
          <TableSkeleton rows={4} cols={5} />
        </div>
      ) : payments.length === 0 ? (
        <EmptyState title="No payments yet" hint="Collected payments will appear here." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Fee</th>
                <th className="px-3 py-2 font-medium">Method</th>
                <th className="px-3 py-2 font-medium">Reference</th>
                <th className="px-3 py-2 font-medium">Receipt</th>
                <th className="px-3 py-2 font-medium text-right">Amount</th>
                <th className="px-3 py-2 font-medium text-right"></th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-t hover:bg-muted/20">
                  <td className="px-3 py-2 text-muted-foreground">{fmtDate(p.paidAt)}</td>
                  <td className="px-3 py-2">{p.feeTitle ?? "—"}</td>
                  <td className="px-3 py-2 capitalize">{p.method ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                    {p.reference ?? "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{p.receiptNo ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-medium">{inr(Number(p.amount))}</td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onReceipt(p.id)}
                      aria-label="Open receipt"
                    >
                      <Printer className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ------------------------------ Collect drawer (inline modal) ------------------------------

const METHODS = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "bank", label: "Bank Transfer" },
  { value: "cheque", label: "Cheque" },
];
const NON_CASH = new Set(["upi", "card", "bank", "cheque"]);
type LineInput = { paying: string; discount: string; fine: string };

function CollectDrawer({
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
            <Label>Remarks</Label>
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
