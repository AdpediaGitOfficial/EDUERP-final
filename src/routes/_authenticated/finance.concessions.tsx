import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch, apiPost } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/empty-state";
import { QueryError, TableSkeleton } from "@/components/query-states";
import { useConfirm } from "@/components/confirm-dialog";
import { useCurrentUser } from "@/hooks/use-current-user";
import { inr } from "@/components/fees-collection";
import { fmtDate } from "@/lib/module-util";
import { toast } from "sonner";
import { BadgePercent, Plus, Check, X, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/finance/concessions")({
  component: ConcessionsPage,
});

type Concession = {
  id: string;
  studentId: string;
  studentName: string | null;
  admissionNo: string | null;
  feeAssignmentId: string | null;
  type: "flat" | "percent";
  value: number;
  amount: number;
  reason: string | null;
  status: "pending" | "approved" | "rejected";
  requestedBy: string | null;
  reviewedBy: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

type DueStudent = {
  studentId: string;
  admissionNo: string | null;
  name: string | null;
  className: string | null;
  due: number;
};

const STATUS_TABS: { value: string; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "", label: "All" },
];

function statusBadge(s: Concession["status"]) {
  if (s === "approved")
    return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Approved</Badge>;
  if (s === "rejected")
    return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Rejected</Badge>;
  return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Pending</Badge>;
}

function ConcessionsPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { user } = useCurrentUser();
  const isAdmin = !!user?.roles.includes("admin");
  const [status, setStatus] = useState("pending");
  const [requesting, setRequesting] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["concessions", status],
    queryFn: () =>
      apiGet<Concession[]>(`/fees/concessions${status ? `?status=${status}` : ""}`),
  });
  const rows = data ?? [];
  const invalidate = () => qc.invalidateQueries({ queryKey: ["concessions"] });

  const review = useMutation({
    mutationFn: ({ id, approve, note }: { id: string; approve: boolean; note?: string }) =>
      apiPatch<{ status: string; applied: number }>(
        `/fees/concessions/${id}/${approve ? "approve" : "reject"}`,
        { note },
      ),
    onSuccess: (r) => {
      if (r.status === "approved")
        toast.success(`Approved — ${inr(r.applied)} reduced from dues`);
      else toast.success("Concession rejected");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not review"),
  });

  const approve = async (c: Concession) => {
    if (
      !(await confirm({
        title: `Approve ${inr(c.amount)} concession?`,
        description: `This reduces ${c.studentName ?? "the student"}'s outstanding dues by up to ${inr(c.amount)}. This can't be undone.`,
        confirmText: "Approve",
      }))
    )
      return;
    review.mutate({ id: c.id, approve: true });
  };
  const reject = async (c: Concession) => {
    if (
      !(await confirm({
        title: "Reject this concession?",
        description: `${c.studentName ?? "The student"}'s dues stay unchanged.`,
        confirmText: "Reject",
        destructive: true,
      }))
    )
      return;
    review.mutate({ id: c.id, approve: false });
  };

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex rounded-lg border bg-muted/30 p-0.5">
            {STATUS_TABS.map((t) => (
              <button
                key={t.value}
                onClick={() => setStatus(t.value)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  status === t.value
                    ? "bg-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <Button onClick={() => setRequesting(true)}>
            <Plus className="size-4 mr-1" /> Request concession
          </Button>
        </div>
      </Card>

      <Card className="rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="p-4">
            <TableSkeleton rows={6} cols={6} />
          </div>
        ) : isError ? (
          <QueryError onRetry={() => refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={BadgePercent}
            title="No concessions"
            hint={
              status === "pending"
                ? "No concession requests are awaiting approval."
                : "Nothing to show for this filter."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Student</th>
                  <th className="px-3 py-2 font-medium">Concession</th>
                  <th className="px-3 py-2 font-medium">Reason</th>
                  <th className="px-3 py-2 font-medium">Requested by</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-t hover:bg-muted/20 align-top">
                    <td className="px-3 py-2">
                      <div className="font-medium">{c.studentName ?? "—"}</div>
                      <div className="text-xs text-muted-foreground font-mono">
                        {c.admissionNo ?? "—"}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-semibold text-emerald-700">{inr(c.amount)}</div>
                      <div className="text-xs text-muted-foreground">
                        {c.type === "percent" ? `${c.value}%` : "Flat"}
                        {c.feeAssignmentId ? " · single line" : " · across dues"}
                      </div>
                    </td>
                    <td className="px-3 py-2 max-w-[16rem]">
                      <div className="text-muted-foreground">{c.reason || "—"}</div>
                      {c.reviewNote && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Note: {c.reviewNote}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div>{c.requestedBy ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{fmtDate(c.createdAt)}</div>
                    </td>
                    <td className="px-3 py-2">
                      {statusBadge(c.status)}
                      {c.status !== "pending" && c.reviewedBy && (
                        <div className="text-xs text-muted-foreground mt-1">by {c.reviewedBy}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {c.status === "pending" && isAdmin ? (
                        <div className="inline-flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-emerald-700"
                            disabled={review.isPending}
                            onClick={() => approve(c)}
                            aria-label="Approve concession"
                          >
                            <Check className="size-4 mr-1" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-600"
                            disabled={review.isPending}
                            onClick={() => reject(c)}
                            aria-label="Reject concession"
                          >
                            <X className="size-4 mr-1" /> Reject
                          </Button>
                        </div>
                      ) : c.status === "pending" ? (
                        <span className="text-xs text-muted-foreground">Awaiting admin</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="p-3 border-t text-xs text-muted-foreground">
          {rows.length} concession{rows.length !== 1 ? "s" : ""}
        </div>
      </Card>

      {requesting && (
        <RequestDialog onClose={() => setRequesting(false)} onDone={() => {
          setRequesting(false);
          setStatus("pending");
          invalidate();
        }} />
      )}
    </div>
  );
}

function RequestDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<DueStudent | null>(null);
  const [type, setType] = useState<"flat" | "percent">("flat");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const { data } = useQuery({
    enabled: search.trim().length >= 2 && !picked,
    queryKey: ["concession-student-search", search],
    queryFn: () =>
      apiGet<{ rows: DueStudent[] }>(
        `/fees/collection/students?onlyDue=1&pageSize=8&search=${encodeURIComponent(search.trim())}`,
      ),
  });
  const results = useMemo(() => data?.rows ?? [], [data]);

  const numeric = Number(value) || 0;
  const preview = picked
    ? type === "percent"
      ? Math.min((numeric / 100) * picked.due, picked.due)
      : Math.min(numeric, picked.due)
    : 0;

  const submit = async () => {
    if (!picked || numeric <= 0) return;
    setSaving(true);
    try {
      await apiPost("/fees/concessions", {
        studentId: picked.studentId,
        type,
        value: numeric,
        reason: reason.trim() || undefined,
      });
      toast.success("Concession requested — awaiting admin approval");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not request concession");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Request a fee concession</DialogTitle>
        </DialogHeader>

        {!picked ? (
          <div className="space-y-2">
            <Label>Find a student with dues</Label>
            <div className="relative">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                className="pl-9"
                placeholder="Name or admission no…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="max-h-64 overflow-y-auto rounded-lg border divide-y">
              {results.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground">
                  {search.trim().length < 2
                    ? "Type at least 2 characters."
                    : "No due students match."}
                </div>
              ) : (
                results.map((s) => (
                  <button
                    key={s.studentId}
                    className="w-full flex items-center justify-between gap-2 p-2.5 text-left hover:bg-muted/40"
                    onClick={() => setPicked(s)}
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{s.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {s.admissionNo} · {s.className}
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-red-600">{inr(s.due)}</div>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg bg-muted/40 p-3 flex items-center justify-between">
              <div>
                <div className="font-medium">{picked.name}</div>
                <div className="text-xs text-muted-foreground">
                  {picked.admissionNo} · {picked.className} · Outstanding {inr(picked.due)}
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setPicked(null)}>
                Change
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={type} onValueChange={(v) => setType(v as "flat" | "percent")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="flat">Flat amount (₹)</SelectItem>
                    <SelectItem value="percent">Percent of dues (%)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{type === "percent" ? "Percent" : "Amount"}</Label>
                <Input
                  type="number"
                  min="0"
                  step={type === "percent" ? "1" : "100"}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={type === "percent" ? "e.g. 10" : "e.g. 1000"}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Sibling discount, staff ward, financial hardship…"
              />
            </div>
            <div className="rounded-lg border bg-emerald-50/50 p-2.5 text-sm">
              Concession applied on approval:{" "}
              <span className="font-semibold text-emerald-700">{inr(preview)}</span>
              {preview > 0 && preview >= picked.due && (
                <span className="text-xs text-muted-foreground"> (capped at outstanding)</span>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!picked || numeric <= 0 || saving} onClick={submit}>
            Submit request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
