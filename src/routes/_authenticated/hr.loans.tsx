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
import { EmptyRow } from "@/components/empty-state";
import { Plus, HandCoins, Check, X } from "lucide-react";
import { money, fmtDate, niceLabel, type Tone } from "@/lib/module-util";

export const Route = createFileRoute("/_authenticated/hr/loans")({ component: Page });

type Loan = {
  id: string;
  loan_type: string;
  principal: string;
  interest_rate: string;
  tenure_months: number;
  status: string;
  reason: string | null;
  disbursed_on: string | null;
  created_at: string;
  emi: number;
  totalRepaid: number;
  outstanding: number;
  staff?: { full_name: string; employee_code: string };
};
type Repayment = {
  id: string;
  amount: string;
  paid_on: string;
  installment_no: number | null;
  notes: string | null;
};
type LoanDetail = Loan & {
  repayments: Repayment[];
  staff: { id: string; full_name: string; employee_code: string };
  approver?: { full_name: string } | null;
};
type StaffRow = { id: string; full_name: string; employee_code: string; department: string };

const STATUS_TONE: Record<string, Tone> = {
  pending: "warning",
  approved: "info",
  active: "info",
  closed: "success",
  rejected: "danger",
};

// EMI preview mirrors the server maths.
function emiPreview(principal: number, annualRatePct: number, tenure: number) {
  const n = Math.max(1, Math.round(tenure || 0));
  if (!principal) return 0;
  if (!annualRatePct || annualRatePct <= 0) return Math.round((principal / n) * 100) / 100;
  const r = annualRatePct / 100 / 12;
  return Math.round(((principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)) * 100) / 100;
}

const LOAN_TYPES = ["advance", "personal", "emergency", "festival", "vehicle", "housing"];

function Page() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [q, setQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data: loans } = useQuery({
    queryKey: ["hr-loans"],
    queryFn: () => apiGet<Loan[]>("/hr/loans"),
  });
  const { data: staff } = useQuery({
    queryKey: ["hr-staff-list"],
    queryFn: () => apiGet<StaffRow[]>("/hr/staff"),
  });

  const filtered = (loans ?? []).filter((l) => {
    if (statusFilter !== "all" && l.status !== statusFilter) return false;
    if (!q) return true;
    const t = q.toLowerCase();
    return (
      (l.staff?.full_name ?? "").toLowerCase().includes(t) ||
      (l.staff?.employee_code ?? "").toLowerCase().includes(t)
    );
  });

  const summary = useMemo(() => {
    const active = (loans ?? []).filter((l) => l.status === "active");
    return {
      disbursed: active.reduce((s, l) => s + Number(l.principal), 0),
      outstanding: active.reduce((s, l) => s + l.outstanding, 0),
      activeCount: active.length,
      pendingCount: (loans ?? []).filter((l) => l.status === "pending").length,
    };
  }, [loans]);

  // ── Create form ──
  const [form, setForm] = useState({
    staff_id: "",
    loan_type: "advance",
    principal: "",
    interest_rate: "",
    tenure_months: "12",
    reason: "",
  });
  const previewEmi = emiPreview(
    Number(form.principal),
    Number(form.interest_rate),
    Number(form.tenure_months),
  );

  const create = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/hr/loans", {
        method: "POST",
        body: JSON.stringify({
          staff_id: form.staff_id,
          loan_type: form.loan_type,
          principal: Number(form.principal),
          interest_rate: Number(form.interest_rate) || 0,
          tenure_months: Number(form.tenure_months),
          reason: form.reason || undefined,
        }),
      });
      if (!res || !res.ok) {
        const b = res ? await res.json().catch(() => null) : null;
        throw new Error(b?.message ?? "Could not create loan");
      }
    },
    onSuccess: () => {
      toast.success("Loan request created");
      setAddOpen(false);
      setForm({
        staff_id: "",
        loan_type: "advance",
        principal: "",
        interest_rate: "",
        tenure_months: "12",
        reason: "",
      });
      qc.invalidateQueries({ queryKey: ["hr-loans"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        title="Loans & Advances"
        subtitle="Staff loan requests, approvals, disbursement and repayment tracking."
        action={
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="size-4 mr-1" />
            New loan
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard label="Active disbursed" value={money(summary.disbursed)} />
        <StatCard label="Outstanding" value={money(summary.outstanding)} accent />
        <StatCard label="Active loans" value={String(summary.activeCount)} />
        <StatCard label="Pending approval" value={String(summary.pendingCount)} />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          placeholder="Search by employee…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.keys(STATUS_TONE).map((s) => (
              <SelectItem key={s} value={s}>
                {niceLabel(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="p-3 font-medium">Employee</th>
                <th className="p-3 font-medium">Type</th>
                <th className="p-3 font-medium text-right">Principal</th>
                <th className="p-3 font-medium text-right">EMI</th>
                <th className="p-3 font-medium text-right">Outstanding</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr
                  key={l.id}
                  className="border-t hover:bg-muted/30 cursor-pointer"
                  onClick={() => setDetailId(l.id)}
                >
                  <td className="p-3">
                    <div className="font-medium">{l.staff?.full_name}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {l.staff?.employee_code}
                    </div>
                  </td>
                  <td className="p-3">{niceLabel(l.loan_type)}</td>
                  <td className="p-3 text-right">{money(Number(l.principal))}</td>
                  <td className="p-3 text-right">{money(l.emi)}</td>
                  <td className="p-3 text-right font-medium">{money(l.outstanding)}</td>
                  <td className="p-3">
                    <StatusBadge tone={STATUS_TONE[l.status] ?? "neutral"} label={niceLabel(l.status)} />
                  </td>
                  <td className="p-3 text-right">
                    <Button size="sm" variant="ghost" onClick={() => setDetailId(l.id)}>
                      View
                    </Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <EmptyRow
                  colSpan={7}
                  icon={HandCoins}
                  title="No loans found"
                  hint="Create a loan request to get started."
                />
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Create dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New loan / advance</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <Label>
                Employee <span className="text-red-500">*</span>
              </Label>
              <Select
                value={form.staff_id || undefined}
                onValueChange={(v) => setForm({ ...form, staff_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {(staff ?? []).slice(0, 300).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.full_name} ({s.employee_code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Loan type</Label>
                <Select
                  value={form.loan_type}
                  onValueChange={(v) => setForm({ ...form, loan_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LOAN_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {niceLabel(t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>
                  Principal <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="number"
                  value={form.principal}
                  onChange={(e) => setForm({ ...form, principal: e.target.value })}
                />
              </div>
              <div>
                <Label>Interest rate (% p.a.)</Label>
                <Input
                  type="number"
                  placeholder="0 = interest-free"
                  value={form.interest_rate}
                  onChange={(e) => setForm({ ...form, interest_rate: e.target.value })}
                />
              </div>
              <div>
                <Label>
                  Tenure (months) <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="number"
                  value={form.tenure_months}
                  onChange={(e) => setForm({ ...form, tenure_months: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Reason</Label>
              <Input
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
              />
            </div>
            <div className="rounded-lg bg-muted/40 p-3 flex justify-between">
              <span className="text-muted-foreground">Estimated monthly instalment</span>
              <span className="font-semibold">{money(previewEmi)}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => create.mutate()}
              disabled={
                !form.staff_id || !(Number(form.principal) > 0) || !(Number(form.tenure_months) > 0)
              }
            >
              Create request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {detailId && <LoanDetailDialog id={detailId} onClose={() => setDetailId(null)} />}
    </>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Card className="p-4 rounded-2xl">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-bold mt-1 ${accent ? "text-primary" : ""}`}>{value}</p>
    </Card>
  );
}

function LoanDetailDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: loan } = useQuery({
    queryKey: ["hr-loan", id],
    queryFn: () => apiGet<LoanDetail>(`/hr/loans/${id}`),
  });
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["hr-loan", id] });
    qc.invalidateQueries({ queryKey: ["hr-loans"] });
  };

  const decide = useMutation({
    mutationFn: async (decision: "approved" | "rejected") => {
      const res = await apiFetch(`/hr/loans/${id}/decision`, {
        method: "PATCH",
        body: JSON.stringify({ decision }),
      });
      if (!res || !res.ok) throw new Error("Could not update loan");
    },
    onSuccess: (_d, decision) => {
      toast.success(decision === "approved" ? "Loan approved & disbursed" : "Loan rejected");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const repay = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/hr/loans/${id}/repayments`, {
        method: "POST",
        body: JSON.stringify({ amount: Number(amount), notes: notes || undefined }),
      });
      if (!res || !res.ok) {
        const b = res ? await res.json().catch(() => null) : null;
        throw new Error(b?.message ?? "Could not record repayment");
      }
      return res.json().catch(() => ({}));
    },
    onSuccess: (r: any) => {
      toast.success(r?.closed ? "Repayment recorded — loan fully repaid" : "Repayment recorded");
      setAmount("");
      setNotes("");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {loan ? `${loan.staff.full_name} — ${niceLabel(loan.loan_type)} loan` : "Loan"}
          </DialogTitle>
        </DialogHeader>
        {!loan ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <Fact label="Principal" value={money(Number(loan.principal))} />
              <Fact label="Interest" value={`${Number(loan.interest_rate)}% p.a.`} />
              <Fact label="Tenure" value={`${loan.tenure_months} mo`} />
              <Fact label="EMI" value={money(loan.emi)} />
              <Fact label="Repaid" value={money(loan.totalRepaid)} />
              <Fact label="Outstanding" value={money(loan.outstanding)} accent />
              <Fact
                label="Disbursed"
                value={loan.disbursed_on ? fmtDate(loan.disbursed_on) : "—"}
              />
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <StatusBadge tone={STATUS_TONE[loan.status] ?? "neutral"} label={niceLabel(loan.status)} />
              </div>
            </div>
            {loan.reason && (
              <p className="text-sm">
                <span className="text-muted-foreground">Reason: </span>
                {loan.reason}
              </p>
            )}

            {loan.status === "pending" && (
              <div className="flex gap-2">
                <Button size="sm" onClick={() => decide.mutate("approved")}>
                  <Check className="size-4 mr-1" />
                  Approve & disburse
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => decide.mutate("rejected")}
                >
                  <X className="size-4 mr-1" />
                  Reject
                </Button>
              </div>
            )}

            {loan.status === "active" && (
              <Card className="p-4 rounded-xl">
                <p className="font-medium mb-2">Record repayment</p>
                <div className="flex flex-wrap gap-2">
                  <Input
                    type="number"
                    placeholder={`Amount (EMI ${money(loan.emi)})`}
                    className="max-w-[200px]"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                  <Input
                    placeholder="Notes (optional)"
                    className="max-w-[220px]"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                  <Button
                    onClick={() => repay.mutate()}
                    disabled={!(Number(amount) > 0)}
                  >
                    Record
                  </Button>
                </div>
              </Card>
            )}

            <div>
              <p className="font-medium mb-2">
                Repayment schedule{" "}
                <span className="text-muted-foreground font-normal">
                  ({loan.repayments.length} paid)
                </span>
              </p>
              {loan.repayments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No repayments recorded yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="py-1">#</th>
                      <th className="py-1">Date</th>
                      <th className="py-1 text-right">Amount</th>
                      <th className="py-1">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loan.repayments.map((r) => (
                      <tr key={r.id} className="border-t">
                        <td className="py-1.5">{r.installment_no ?? "—"}</td>
                        <td className="py-1.5">{fmtDate(r.paid_on)}</td>
                        <td className="py-1.5 text-right">{money(Number(r.amount))}</td>
                        <td className="py-1.5 text-muted-foreground">{r.notes ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Fact({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-medium ${accent ? "text-primary" : ""}`}>{value}</p>
    </div>
  );
}
