import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell, PageHeader } from "@/components/app-shell";
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
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { apiFetch, apiGet } from "@/lib/api/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { toast } from "sonner";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Check, X, Clock, FileText, Search, Users, Save, RotateCcw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/attendance")({
  validateSearch: (search: Record<string, unknown>): { classId?: string } => ({
    classId: typeof search.classId === "string" ? search.classId : undefined,
  }),
  component: AttendancePage,
});

type Status = "present" | "absent" | "late" | "excused";

const STATUS_META: Record<
  Status,
  { label: string; icon: any; ring: string; solid: string; soft: string; dot: string }
> = {
  present: {
    label: "Present",
    icon: Check,
    ring: "ring-emerald-500",
    solid: "bg-emerald-500 text-white border-emerald-500",
    soft: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
  },
  absent: {
    label: "Absent",
    icon: X,
    ring: "ring-red-500",
    solid: "bg-red-500 text-white border-red-500",
    soft: "bg-red-50 text-red-700 border-red-200",
    dot: "bg-red-500",
  },
  late: {
    label: "Late",
    icon: Clock,
    ring: "ring-amber-500",
    solid: "bg-amber-500 text-white border-amber-500",
    soft: "bg-amber-50 text-amber-700 border-amber-200",
    dot: "bg-amber-500",
  },
  excused: {
    label: "Leave",
    icon: FileText,
    ring: "ring-blue-500",
    solid: "bg-blue-500 text-white border-blue-500",
    soft: "bg-blue-50 text-blue-700 border-blue-200",
    dot: "bg-blue-500",
  },
};

const initials = (name?: string) =>
  (name ?? "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join("") || "?";

function AttendancePage() {
  const { user } = useCurrentUser();
  const qc = useQueryClient();
  const { classId: classIdParam } = Route.useSearch();
  const [classId, setClassId] = useState<string>(classIdParam ?? "");
  const [date, setDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [marks, setMarks] = useState<Record<string, Status>>({});
  const [initial, setInitial] = useState<Record<string, Status>>({});
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | Status>("all");
  const [saving, setSaving] = useState(false);

  const { data: classes } = useQuery({
    enabled: !!user,
    queryKey: ["teacher-attendance-classes", user?.id],
    queryFn: async () => {
      const rows = await apiGet<{ classId: string; name: string; section: string }[]>(
        `/teachers/${user!.id}/classes`,
      );
      return rows.map((r) => ({ id: r.classId, name: r.name, section: r.section }));
    },
  });

  // Default to the deep-linked class if valid, otherwise the first class.
  useEffect(() => {
    if (classes?.length && !classes.some((c) => c.id === classId)) setClassId(classes[0].id);
  }, [classes, classId]);

  const { data: students } = useQuery({
    enabled: !!classId,
    queryKey: ["attendance-students", classId],
    queryFn: async () => {
      const res = await apiGet<{ rows: any[] }>(`/students?classId=${classId}&pageSize=200`);
      return res.rows
        .map((s) => ({
          id: s.id,
          roll_no: s.rollNo,
          admission_no: s.admissionNo,
          profiles: { full_name: s.fullName },
        }))
        .sort((a, b) =>
          (a.roll_no ?? "").localeCompare(b.roll_no ?? "", undefined, { numeric: true }),
        );
    },
  });

  const { data: existing } = useQuery({
    enabled: !!classId && !!date,
    queryKey: ["attendance-existing", classId, date],
    queryFn: async () => {
      const res = await apiGet<{ rows: any[] }>(
        `/attendance?classId=${classId}&from=${date}&to=${date}&pageSize=500`,
      );
      return res.rows.map((r) => ({ student_id: r.studentId, status: r.status }));
    },
  });

  useEffect(() => {
    if (!students) return;
    const seed: Record<string, Status> = {};
    for (const s of students) seed[s.id] = "present";
    for (const r of existing ?? []) seed[r.student_id] = r.status as Status;
    setMarks(seed);
    setInitial(seed);
  }, [students, existing]);

  const setAll = (s: Status) => {
    if (!students) return;
    const next: Record<string, Status> = {};
    for (const st of students) next[st.id] = s;
    setMarks(next);
  };

  const reset = () => setMarks(initial);

  const save = async () => {
    if (!classId || !user) return;
    setSaving(true);
    const entries = Object.entries(marks).map(([studentId, status]) => ({ studentId, status }));
    try {
      await apiFetch("/attendance/mark", {
        method: "POST",
        body: JSON.stringify({ classId, date, entries }),
      });
    } catch (err) {
      setSaving(false);
      return toast.error(err instanceof Error ? err.message : "Could not save");
    }
    setSaving(false);
    toast.success(`Attendance saved for ${entries.length} students`);
    qc.invalidateQueries({ queryKey: ["attendance-existing", classId, date] });
  };

  const counts = useMemo(
    () =>
      Object.values(marks).reduce<Record<string, number>>(
        (a, s) => ({ ...a, [s]: (a[s] || 0) + 1 }),
        {},
      ),
    [marks],
  );
  const total = students?.length ?? 0;
  const presentPct = total ? Math.round(((counts.present ?? 0) / total) * 100) : 0;
  const dirtyCount = useMemo(
    () => Object.keys(marks).filter((k) => marks[k] !== initial[k]).length,
    [marks, initial],
  );
  const isDirty = dirtyCount > 0;
  const isToday = date === format(new Date(), "yyyy-MM-dd");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (students ?? []).filter((s: any) => {
      if (filter !== "all" && marks[s.id] !== filter) return false;
      if (!q) return true;
      return (
        (s.profiles?.full_name ?? "").toLowerCase().includes(q) ||
        (s.roll_no ?? "").toString().toLowerCase().includes(q) ||
        (s.admission_no ?? "").toString().toLowerCase().includes(q)
      );
    });
  }, [students, query, filter, marks]);

  const selectedClass = (classes ?? []).find((c: any) => c.id === classId);

  return (
    <AppShell>
      <PageHeader
        title="Attendance"
        subtitle="Mark daily attendance — tap a status next to each student."
      />

      {/* Controls */}
      <Card className="p-4 md:p-5 rounded-2xl mb-4">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 md:gap-4 md:items-end">
          <div className="space-y-1.5">
            <Label className="text-xs">Class</Label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a class" />
              </SelectTrigger>
              <SelectContent>
                {(classes ?? []).map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                    {c.section && ` · ${c.section}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setAll("present")}>
              Mark all Present
            </Button>
            <Button variant="outline" size="sm" onClick={reset} disabled={!isDirty}>
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Reset
            </Button>
          </div>
        </div>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {(["present", "absent", "late", "excused"] as Status[]).map((st) => {
          const meta = STATUS_META[st];
          const active = filter === st;
          return (
            <button
              key={st}
              onClick={() => setFilter(active ? "all" : st)}
              className={`text-left rounded-2xl border p-4 transition hover:shadow-sm ${active ? `${meta.soft} border-current` : "bg-card"}`}
            >
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
                {meta.label}
              </div>
              <div className="text-2xl font-semibold mt-1">{counts[st] ?? 0}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {total ? Math.round(((counts[st] ?? 0) / total) * 100) : 0}% of class
              </div>
            </button>
          );
        })}
      </div>

      {/* Progress + meta */}
      <Card className="p-4 rounded-2xl mb-4">
        <div className="flex items-center justify-between text-sm mb-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="w-4 h-4" />
            <span>
              {selectedClass
                ? `${selectedClass.name}${selectedClass.section ? ` · ${selectedClass.section}` : ""}`
                : "—"}
            </span>
            <span className="mx-1">•</span>
            <span>{isToday ? "Today" : format(new Date(date), "EEE, dd MMM yyyy")}</span>
          </div>
          <div className="text-sm font-medium">{presentPct}% present</div>
        </div>
        <Progress value={presentPct} className="h-2" />
      </Card>

      {/* Student list */}
      <Card className="rounded-2xl overflow-hidden">
        <div className="p-3 md:p-4 border-b flex flex-col md:flex-row md:items-center gap-3 justify-between">
          <div className="relative w-full md:max-w-xs">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or roll no"
              className="pl-9"
            />
          </div>
          <div className="text-xs text-muted-foreground">
            Showing <span className="font-medium text-foreground">{filtered.length}</span> of{" "}
            {total}
            {filter !== "all" && (
              <button
                className="ml-2 underline underline-offset-2"
                onClick={() => setFilter("all")}
              >
                Clear filter
              </button>
            )}
          </div>
        </div>

        {!students ? (
          <div className="divide-y">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="p-4 flex items-center gap-3 animate-pulse">
                <div className="w-9 h-9 rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-muted rounded w-1/3" />
                  <div className="h-2.5 bg-muted rounded w-1/5" />
                </div>
                <div className="h-8 w-56 bg-muted rounded-full" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground text-sm">
            {total === 0 ? "No students in this class." : "No students match your search."}
          </div>
        ) : (
          <TooltipProvider delayDuration={200}>
            <ul className="divide-y">
              {filtered.map((s: any) => {
                const current = marks[s.id];
                const meta = current ? STATUS_META[current] : null;
                const changed = current && initial[s.id] && current !== initial[s.id];
                return (
                  <li
                    key={s.id}
                    className="p-3 md:p-4 flex items-center gap-3 hover:bg-muted/40 transition"
                  >
                    <Avatar className="w-9 h-9">
                      <AvatarFallback className="text-xs bg-secondary">
                        {initials(s.profiles?.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate flex items-center gap-2">
                        {s.profiles?.full_name ?? "—"}
                        {changed && (
                          <span className="text-[10px] uppercase tracking-wide text-primary">
                            edited
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono">
                        Roll {s.roll_no ?? s.admission_no ?? "—"}
                      </div>
                    </div>
                    {meta && (
                      <span
                        className={`hidden sm:inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${meta.soft}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                        {meta.label}
                      </span>
                    )}
                    <div className="inline-flex rounded-full border bg-background p-0.5">
                      {(["present", "absent", "late", "excused"] as Status[]).map((st) => {
                        const m = STATUS_META[st];
                        const Icon = m.icon;
                        const active = current === st;
                        return (
                          <Tooltip key={st}>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                aria-label={m.label}
                                onClick={() => setMarks((prev) => ({ ...prev, [s.id]: st }))}
                                className={`h-8 w-8 grid place-items-center rounded-full transition ${
                                  active ? m.solid : "text-muted-foreground hover:bg-muted"
                                }`}
                              >
                                <Icon className="w-4 h-4" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>{m.label}</TooltipContent>
                          </Tooltip>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ul>
          </TooltipProvider>
        )}
      </Card>

      {/* Sticky save bar */}
      <div className="sticky bottom-4 mt-4 z-10">
        <div className="mx-auto max-w-3xl rounded-2xl border bg-background/90 backdrop-blur shadow-lg px-4 py-3 flex items-center justify-between gap-3">
          <div className="text-sm">
            {isDirty ? (
              <span>
                <span className="font-semibold">{dirtyCount}</span> unsaved change
                {dirtyCount === 1 ? "" : "s"}
              </span>
            ) : (
              <span className="text-muted-foreground">All changes saved</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={reset} disabled={!isDirty || saving}>
              Discard
            </Button>
            <Button onClick={save} disabled={!students?.length || saving} size="sm">
              <Save className="w-4 h-4 mr-1.5" />
              {saving ? "Saving…" : "Save attendance"}
            </Button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
