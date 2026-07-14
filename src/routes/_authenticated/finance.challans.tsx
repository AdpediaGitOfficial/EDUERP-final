import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiFileObjectUrl, apiGet, apiPatch, apiPost } from "@/lib/api/client";
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
import { EmptyState } from "@/components/empty-state";
import { QueryError, TableSkeleton } from "@/components/query-states";
import { useConfirm } from "@/components/confirm-dialog";
import { inr } from "@/components/fees-collection";
import { fmtDate } from "@/lib/module-util";
import { toast } from "sonner";
import { FileText, Plus, Printer, Send, Ban, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/finance/challans")({
  component: ChallansPage,
});

type Challan = {
  id: string;
  challanNo: string;
  studentName: string | null;
  admissionNo: string | null;
  className: string | null;
  title: string | null;
  status: string;
  total: number;
  items?: number;
  dueDate: string | null;
  createdAt: string;
};
type DueStudent = {
  studentId: string;
  admissionNo: string | null;
  name: string | null;
  className: string | null;
  due: number;
};

function ChallansPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [gen, setGen] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["challans"],
    queryFn: () => apiGet<{ rows: Challan[] }>("/fees/challans?pageSize=100"),
  });
  const rows = data?.rows ?? [];
  const invalidate = () => qc.invalidateQueries({ queryKey: ["challans"] });

  const openPdf = async (c: Challan) => {
    const url = await apiFileObjectUrl(`/fees/challans/${c.id}/pdf`);
    if (url) window.open(url, "_blank");
    else toast.error("Could not open the challan.");
  };
  const send = useMutation({
    mutationFn: (c: Challan) => apiPost<{ notified: number }>(`/fees/challans/${c.id}/send`, {}),
    onSuccess: (r) =>
      toast.success(
        r.notified
          ? `Sent to ${r.notified} parent${r.notified !== 1 ? "s" : ""}`
          : "No parent inbox to notify",
      ),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not send"),
  });
  const cancel = async (c: Challan) => {
    if (
      !(await confirm({
        title: `Cancel challan ${c.challanNo}?`,
        description: "The voucher will be marked cancelled. This does not change any payments.",
        confirmText: "Cancel challan",
        destructive: true,
      }))
    )
      return;
    try {
      await apiPatch(`/fees/challans/${c.id}/cancel`, {});
      toast.success("Challan cancelled");
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not cancel");
    }
  };

  const statusBadge = (s: string) =>
    s === "cancelled" ? (
      <Badge className="bg-slate-100 text-slate-600 border-0">Cancelled</Badge>
    ) : s === "paid" ? (
      <Badge className="bg-emerald-100 text-emerald-700 border-0">Paid</Badge>
    ) : (
      <Badge className="bg-amber-100 text-amber-700 border-0">Generated</Badge>
    );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {rows.length} challan{rows.length !== 1 ? "s" : ""}
        </div>
        <Button size="sm" onClick={() => setGen(true)}>
          <Plus className="size-4 mr-1" /> Generate challan
        </Button>
      </div>

      <Card className="rounded-2xl overflow-hidden">
        {isError ? (
          <QueryError onRetry={() => refetch()} />
        ) : isLoading ? (
          <div className="p-4">
            <TableSkeleton rows={6} cols={5} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No challans yet"
            hint="Generate a challan to give a parent a payable voucher for outstanding fees."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Challan No</th>
                  <th className="px-3 py-2 font-medium">Student</th>
                  <th className="px-3 py-2 font-medium">Class</th>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Pay By</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium text-right">Amount</th>
                  <th className="px-3 py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-t hover:bg-muted/20">
                    <td className="px-3 py-2 font-mono text-xs">{c.challanNo}</td>
                    <td className="px-3 py-2 font-medium">{c.studentName ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{c.className ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{fmtDate(c.createdAt)}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {c.dueDate ? fmtDate(c.dueDate) : "—"}
                    </td>
                    <td className="px-3 py-2">{statusBadge(c.status)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{inr(c.total)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => openPdf(c)}
                          aria-label="Print / download"
                          title="Print / download"
                        >
                          <Printer className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => send.mutate(c)}
                          disabled={c.status === "cancelled"}
                          aria-label="Send to parent"
                          title="Send to parent"
                        >
                          <Send className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => cancel(c)}
                          disabled={c.status === "cancelled"}
                          aria-label="Cancel"
                          title="Cancel"
                        >
                          <Ban className="size-4 text-red-500" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {gen && (
        <GenerateDialog
          onClose={() => setGen(false)}
          onDone={() => {
            setGen(false);
            invalidate();
          }}
        />
      )}
    </div>
  );
}

function GenerateDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<DueStudent | null>(null);
  const [title, setTitle] = useState("Outstanding Dues");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const { data } = useQuery({
    enabled: search.trim().length >= 2 && !picked,
    queryKey: ["challan-student-search", search],
    queryFn: () =>
      apiGet<{ rows: DueStudent[] }>(
        `/fees/collection/students?onlyDue=1&pageSize=8&search=${encodeURIComponent(search.trim())}`,
      ),
  });
  const results = useMemo(() => data?.rows ?? [], [data]);

  const generate = async (print: boolean) => {
    if (!picked) return;
    setSaving(true);
    try {
      const res = await apiFetch("/fees/challans", {
        method: "POST",
        body: JSON.stringify({
          studentId: picked.studentId,
          title: title.trim() || undefined,
          dueDate: dueDate || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      const body = res ? await res.json() : null;
      if (!res || !res.ok) throw new Error(body?.message ?? "Could not generate challan");
      toast.success(`Challan ${body.challanNo} generated (${inr(body.total)})`);
      if (print) {
        const url = await apiFileObjectUrl(`/fees/challans/${body.id}/pdf`);
        if (url) window.open(url, "_blank");
      }
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not generate challan");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Generate fee challan</DialogTitle>
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
                  {picked.admissionNo} · {picked.className} · Due {inr(picked.due)}
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setPicked(null)}>
                Change
              </Button>
            </div>
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Pay by (optional)</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">
              The challan bills all of this student's outstanding fee lines.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="secondary" disabled={!picked || saving} onClick={() => generate(false)}>
            {saving ? "Generating…" : "Generate"}
          </Button>
          <Button disabled={!picked || saving} onClick={() => generate(true)}>
            <Printer className="size-4" /> Generate &amp; Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
