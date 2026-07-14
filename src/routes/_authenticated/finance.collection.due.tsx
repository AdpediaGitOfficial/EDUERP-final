import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, apiGet } from "@/lib/api/client";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import { downloadCsv } from "@/lib/module-util";
import { toast } from "sonner";
import { BellRing, Download, Mail, MessageCircle, MessageSquare, Smartphone } from "lucide-react";
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

export const Route = createFileRoute("/_authenticated/finance/collection/due")({
  component: DuePage,
});

type DueRow = {
  studentId: string;
  admissionNo: string | null;
  name: string | null;
  className: string | null;
  parentName: string | null;
  parentPhone: string | null;
  parentEmail: string | null;
  due: number;
  daysOverdue: number;
};
type DueList = {
  total: number;
  totals: { due: number; students: number };
  summary?: {
    studentsDue: number;
    totalDemand: number;
    collected: number;
    discount: number;
    outstanding: number;
  };
  rows: DueRow[];
};

// Due-date windows → the last date a fee is "due by" (due_date <= value).
const DUE_WINDOWS = [
  { value: "all", label: "Full Due (All Time)" },
  { value: "this-month", label: "Due This Month" },
  { value: "this-quarter", label: "Due This Quarter" },
  { value: "next-6m", label: "Due Next 6 Months" },
  { value: "custom", label: "Custom Demand Date" },
] as const;

const iso = (d: Date) => d.toISOString().slice(0, 10);
function windowToDate(w: string): string {
  const now = new Date();
  if (w === "this-month") return iso(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  if (w === "this-quarter") {
    const q = Math.floor(now.getMonth() / 3);
    return iso(new Date(now.getFullYear(), q * 3 + 3, 0));
  }
  if (w === "next-6m") return iso(new Date(now.getFullYear(), now.getMonth() + 6, now.getDate()));
  return "";
}

const CHANNELS = [
  { value: "sms", label: "SMS", icon: Smartphone },
  { value: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { value: "email", label: "Email", icon: Mail },
  { value: "in_app", label: "In-app", icon: MessageSquare },
] as const;

function DuePage() {
  const [filters, setFilters] = useState<Filters>({ ...emptyFilters });
  const [dueWindow, setDueWindow] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [remindFor, setRemindFor] = useState<DueRow[] | null>(null);
  const { data: options } = useFilterOptions();

  const applyWindow = (w: string) => {
    setDueWindow(w);
    if (w !== "custom") setFilters((f) => ({ ...f, dueDate: windowToDate(w) }));
  };

  const q = useQuery<DueList>({
    queryKey: ["fees-collection", "due", filters],
    queryFn: () =>
      apiGet<DueList>(`/fees/collection/students${filtersToQuery(filters, { onlyDue: "1" })}`),
  });

  const rows = q.data?.rows ?? [];
  const selectedRows = useMemo(
    () => rows.filter((r) => selected.has(r.studentId)),
    [rows, selected],
  );

  const toggle = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleAll = () =>
    setSelected((prev) =>
      rows.every((r) => prev.has(r.studentId)) ? new Set() : new Set(rows.map((r) => r.studentId)),
    );

  return (
    <div>
      <PageHeader
        title="Due Fees"
        subtitle="Every student with pending fees — remind parents individually or in bulk."
        action={<CollectionSubNav active="due" />}
      />

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5 mb-4">
        <CollectStat label="Students (Due)" value={String(q.data?.summary?.studentsDue ?? 0)} />
        <CollectStat label="Total Demand" value={inr(q.data?.summary?.totalDemand ?? 0)} />
        <CollectStat
          label="Collected"
          value={inr(q.data?.summary?.collected ?? 0)}
          tone="success"
        />
        <CollectStat label="Discount" value={inr(q.data?.summary?.discount ?? 0)} />
        <CollectStat
          label="Outstanding"
          value={inr(q.data?.summary?.outstanding ?? 0)}
          tone="danger"
        />
      </div>

      <div className="mb-4 flex flex-col lg:flex-row lg:items-end gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Filter due date</Label>
          <Select value={dueWindow} onValueChange={applyWindow}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DUE_WINDOWS.map((w) => (
                <SelectItem key={w.value} value={w.value}>
                  {w.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1">
          <FilterBar value={filters} onChange={setFilters} options={options} />
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-2 p-3 border-b">
          <div className="text-sm font-medium">Outstanding dues</div>
          <div className="flex items-center gap-2">
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
                    Parent: r.parentName ?? "",
                    Phone: r.parentPhone ?? "",
                    Email: r.parentEmail ?? "",
                    Due: r.due,
                    DaysOverdue: r.daysOverdue,
                  })),
                  "due-fees",
                )
              }
            >
              <Download className="size-4" /> Export
            </Button>
            <Button
              size="sm"
              disabled={selectedRows.length === 0}
              onClick={() => setRemindFor(selectedRows)}
            >
              <BellRing className="size-4" /> Send Reminder ({selectedRows.length})
            </Button>
          </div>
        </div>

        {q.isLoading ? (
          <div className="p-4">
            <TableSkeleton rows={6} cols={6} />
          </div>
        ) : q.isError ? (
          <div className="p-4">
            <QueryError onRetry={() => q.refetch()} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title="No dues" hint="No students with pending fees match the filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr className="text-left">
                  <th className="px-3 py-2 w-8">
                    <Checkbox
                      checked={rows.length > 0 && rows.every((r) => selected.has(r.studentId))}
                      onCheckedChange={toggleAll}
                      aria-label="Select all"
                    />
                  </th>
                  <th className="px-3 py-2 font-medium">Admission No</th>
                  <th className="px-3 py-2 font-medium">Student</th>
                  <th className="px-3 py-2 font-medium">Class</th>
                  <th className="px-3 py-2 font-medium">Parent</th>
                  <th className="px-3 py-2 font-medium text-right">Due</th>
                  <th className="px-3 py-2 font-medium text-right">Overdue</th>
                  <th className="px-3 py-2 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.studentId} className="border-t hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <Checkbox
                        checked={selected.has(r.studentId)}
                        onCheckedChange={() => toggle(r.studentId)}
                        aria-label={`Select ${r.name ?? "student"}`}
                      />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{r.admissionNo ?? "—"}</td>
                    <td className="px-3 py-2 font-medium">{r.name ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.className ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      <div>{r.parentName ?? "—"}</div>
                      <div className="text-xs">{r.parentPhone ?? r.parentEmail ?? ""}</div>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-red-600 dark:text-red-400">
                      {inr(r.due)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {r.daysOverdue > 0 ? (
                        <span className="text-amber-600 dark:text-amber-400">{r.daysOverdue}d</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button size="sm" variant="outline" onClick={() => setRemindFor([r])}>
                        <BellRing className="size-4" /> Remind
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {remindFor && <ReminderModal rows={remindFor} onClose={() => setRemindFor(null)} />}
    </div>
  );
}

function ReminderModal({ rows, onClose }: { rows: DueRow[]; onClose: () => void }) {
  const [channels, setChannels] = useState<Set<string>>(new Set(["in_app"]));
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const toggleChannel = (c: string) =>
    setChannels((prev) => {
      const n = new Set(prev);
      if (n.has(c)) n.delete(c);
      else n.add(c);
      return n;
    });

  const send = async () => {
    if (channels.size === 0) return toast.error("Choose at least one channel.");
    setSending(true);
    try {
      const r = await apiFetch("/fees/collection/reminders", {
        method: "POST",
        body: JSON.stringify({
          studentIds: rows.map((x) => x.studentId),
          channels: Array.from(channels),
          message: message.trim() || undefined,
        }),
      });
      const res = r ? await r.json() : null;
      toast.success(
        `Reminder sent to ${rows.length} parent${rows.length !== 1 ? "s" : ""} across ${channels.size} channel${channels.size !== 1 ? "s" : ""}.`,
      );
      void res;
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send reminders.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BellRing className="size-4" /> Send Payment Reminder
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-lg bg-secondary/60 px-4 py-3 text-sm">
          Reminding{" "}
          <span className="font-semibold">
            {rows.length} parent{rows.length !== 1 ? "s" : ""}
          </span>{" "}
          about{" "}
          <span className="font-semibold text-red-600 dark:text-red-400">
            {inr(rows.reduce((s, r) => s + r.due, 0))}
          </span>{" "}
          in pending fees.
        </div>

        <div className="space-y-2">
          <Label>Channels</Label>
          <div className="grid grid-cols-2 gap-2">
            {CHANNELS.map((c) => {
              const on = channels.has(c.value);
              const Icon = c.icon;
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => toggleChannel(c.value)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                    on
                      ? "border-primary bg-primary/10 text-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <Checkbox checked={on} className="pointer-events-none" />
                  <Icon className="size-4" /> {c.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Message</Label>
          <Textarea
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Leave blank for the default reminder. Use {name} and {amount} as placeholders."
          />
          <p className="text-[11px] text-muted-foreground">
            Placeholders <code>{"{name}"}</code> and <code>{"{amount}"}</code> are filled per
            student.
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={send} disabled={sending}>
            {sending ? "Sending…" : "Send Reminder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
