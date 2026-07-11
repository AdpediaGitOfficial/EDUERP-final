import { RequireRole } from "@/components/require-role";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell, PageHeader } from "@/components/app-shell";
import { apiFetch, apiGet } from "@/lib/api/client";
import { useCurrentUser } from "@/hooks/use-current-user";
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useState } from "react";
import {
  Plus,
  IndianRupee,
  Smartphone,
  CalendarClock,
  AlertTriangle,
  GraduationCap,
  Wallet,
  TrendingUp,
  CreditCard,
  Landmark,
  CheckCircle2,
} from "lucide-react";
import { format, differenceInCalendarDays } from "date-fns";
import { Printer, Receipt as ReceiptIcon } from "lucide-react";

export const Route = createFileRoute("/_authenticated/fees")({
  component: () => (
    <RequireRole roles={["admin", "parent"]}>
      <FeesPage />
    </RequireRole>
  ),
});

const inr = (n: number | string) =>
  `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const FREQ_LABEL: Record<string, string> = {
  one_time: "One-time",
  monthly: "Monthly",
  quarterly: "Quarterly",
};

const DEMO_UPI_VPA = "greenwoodschool@upi";
const DEMO_UPI_NAME = "Greenwood School";

function statusBadge(s: string) {
  const map: Record<string, string> = {
    paid: "bg-emerald-100 text-emerald-900",
    pending: "bg-amber-100 text-amber-900",
    overdue: "bg-red-100 text-red-900",
    partial: "bg-blue-100 text-blue-900",
  };
  return <Badge className={`${map[s] || ""} capitalize border-0`}>{s}</Badge>;
}

function paymentStatusBadge(s: string) {
  const key = (s || "successful").toLowerCase();
  const cls: Record<string, string> = {
    successful: "bg-emerald-100 text-emerald-900",
    pending: "bg-amber-100 text-amber-900",
    failed: "bg-red-100 text-red-900",
    refunded: "bg-slate-200 text-slate-900",
  };
  const label: Record<string, string> = {
    successful: "Successful",
    pending: "Pending",
    failed: "Failed",
    refunded: "Refunded",
  };
  return <Badge className={`${cls[key] || ""} border-0 gap-1`}>{label[key] || s}</Badge>;
}

function FeesPage() {
  const { user } = useCurrentUser();
  if (!user)
    return (
      <AppShell>
        <div />
      </AppShell>
    );
  if (user.primaryRole === "admin") return <AdminFees />;
  if (user.primaryRole === "parent") return <SelfFees userId={user.id} isParent />;
  return (
    <AppShell>
      <PageHeader title="Fees" subtitle="Fee information isn't available for students." />
      <Card className="p-8 rounded-2xl text-center text-muted-foreground">
        Please ask your parent or guardian to view and pay school fees.
      </Card>
    </AppShell>
  );
}

function AdminFees() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("assignments");
  const [openStructure, setOpenStructure] = useState(false);
  const [openAssign, setOpenAssign] = useState(false);
  const [openPay, setOpenPay] = useState<string | null>(null);
  const [structureClassId, setStructureClassId] = useState("");
  const [assignClassId, setAssignClassId] = useState("");
  const [assignStructureId, setAssignStructureId] = useState("");

  const { data: classes } = useQuery({
    queryKey: ["all-classes-fees"],
    queryFn: () => apiGet<any[]>("/classes"),
  });
  const { data: structures } = useQuery({
    queryKey: ["fee-structures"],
    queryFn: async () => {
      const rows = await apiGet<any[]>("/fees/structures");
      return rows.map((s) => ({
        id: s.id,
        name: s.name,
        class_id: s.classId,
        amount: s.amount,
        term: s.term,
        academic_year: s.academicYear,
        frequency: s.frequency,
        classes: s.className ? { name: s.className } : null,
      }));
    },
  });
  const { data: assignments } = useQuery({
    queryKey: ["fee-assignments"],
    queryFn: async () => {
      const res = await apiGet<{ rows: any[] }>("/fees/assignments?pageSize=200");
      return res.rows.map((r) => ({
        id: r.id,
        student_id: r.studentId,
        title: r.title,
        amount_due: r.amountDue,
        amount_paid: r.amountPaid,
        due_date: r.dueDate,
        status: r.status,
        students: { admission_no: r.admissionNo, profiles: { full_name: r.studentName } },
      }));
    },
  });

  const submitStructure = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await apiFetch("/fees/structures", {
        method: "POST",
        body: JSON.stringify({
          name: String(fd.get("name")),
          classId: structureClassId || undefined,
          amount: Number(fd.get("amount")),
          term: String(fd.get("term") || ""),
          academicYear: String(fd.get("year") || "2025-2026"),
          frequency: String(fd.get("frequency") || "one_time"),
        }),
      });
    } catch (err) {
      return toast.error(err instanceof Error ? err.message : "Could not create");
    }
    toast.success("Fee structure created");
    setOpenStructure(false);
    qc.invalidateQueries({ queryKey: ["fee-structures"] });
  };

  const submitAssign = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (!assignStructureId) return toast.error("Pick a fee structure");
    const dueDate = String(fd.get("due"));
    let assigned = 0;
    try {
      const res = await apiFetch("/fees/assign", {
        method: "POST",
        body: JSON.stringify({
          structureId: assignStructureId,
          dueDate,
          classId: assignClassId || undefined,
        }),
      });
      const body = res ? await res.json() : { assigned: 0 };
      assigned = body.assigned ?? 0;
    } catch (err) {
      return toast.error(err instanceof Error ? err.message : "Could not assign");
    }
    if (assigned === 0) return toast.error("No students to assign to");
    toast.success(`Assigned to ${assigned} student${assigned === 1 ? "" : "s"}`);
    setOpenAssign(false);
    qc.invalidateQueries({ queryKey: ["fee-assignments"] });
    qc.invalidateQueries({ queryKey: ["self-fees"] });
    qc.invalidateQueries({ queryKey: ["parent-dash"] });
  };

  return (
    <AppShell>
      <PageHeader title="Fees" subtitle="Fee structures, assignments, and collections." />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="assignments">Assignments</TabsTrigger>
          <TabsTrigger value="structures">Structures</TabsTrigger>
        </TabsList>
        <TabsContent value="assignments" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Dialog open={openAssign} onOpenChange={setOpenAssign}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="size-4" /> Assign fees
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Assign fee to students</DialogTitle>
                </DialogHeader>
                <form onSubmit={submitAssign} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Fee structure</Label>
                    <Select value={assignStructureId} onValueChange={setAssignStructureId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Pick a structure" />
                      </SelectTrigger>
                      <SelectContent>
                        {(structures ?? []).map((s: any) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name} — {inr(s.amount)} · {FREQ_LABEL[s.frequency] || "One-time"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Assign to class (leave blank for all)</Label>
                    <Select
                      value={assignClassId || "all"}
                      onValueChange={(v) => setAssignClassId(v === "all" ? "" : v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All students</SelectItem>
                        {(classes ?? []).map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                            {c.section && ` · ${c.section}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Due date</Label>
                    <Input name="due" type="date" required />
                  </div>
                  <Button type="submit" className="w-full">
                    Assign
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          <Card className="rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary text-muted-foreground text-left">
                  <tr>
                    <th className="p-3 font-medium">Student</th>
                    <th className="p-3 font-medium">Fee</th>
                    <th className="p-3 font-medium">Due</th>
                    <th className="p-3 font-medium">Amount</th>
                    <th className="p-3 font-medium">Paid</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {(assignments ?? []).map((a: any) => (
                    <tr key={a.id} className="border-t">
                      <td className="p-3 font-medium">
                        {a.students?.profiles?.full_name}{" "}
                        <span className="text-xs text-muted-foreground">
                          {a.students?.admission_no}
                        </span>
                      </td>
                      <td className="p-3">{a.title}</td>
                      <td className="p-3 text-muted-foreground">
                        {format(new Date(a.due_date), "MMM d, yyyy")}
                      </td>
                      <td className="p-3">{inr(a.amount_due)}</td>
                      <td className="p-3">{inr(a.amount_paid)}</td>
                      <td className="p-3">{statusBadge(a.status)}</td>
                      <td className="p-3">
                        {a.status !== "paid" && (
                          <Button size="sm" variant="outline" onClick={() => setOpenPay(a.id)}>
                            <IndianRupee className="size-3.5" /> Record
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {(assignments ?? []).length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-muted-foreground">
                        No fee assignments yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
          <RecordPaymentDialog assignmentId={openPay} onClose={() => setOpenPay(null)} />
        </TabsContent>
        <TabsContent value="structures" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Dialog open={openStructure} onOpenChange={setOpenStructure}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="size-4" /> New structure
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Fee structure</DialogTitle>
                </DialogHeader>
                <form onSubmit={submitStructure} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Name</Label>
                    <Input name="name" required placeholder="Term 1 Tuition" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Amount (₹)</Label>
                      <Input name="amount" type="number" step="0.01" required />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Frequency</Label>
                      <Select name="frequency" defaultValue="one_time">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="one_time">One-time</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                          <SelectItem value="quarterly">Quarterly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Class (optional)</Label>
                    <Select
                      value={structureClassId || "any"}
                      onValueChange={(v) => setStructureClassId(v === "any" ? "" : v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any class</SelectItem>
                        {(classes ?? []).map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                            {c.section && ` · ${c.section}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Term</Label>
                    <Input name="term" placeholder="Term 1" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Academic year</Label>
                    <Input name="year" defaultValue="2025-2026" />
                  </div>
                  <Button type="submit" className="w-full">
                    Save
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(structures ?? []).map((s: any) => (
              <Card key={s.id} className="p-5 rounded-2xl">
                <div className="font-display text-lg font-semibold">{s.name}</div>
                <div className="text-2xl font-semibold mt-2">{inr(s.amount)}</div>
                <div className="mt-1">
                  <Badge variant="secondary" className="capitalize">
                    {FREQ_LABEL[s.frequency] || "One-time"}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-2">
                  {s.classes
                    ? `${s.classes.name}${s.classes.section ? ` · ${s.classes.section}` : ""}`
                    : "Any class"}
                  {s.term && ` · ${s.term}`} · {s.academic_year}
                </div>
              </Card>
            ))}
            {(structures ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">No fee structures yet.</p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function RecordPaymentDialog({
  assignmentId,
  onClose,
}: {
  assignmentId: string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { user } = useCurrentUser();
  const { data: assignment } = useQuery({
    queryKey: ["assignment", assignmentId],
    enabled: !!assignmentId,
    queryFn: async () => {
      // Admin dialog: locate the assignment from the (admin-scoped) list.
      const res = await apiGet<{ rows: any[] }>("/fees/assignments?pageSize=200");
      const r = res.rows.find((x) => x.id === assignmentId);
      return r
        ? { id: r.id, student_id: r.studentId, amount_due: r.amountDue, amount_paid: r.amountPaid }
        : null;
    },
  });
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!assignment || !user) return;
    const fd = new FormData(e.currentTarget);
    try {
      await apiFetch("/payments", {
        method: "POST",
        body: JSON.stringify({
          feeAssignmentId: assignment.id,
          studentId: assignment.student_id,
          amount: Number(fd.get("amount")),
          method: String(fd.get("method")),
          reference: String(fd.get("ref") || ""),
        }),
      });
    } catch (err) {
      return toast.error(err instanceof Error ? err.message : "Could not record");
    }
    toast.success("Payment recorded");
    onClose();
    qc.invalidateQueries({ queryKey: ["fee-assignments"] });
    qc.invalidateQueries({ queryKey: ["payments-list"] });
  };
  return (
    <Dialog open={!!assignmentId} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
        </DialogHeader>
        {assignment && (
          <form onSubmit={submit} className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Balance: {inr(Number(assignment.amount_due) - Number(assignment.amount_paid))}
            </div>
            <div className="space-y-1.5">
              <Label>Amount</Label>
              <Input
                name="amount"
                type="number"
                step="0.01"
                required
                defaultValue={Number(assignment.amount_due) - Number(assignment.amount_paid)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Method</Label>
              <Select name="method" defaultValue="cash">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank">Bank transfer</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Reference</Label>
              <Input name="ref" placeholder="Txn ID / cheque #" />
            </div>
            <Button type="submit" className="w-full">
              Save payment
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SelfFees({ userId, isParent }: { userId: string; isParent: boolean }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["self-fees", userId, isParent],
    queryFn: async () => {
      // /students, /fees/assignments and /payments are all role-scoped by the API
      // (parent -> their children, student -> self), matching the old per-id filter.
      const [studentsRes, assignRes, payRes] = await Promise.all([
        apiGet<{ rows: any[] }>("/students?pageSize=50"),
        apiGet<{ rows: any[] }>("/fees/assignments?pageSize=200"),
        apiGet<{ rows: any[] }>("/payments?pageSize=200"),
      ]);
      const children = studentsRes.rows.map((s) => ({
        id: s.id,
        admission_no: s.admissionNo,
        profiles: { full_name: s.fullName },
        classes: s.class ? { name: s.class.name, section: s.class.section } : null,
      }));
      if (children.length === 0) return { children: [], assignments: [], payments: [] };
      const assignments = assignRes.rows.map((r) => ({
        id: r.id,
        student_id: r.studentId,
        title: r.title,
        amount_due: r.amountDue,
        amount_paid: r.amountPaid,
        due_date: r.dueDate,
        status: r.status,
      }));
      const payments = payRes.rows.map((p) => ({
        id: p.id,
        student_id: p.studentId,
        amount: p.amount,
        method: p.method,
        reference: p.reference,
        paid_at: p.paidAt,
      }));
      return { children, assignments, payments };
    },
    refetchOnWindowFocus: true,
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const children = data?.children ?? [];
  const allAssignments = data?.assignments ?? [];
  const allPayments = data?.payments ?? [];
  const openItems = allAssignments.filter((a: any) => a.status !== "paid");
  const overdue = openItems.filter((a: any) => new Date(a.due_date) < today);
  const totalAnnual = allAssignments.reduce((s: number, a: any) => s + Number(a.amount_due), 0);
  const totalPaid = allAssignments.reduce((s: number, a: any) => s + Number(a.amount_paid), 0);
  const totalDue = totalAnnual - totalPaid;
  const overdueTotal = overdue.reduce(
    (s: number, a: any) => s + Number(a.amount_due) - Number(a.amount_paid),
    0,
  );
  const nextInstallment = openItems
    .filter((a: any) => new Date(a.due_date) >= today)
    .sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())[0];
  const [receipt, setReceipt] = useState<any | null>(null);
  const [payItem, setPayItem] = useState<any | null>(null);

  return (
    <AppShell>
      <PageHeader
        title="Fees"
        subtitle={
          isParent
            ? `Fee overview for ${children.length} child${children.length === 1 ? "" : "ren"}`
            : "Your fees"
        }
      />

      {/* Dashboard cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <Card className="p-4 rounded-2xl bg-stat-indigo text-stat-indigo-foreground">
          <div className="text-xs opacity-80 flex items-center gap-1">
            <Wallet className="size-3.5" /> Total annual
          </div>
          <div className="font-display text-2xl font-semibold mt-1">{inr(totalAnnual)}</div>
        </Card>
        <Card className="p-4 rounded-2xl bg-stat-violet text-stat-violet-foreground">
          <div className="text-xs opacity-80 flex items-center gap-1">
            <TrendingUp className="size-3.5" /> Total paid
          </div>
          <div className="font-display text-2xl font-semibold mt-1">{inr(totalPaid)}</div>
        </Card>
        <Card className="p-4 rounded-2xl bg-stat-coral text-stat-coral-foreground">
          <div className="text-xs opacity-80">Outstanding</div>
          <div className="font-display text-2xl font-semibold mt-1">{inr(totalDue)}</div>
        </Card>
        <Card className="p-4 rounded-2xl bg-stat-sky text-stat-sky-foreground">
          <div className="text-xs opacity-80 flex items-center gap-1">
            <CalendarClock className="size-3.5" /> Upcoming
          </div>
          <div className="font-display text-2xl font-semibold mt-1">
            {nextInstallment
              ? inr(Number(nextInstallment.amount_due) - Number(nextInstallment.amount_paid))
              : "—"}
          </div>
        </Card>
        <Card className="p-4 rounded-2xl border-red-200 bg-red-50">
          <div className="text-xs text-red-900/80 flex items-center gap-1">
            <AlertTriangle className="size-3.5" /> Overdue
          </div>
          <div className="font-display text-2xl font-semibold mt-1 text-red-900">
            {inr(overdueTotal)}
          </div>
        </Card>
      </div>

      {/* Per-child sections */}

      {/* Per-child sections */}
      {children.length === 0 && (
        <Card className="p-8 rounded-2xl text-center text-muted-foreground">
          {isParent
            ? "No children are linked to your account yet."
            : "No student profile is linked to your account yet."}
        </Card>
      )}
      <div className="space-y-6">
        {children.map((child: any) => {
          const cAssignments = allAssignments.filter((a: any) => a.student_id === child.id);
          const cPayments = allPayments.filter((p: any) => p.student_id === child.id);
          return (
            <ChildFeeSection
              key={child.id}
              child={child}
              assignments={cAssignments}
              payments={cPayments}
              onPay={setPayItem}
              onReceipt={setReceipt}
            />
          );
        })}
      </div>

      <ReceiptDialog payment={receipt} onClose={() => setReceipt(null)} />
      <PayDialog
        assignment={payItem}
        userId={userId}
        onClose={() => setPayItem(null)}
        onPaid={() => {
          qc.invalidateQueries({ queryKey: ["self-fees"] });
          qc.invalidateQueries({ queryKey: ["parent-dash"] });
          setPayItem(null);
        }}
      />
    </AppShell>
  );
}

function lateFeeFor(assignment: any) {
  if (assignment.status === "paid") return 0;
  const days = differenceInCalendarDays(new Date(), new Date(assignment.due_date));
  if (days <= 0) return 0;
  const balance = Number(assignment.amount_due) - Number(assignment.amount_paid);
  return Math.min(days * 50, Math.round(balance * 0.1));
}

const ORDINAL = [
  "1st",
  "2nd",
  "3rd",
  "4th",
  "5th",
  "6th",
  "7th",
  "8th",
  "9th",
  "10th",
  "11th",
  "12th",
];
function quarterLabel(index: number, total: number, fallback?: string) {
  const ord = ORDINAL[index] || `${index + 1}th`;
  if (total === 4) return `${ord} Quarter`;
  if (total === 12) return `${ord} Month`;
  if (total === 2) return `${ord} Half`;
  return fallback || `Installment ${index + 1}`;
}

function ChildFeeSection({
  child,
  assignments,
  payments,
  onPay,
  onReceipt,
}: {
  child: any;
  assignments: any[];
  payments: any[];
  onPay: (a: any) => void;
  onReceipt: (p: any) => void;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const totalDue = assignments.reduce((s, a) => s + Number(a.amount_due), 0);
  const totalPaid = assignments.reduce((s, a) => s + Number(a.amount_paid), 0);
  const outstanding = totalDue - totalPaid;
  const openItems = assignments.filter((a) => a.status !== "paid");
  const overdueItems = openItems.filter((a) => new Date(a.due_date) < today);
  const overdueAmt = overdueItems.reduce(
    (s, a) => s + Number(a.amount_due) - Number(a.amount_paid),
    0,
  );
  const nextInstallment = openItems
    .filter((a) => new Date(a.due_date) >= today)
    .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())[0];

  const frequencyLabel = FREQ_LABEL[assignments[0]?.fee_structures?.frequency] || "Quarterly";
  const academicYear = assignments[0]?.fee_structures?.academic_year || "2025-2026";
  const gradeSection = child.classes
    ? `${child.classes.name}${child.classes.section ? ` · ${child.classes.section}` : ""}`
    : "—";
  const overallStatus =
    outstanding <= 0 ? "paid" : overdueAmt > 0 ? "overdue" : totalPaid > 0 ? "partial" : "pending";

  return (
    <Card className="rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b bg-secondary/40">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="size-11 rounded-xl bg-stat-indigo text-stat-indigo-foreground grid place-items-center shrink-0">
              <GraduationCap className="size-5" />
            </div>
            <div className="min-w-0">
              <div className="font-display text-lg font-semibold truncate">
                {child.profiles?.full_name}
              </div>
              <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2">
                <span>Adm. {child.admission_no || "—"}</span>
                <span>·</span>
                <span>{gradeSection}</span>
                <span>·</span>
                <span>{academicYear}</span>
                <span>·</span>
                <span>{frequencyLabel} plan</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">{statusBadge(overallStatus)}</div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
          <MiniFig label="Annual fee" value={inr(totalDue)} />
          <MiniFig label="Paid" value={inr(totalPaid)} tone="ok" />
          <MiniFig
            label="Outstanding"
            value={inr(outstanding)}
            tone={outstanding > 0 ? "warn" : "muted"}
          />
          <MiniFig
            label="Upcoming"
            value={
              nextInstallment
                ? inr(Number(nextInstallment.amount_due) - Number(nextInstallment.amount_paid))
                : "—"
            }
            sub={
              nextInstallment
                ? `Due ${format(new Date(nextInstallment.due_date), "MMM d")}`
                : "All caught up"
            }
          />
          <MiniFig
            label="Overdue"
            value={inr(overdueAmt)}
            tone={overdueAmt > 0 ? "danger" : "muted"}
          />
        </div>
      </div>

      {/* Breakdown */}
      <div className="p-5">
        <div className="text-sm font-medium mb-3 flex items-center gap-1.5">
          <IndianRupee className="size-4" /> Quarterly fee breakdown
        </div>
        {assignments.length === 0 ? (
          <div className="rounded-xl border p-6 text-center text-sm text-muted-foreground">
            No fees have been assigned to this student yet.
          </div>
        ) : (
          <ol className="space-y-3">
            {[...assignments]
              .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
              .map((a, idx) => {
                const bal = Number(a.amount_due) - Number(a.amount_paid);
                const lastPay = payments
                  .filter((p) => p.fee_assignment_id === a.id)
                  .sort((x, y) => new Date(y.paid_at).getTime() - new Date(x.paid_at).getTime())[0];
                const late = lateFeeFor(a);
                const canPay = a.status !== "paid" && bal > 0;
                const label = quarterLabel(idx, assignments.length, a.title);
                return (
                  <li
                    key={a.id}
                    className="rounded-xl border p-4 flex flex-wrap items-center gap-4 hover:bg-secondary/30 transition-colors"
                  >
                    <div className="size-10 rounded-lg bg-stat-indigo/15 text-stat-indigo grid place-items-center font-display font-semibold shrink-0">
                      Q{idx + 1}
                    </div>
                    <div className="min-w-[10rem] flex-1">
                      <div className="font-medium">{label}</div>
                      <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2 mt-0.5">
                        <span className="inline-flex items-center gap-1">
                          <CalendarClock className="size-3" /> Due{" "}
                          {format(new Date(a.due_date), "MMM d, yyyy")}
                        </span>
                        {lastPay && (
                          <span>· Paid {format(new Date(lastPay.paid_at), "MMM d, yyyy")}</span>
                        )}
                        {late > 0 && <span className="text-red-700">· Late fee {inr(late)}</span>}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-display text-lg font-semibold">{inr(a.amount_due)}</div>
                      <div className="text-xs text-muted-foreground">
                        Paid {inr(a.amount_paid)} · Bal {inr(bal)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {statusBadge(a.status)}
                      {canPay && (
                        <Button size="sm" onClick={() => onPay(a)} className="gap-1.5">
                          <Smartphone className="size-3.5" /> Pay now
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
          </ol>
        )}

        {/* Payment history */}
        <div className="text-sm font-medium mt-6 mb-2 flex items-center gap-1.5">
          <ReceiptIcon className="size-4" /> Payment history
        </div>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-muted-foreground text-left">
              <tr>
                <th className="p-3 font-medium">Txn / Receipt</th>
                <th className="p-3 font-medium">Fee</th>
                <th className="p-3 font-medium">Date</th>
                <th className="p-3 font-medium">Method</th>
                <th className="p-3 font-medium">Amount</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="p-3 font-mono text-xs">{p.receipt_no}</td>
                  <td className="p-3 text-muted-foreground">{p.fee_assignments?.title || "—"}</td>
                  <td className="p-3 text-muted-foreground">
                    {format(new Date(p.paid_at), "MMM d, yyyy")}
                  </td>
                  <td className="p-3 capitalize">{p.method}</td>
                  <td className="p-3 font-medium">{inr(p.amount)}</td>
                  <td className="p-3">{paymentStatusBadge(p.status || "successful")}</td>
                  <td className="p-3 text-right">
                    <Button size="sm" variant="outline" onClick={() => onReceipt(p)}>
                      <Printer className="size-3.5" /> Receipt
                    </Button>
                  </td>
                </tr>
              ))}
              {payments.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-muted-foreground">
                    No payments yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}

function MiniFig({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "ok" | "warn" | "danger" | "muted";
}) {
  const cls =
    tone === "ok"
      ? "text-emerald-600"
      : tone === "warn"
        ? "text-amber-600"
        : tone === "danger"
          ? "text-red-600"
          : "";
  return (
    <div className="rounded-xl bg-background p-3 border">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`font-display text-lg font-semibold mt-0.5 ${cls}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function PayDialog({
  assignment,
  userId,
  onClose,
  onPaid,
}: {
  assignment: any | null;
  userId: string;
  onClose: () => void;
  onPaid: () => void;
}) {
  const [method, setMethod] = useState<"upi" | "card" | "netbanking" | "wallet">("upi");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [outcome, setOutcome] = useState<"successful" | "pending" | "failed">("successful");
  // UPI
  const [vpa, setVpa] = useState("");
  // Card
  const [cardName, setCardName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  // Netbanking
  const [bank, setBank] = useState("");
  // Wallet
  const [wallet, setWallet] = useState("");

  const balance = assignment ? Number(assignment.amount_due) - Number(assignment.amount_paid) : 0;
  const payAmount = Number(amount) || balance;
  const txnRef = assignment ? `GW-${assignment.id.slice(0, 8).toUpperCase()}` : "";
  const note = assignment
    ? `${assignment.title} - ${assignment.students?.profiles?.full_name || ""}`.trim()
    : "";
  const upiUrl = assignment
    ? `upi://pay?pa=${encodeURIComponent(DEMO_UPI_VPA)}&pn=${encodeURIComponent(DEMO_UPI_NAME)}&am=${payAmount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(note)}&tr=${encodeURIComponent(txnRef)}`
    : "";
  const qrUrl = upiUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=8&data=${encodeURIComponent(upiUrl)}`
    : "";

  const resetAll = () => {
    setAmount("");
    setVpa("");
    setCardName("");
    setCardNumber("");
    setCardExpiry("");
    setCardCvv("");
    setBank("");
    setWallet("");
  };

  const submit = async () => {
    if (!assignment) return;
    if (payAmount <= 0) return toast.error("Enter a valid amount");
    let reference = "";
    let dbMethod: "cash" | "bank" | "card" | "cheque" | "online" = "online";
    if (method === "upi") {
      if (!vpa.trim()) return toast.error("Enter the UPI ID you paid from");
      reference = `UPI ${vpa.trim()} · ${txnRef}`;
      dbMethod = "online";
    } else if (method === "card") {
      if (
        cardNumber.replace(/\s/g, "").length < 12 ||
        !cardExpiry ||
        cardCvv.length < 3 ||
        !cardName.trim()
      )
        return toast.error("Enter complete card details");
      const last4 = cardNumber.replace(/\s/g, "").slice(-4);
      reference = `Card •••• ${last4} · ${txnRef}`;
      dbMethod = "card";
    } else if (method === "netbanking") {
      if (!bank) return toast.error("Select your bank");
      reference = `NetBanking ${bank} · ${txnRef}`;
      dbMethod = "bank";
    } else if (method === "wallet") {
      if (!wallet) return toast.error("Select a wallet");
      reference = `Wallet ${wallet} · ${txnRef}`;
      dbMethod = "online";
    }
    setSaving(true);
    // Records via the API. NOTE (coexistence): under the extracted RLS the only
    // write policy on payments is pay_admin_all, so a parent/student self-payment
    // is rejected (403) here exactly as it was under Supabase RLS. Enabling true
    // parent self-service payment is a product decision (a gateway webhook that
    // records server-side, or a scoped payments-insert policy) — tracked in
    // BACKEND_MIGRATION_LOG.md. Only the 'successful' outcome maps to a real row.
    let failed = false;
    if (outcome === "successful") {
      try {
        await apiFetch("/payments", {
          method: "POST",
          body: JSON.stringify({
            feeAssignmentId: assignment.id,
            studentId: assignment.student_id,
            amount: payAmount,
            method: dbMethod,
            reference,
          }),
        });
      } catch (err) {
        failed = true;
        toast.error(err instanceof Error ? err.message : "Payment could not be recorded");
      }
    }
    setSaving(false);
    if (failed) return;
    const msg =
      outcome === "successful"
        ? "Payment successful. Receipt available in history."
        : outcome === "pending"
          ? "Payment pending confirmation. It will update once the bank confirms."
          : "Payment failed. Please try again or use another method.";
    (outcome === "failed" ? toast.error : toast.success)(msg);
    resetAll();
    onPaid();
  };

  return (
    <Dialog open={!!assignment} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IndianRupee className="size-4" /> Pay fees online
          </DialogTitle>
        </DialogHeader>
        {assignment && (
          <div className="space-y-4">
            <Card className="p-4 rounded-xl bg-secondary/60">
              <div className="text-xs text-muted-foreground">
                {assignment.students?.profiles?.full_name} · {assignment.title}
              </div>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">Amount due</span>
                <span className="font-display text-2xl font-semibold">{inr(balance)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>Due {format(new Date(assignment.due_date), "MMM d, yyyy")}</span>
                <span>Ref: {txnRef}</span>
              </div>
            </Card>

            <div className="space-y-1.5">
              <Label>Pay amount</Label>
              <Input
                type="number"
                step="0.01"
                placeholder={balance.toFixed(2)}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>

            <Tabs value={method} onValueChange={(v) => setMethod(v as any)}>
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="upi" className="gap-1">
                  <Smartphone className="size-3.5" /> UPI
                </TabsTrigger>
                <TabsTrigger value="card" className="gap-1">
                  <CreditCard className="size-3.5" /> Card
                </TabsTrigger>
                <TabsTrigger value="netbanking" className="gap-1">
                  <Landmark className="size-3.5" /> Net
                </TabsTrigger>
                <TabsTrigger value="wallet" className="gap-1">
                  <Wallet className="size-3.5" /> Wallet
                </TabsTrigger>
              </TabsList>

              <TabsContent value="upi" className="mt-4 space-y-3">
                <div className="rounded-xl border p-4 flex flex-col items-center gap-3 bg-background">
                  {qrUrl && (
                    <img src={qrUrl} alt="UPI QR" className="rounded-lg" width={200} height={200} />
                  )}
                  <div className="text-xs text-muted-foreground text-center">
                    Scan with GPay, PhonePe, Paytm or BHIM · Pay to{" "}
                    <span className="font-mono">{DEMO_UPI_VPA}</span>
                  </div>
                  <Button asChild variant="outline" className="w-full">
                    <a href={upiUrl}>
                      <Smartphone className="size-4" /> Open UPI app
                    </a>
                  </Button>
                </div>
                <div className="space-y-1.5">
                  <Label>Your UPI ID</Label>
                  <Input
                    placeholder="you@upi"
                    value={vpa}
                    onChange={(e) => setVpa(e.target.value)}
                  />
                </div>
              </TabsContent>

              <TabsContent value="card" className="mt-4 space-y-3">
                <div className="space-y-1.5">
                  <Label>Name on card</Label>
                  <Input
                    placeholder="Full name"
                    value={cardName}
                    onChange={(e) => setCardName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Card number</Label>
                  <Input
                    inputMode="numeric"
                    maxLength={19}
                    placeholder="1234 5678 9012 3456"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value.replace(/[^\d ]/g, ""))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Expiry</Label>
                    <Input
                      placeholder="MM/YY"
                      maxLength={5}
                      value={cardExpiry}
                      onChange={(e) => setCardExpiry(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>CVV</Label>
                    <Input
                      inputMode="numeric"
                      maxLength={4}
                      placeholder="•••"
                      value={cardCvv}
                      onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, ""))}
                    />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Supports Visa, Mastercard, RuPay, Amex — credit &amp; debit.
                </p>
              </TabsContent>

              <TabsContent value="netbanking" className="mt-4 space-y-3">
                <div className="space-y-1.5">
                  <Label>Select your bank</Label>
                  <Select value={bank} onValueChange={setBank}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose bank" />
                    </SelectTrigger>
                    <SelectContent>
                      {[
                        "HDFC Bank",
                        "ICICI Bank",
                        "State Bank of India",
                        "Axis Bank",
                        "Kotak Mahindra",
                        "Yes Bank",
                        "IDFC First",
                        "Punjab National Bank",
                        "Bank of Baroda",
                        "Canara Bank",
                      ].map((b) => (
                        <SelectItem key={b} value={b}>
                          {b}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  You'll be redirected to your bank to authorize the payment.
                </p>
              </TabsContent>

              <TabsContent value="wallet" className="mt-4 space-y-3">
                <div className="space-y-1.5">
                  <Label>Select wallet</Label>
                  <Select value={wallet} onValueChange={setWallet}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose wallet" />
                    </SelectTrigger>
                    <SelectContent>
                      {[
                        "Paytm",
                        "PhonePe",
                        "Amazon Pay",
                        "Mobikwik",
                        "Freecharge",
                        "Airtel Payments Bank",
                      ].map((w) => (
                        <SelectItem key={w} value={w}>
                          {w}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </TabsContent>
            </Tabs>

            <Button onClick={submit} disabled={saving} className="w-full">
              {saving ? "Processing…" : `Pay ${inr(payAmount)}`}
            </Button>
            <div className="rounded-lg border border-dashed p-3">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Simulated outcome (demo)
              </Label>
              <Select value={outcome} onValueChange={(v) => setOutcome(v as any)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="successful">Successful</SelectItem>
                  <SelectItem value="pending">Pending (awaiting bank)</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-[11px] text-muted-foreground text-center">
              Secure demo checkout · No real money is charged.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReceiptDialog({ payment, onClose }: { payment: any | null; onClose: () => void }) {
  const printReceipt = () => {
    const el = document.getElementById("receipt-printable");
    if (!el) return;
    const w = window.open("", "_blank", "width=600,height=800");
    if (!w) return;
    w.document.write(
      `<html><head><title>Receipt ${payment?.receipt_no}</title><style>body{font-family:system-ui,sans-serif;padding:32px;color:#111}h1{font-size:20px;margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:16px}td{padding:8px 0;border-bottom:1px solid #eee}td:last-child{text-align:right;font-weight:600}.total{font-size:18px;margin-top:16px;display:flex;justify-content:space-between;border-top:2px solid #111;padding-top:12px}</style></head><body>${el.innerHTML}</body></html>`,
    );
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 250);
  };
  return (
    <Dialog open={!!payment} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Payment receipt</DialogTitle>
        </DialogHeader>
        {payment && (
          <div className="space-y-4">
            <div id="receipt-printable">
              <h1>Payment Receipt</h1>
              <div style={{ color: "#666", fontSize: 13 }}>Receipt #{payment.receipt_no}</div>
              <table>
                <tbody>
                  <tr>
                    <td>Student</td>
                    <td>{payment.students?.profiles?.full_name}</td>
                  </tr>
                  <tr>
                    <td>Admission no.</td>
                    <td>{payment.students?.admission_no || "—"}</td>
                  </tr>
                  <tr>
                    <td>Fee</td>
                    <td>{payment.fee_assignments?.title || "—"}</td>
                  </tr>
                  <tr>
                    <td>Date</td>
                    <td>{format(new Date(payment.paid_at), "MMM d, yyyy p")}</td>
                  </tr>
                  <tr>
                    <td>Method</td>
                    <td style={{ textTransform: "capitalize" }}>{payment.method}</td>
                  </tr>
                  <tr>
                    <td>Reference</td>
                    <td>{payment.reference || "—"}</td>
                  </tr>
                  <tr>
                    <td>Status</td>
                    <td style={{ textTransform: "capitalize" }}>
                      {payment.fee_assignments?.status || "paid"}
                    </td>
                  </tr>
                </tbody>
              </table>
              <div className="total">
                <span>Amount paid</span>
                <span>₹{Number(payment.amount).toFixed(2)}</span>
              </div>
            </div>
            <Button onClick={printReceipt} className="w-full">
              <Printer className="size-4" /> Print / Download PDF
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
