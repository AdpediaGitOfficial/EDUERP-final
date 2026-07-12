import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
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
import { EmptyState } from "@/components/empty-state";
import { QueryError, TableSkeleton } from "@/components/query-states";
import { Plus, Pencil, Trash2, CalendarDays } from "lucide-react";
import { fmtDate, niceLabel, type Tone } from "@/lib/module-util";

export const Route = createFileRoute("/_authenticated/academics/calendar")({ component: Page });

type Event = {
  id: string;
  title: string;
  description: string | null;
  eventType: string;
  startDate: string;
  endDate: string | null;
  session: string | null;
  source: "calendar" | "holiday";
};

const TYPE_TONE: Record<string, Tone> = {
  exam: "danger",
  event: "info",
  ptm: "warning",
  sports: "success",
  annual_day: "info",
  vacation: "neutral",
  training: "warning",
  holiday: "neutral",
  working_day: "success",
};
const TYPES = ["exam", "event", "ptm", "sports", "annual_day", "vacation", "training", "working_day"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const EMPTY = { title: "", description: "", event_type: "event", start_date: "", end_date: "" };

function Page() {
  const qc = useQueryClient();
  const [typeFilter, setTypeFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Event | null>(null);
  const [form, setForm] = useState<any>(EMPTY);

  const { data: events, isLoading, isError, refetch } = useQuery({
    queryKey: ["academic-calendar"],
    queryFn: () => apiGet<Event[]>("/academics/calendar"),
  });

  const filtered = (events ?? []).filter((e) => typeFilter === "all" || e.eventType === typeFilter);
  const byMonth = useMemo(() => {
    const map = new Map<string, Event[]>();
    for (const e of filtered) {
      const d = new Date(e.startDate);
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["academic-calendar"] });

  const save = useMutation({
    mutationFn: async () => {
      const body = JSON.stringify({
        title: form.title,
        description: form.description || undefined,
        event_type: form.event_type,
        start_date: form.start_date,
        end_date: form.end_date || undefined,
      });
      const res = editing
        ? await apiFetch(`/academics/calendar/${editing.id}`, { method: "PATCH", body })
        : await apiFetch("/academics/calendar", { method: "POST", body });
      if (!res || !res.ok) {
        const b = res ? await res.json().catch(() => null) : null;
        throw new Error(b?.message ?? "Could not save event");
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Event updated" : "Event added");
      setOpen(false);
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/academics/calendar/${id}`, { method: "DELETE" });
      if (!res || !res.ok) throw new Error("Could not delete event");
    },
    onSuccess: () => {
      toast.success("Event deleted");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  };
  const openEdit = (e: Event) => {
    setEditing(e);
    setForm({
      title: e.title,
      description: e.description ?? "",
      event_type: e.eventType,
      start_date: e.startDate.slice(0, 10),
      end_date: e.endDate ? e.endDate.slice(0, 10) : "",
    });
    setOpen(true);
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {[...TYPES, "holiday"].map((t) => (
              <SelectItem key={t} value={t}>
                {niceLabel(t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button size="sm" onClick={openAdd}>
          <Plus className="size-4 mr-1" />
          Add event
        </Button>
      </div>

      {isError ? (
        <Card className="rounded-2xl"><QueryError onRetry={() => refetch()} /></Card>
      ) : isLoading ? (
        <Card className="rounded-2xl overflow-hidden"><TableSkeleton rows={6} cols={4} /></Card>
      ) : byMonth.length === 0 ? (
        <EmptyState icon={CalendarDays} title="No events" hint="Add exams, PTMs, events, vacations and more." />
      ) : (
        <div className="space-y-4">
          {byMonth.map(([key, list]) => {
            const [y, m] = key.split("-");
            return (
              <div key={key}>
                <h4 className="font-semibold text-sm text-muted-foreground mb-2">
                  {MONTHS[Number(m)]} {y}
                </h4>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {list.map((e) => (
                    <Card key={e.id} className="p-3 rounded-xl flex items-start gap-3">
                      <div className="text-center shrink-0 w-11">
                        <div className="text-lg font-bold leading-none">
                          {new Date(e.startDate).getDate()}
                        </div>
                        <div className="text-[10px] text-muted-foreground uppercase">
                          {MONTHS[new Date(e.startDate).getMonth()]}
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm truncate">{e.title}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <StatusBadge tone={TYPE_TONE[e.eventType] ?? "neutral"} label={niceLabel(e.eventType)} />
                          {e.endDate && e.endDate.slice(0, 10) !== e.startDate.slice(0, 10) && (
                            <span className="text-xs text-muted-foreground">→ {fmtDate(e.endDate)}</span>
                          )}
                        </div>
                      </div>
                      {e.source === "calendar" && (
                        <div className="flex flex-col">
                          <Button size="icon" variant="ghost" aria-label={`Edit ${e.title}`} onClick={() => openEdit(e)}>
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" aria-label={`Delete ${e.title}`} onClick={() => remove.mutate(e.id)}>
                            <Trash2 className="size-3.5 text-red-600" />
                          </Button>
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit event" : "Add event"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="col-span-2">
              <Label>
                Title <span className="text-red-500">*</span>
              </Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={form.event_type} onValueChange={(v) => setForm({ ...form, event_type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {niceLabel(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div />
            <div>
              <Label>
                Start date <span className="text-red-500">*</span>
              </Label>
              <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </div>
            <div>
              <Label>End date</Label>
              <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>Description</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={!form.title || !form.start_date}>
              {editing ? "Save changes" : "Add event"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
