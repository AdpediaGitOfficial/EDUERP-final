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
import { EmptyState } from "@/components/empty-state";
import { QueryError, TableSkeleton } from "@/components/query-states";
import { Plus, Trash2, CalendarClock, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/academics/timetable")({ component: Page });

type ClassRow = { id: string; name: string; section: string | null; academicYear: string };
type Slot = {
  id: string;
  classId: string;
  subjectId: string | null;
  subjectName: string | null;
  teacherId: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room: string | null;
};
type Subject = { id: string; name: string };
type TeacherOption = { id: string; fullName: string };
type Room = { id: string; room_number: string };

const DAYS = [
  { n: 1, label: "Monday" },
  { n: 2, label: "Tuesday" },
  { n: 3, label: "Wednesday" },
  { n: 4, label: "Thursday" },
  { n: 5, label: "Friday" },
  { n: 6, label: "Saturday" },
  { n: 0, label: "Sunday" },
];

function hhmm(t: string | null) {
  if (!t) return "—";
  // API returns ISO or "HH:MM:SS" — normalise to HH:MM
  const m = String(t).match(/(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : String(t);
}

function Page() {
  const qc = useQueryClient();
  const [classId, setClassId] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    day_of_week: "1",
    start_time: "09:00",
    end_time: "09:45",
    subject_id: "",
    teacher_id: "",
    room: "",
  });

  const { data: classes } = useQuery({
    queryKey: ["academic-classes-all"],
    queryFn: () => apiGet<ClassRow[]>("/classes"),
  });
  const {
    data: slots,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["timetable", classId],
    queryFn: () => apiGet<Slot[]>(`/timetable?classId=${classId}`),
    enabled: !!classId,
  });
  const { data: subjects } = useQuery({
    queryKey: ["academic-subjects", classId],
    queryFn: () => apiGet<Subject[]>(`/subjects?classId=${classId}`),
    enabled: !!classId,
  });
  const { data: teachers } = useQuery({
    queryKey: ["teacher-options"],
    queryFn: () => apiGet<TeacherOption[]>("/classes/teacher-options"),
  });
  const { data: rooms } = useQuery({
    queryKey: ["academic-rooms"],
    queryFn: () => apiGet<Room[]>("/academics/rooms"),
  });

  const classLabel = (c: ClassRow) =>
    `${c.name}${c.section ? ` ${c.section}` : ""} · ${c.academicYear}`;
  const byDay = useMemo(() => {
    const map = new Map<number, Slot[]>();
    for (const s of slots ?? []) {
      const arr = map.get(s.dayOfWeek) ?? [];
      arr.push(s);
      map.set(s.dayOfWeek, arr);
    }
    for (const arr of map.values())
      arr.sort((a, b) => hhmm(a.startTime).localeCompare(hhmm(b.startTime)));
    return map;
  }, [slots]);

  // Live conflict preview.
  const { data: conflictCheck } = useQuery({
    queryKey: ["tt-conflict", classId, form],
    queryFn: async () => {
      const res = await apiFetch("/timetable/check-conflicts", {
        method: "POST",
        body: JSON.stringify({
          class_id: classId,
          day_of_week: Number(form.day_of_week),
          start_time: form.start_time,
          end_time: form.end_time,
          teacher_id: form.teacher_id || undefined,
          room: form.room || undefined,
        }),
      });
      if (!res || !res.ok)
        return { hasConflict: false, conflicts: { teacher: [], room: [], class: [] } };
      return res.json();
    },
    enabled: open && !!classId && form.start_time < form.end_time,
  });

  const create = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/timetable", {
        method: "POST",
        body: JSON.stringify({
          class_id: classId,
          day_of_week: Number(form.day_of_week),
          start_time: form.start_time,
          end_time: form.end_time,
          subject_id: form.subject_id || undefined,
          teacher_id: form.teacher_id || undefined,
          room: form.room || undefined,
        }),
      });
      if (!res || !res.ok) {
        const b = res ? await res.json().catch(() => null) : null;
        throw new Error(b?.message ?? "Could not add slot");
      }
    },
    onSuccess: () => {
      toast.success("Slot added");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["timetable", classId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/timetable/${id}`, { method: "DELETE" });
      if (!res || !res.ok) throw new Error("Could not delete slot");
    },
    onSuccess: () => {
      toast.success("Slot removed");
      qc.invalidateQueries({ queryKey: ["timetable", classId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const subjectName = (id: string | null) =>
    (subjects ?? []).find((s) => s.id === id)?.name ?? null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h3 className="font-semibold">Timetable builder</h3>
        <div className="flex-1" />
        <Select value={classId || undefined} onValueChange={setClassId}>
          <SelectTrigger className="w-72">
            <SelectValue placeholder="Select a class-section" />
          </SelectTrigger>
          <SelectContent>
            {(classes ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {classLabel(c)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={() => setOpen(true)} disabled={!classId}>
          <Plus className="size-4 mr-1" />
          Add slot
        </Button>
      </div>

      {!classId ? (
        <EmptyState
          icon={CalendarClock}
          title="Pick a class"
          hint="Select a class-section to build its weekly timetable."
        />
      ) : isError ? (
        <Card className="rounded-2xl">
          <QueryError onRetry={() => refetch()} />
        </Card>
      ) : isLoading ? (
        <Card className="rounded-2xl overflow-hidden">
          <TableSkeleton rows={6} cols={4} />
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {DAYS.map((d) => {
            const daySlots = byDay.get(d.n) ?? [];
            return (
              <Card key={d.n} className="rounded-2xl p-4">
                <h4 className="font-semibold mb-2">{d.label}</h4>
                {daySlots.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No classes.</p>
                ) : (
                  <div className="space-y-2">
                    {daySlots.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                      >
                        <div className="text-xs font-mono text-muted-foreground w-24 shrink-0">
                          {hhmm(s.startTime)}–{hhmm(s.endTime)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate">
                            {s.subjectName ?? subjectName(s.subjectId) ?? "—"}
                          </div>
                          {s.room && (
                            <div className="text-xs text-muted-foreground">Room {s.room}</div>
                          )}
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Remove slot"
                          onClick={() => remove.mutate(s.id)}
                        >
                          <Trash2 className="size-4 text-red-600" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add timetable slot</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <Label>Day</Label>
              <Select
                value={form.day_of_week}
                onValueChange={(v) => setForm({ ...form, day_of_week: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAYS.map((d) => (
                    <SelectItem key={d.n} value={String(d.n)}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div />
            <div>
              <Label>Start</Label>
              <Input
                type="time"
                value={form.start_time}
                onChange={(e) => setForm({ ...form, start_time: e.target.value })}
              />
            </div>
            <div>
              <Label>End</Label>
              <Input
                type="time"
                value={form.end_time}
                onChange={(e) => setForm({ ...form, end_time: e.target.value })}
              />
            </div>
            <div>
              <Label>Subject</Label>
              <Select
                value={form.subject_id || undefined}
                onValueChange={(v) => setForm({ ...form, subject_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {(subjects ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Teacher</Label>
              <Select
                value={form.teacher_id || undefined}
                onValueChange={(v) => setForm({ ...form, teacher_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {(teachers ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Room</Label>
              <Select
                value={form.room || undefined}
                onValueChange={(v) => setForm({ ...form, room: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {(rooms ?? []).map((r) => (
                    <SelectItem key={r.id} value={r.room_number}>
                      {r.room_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {conflictCheck?.hasConflict && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-300 p-2.5 text-sm flex items-start gap-2">
              <AlertTriangle className="size-4 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-amber-800">Scheduling conflict</p>
                <p className="text-xs text-amber-700">
                  {[
                    ...(conflictCheck.conflicts.teacher.length
                      ? [`Teacher: ${conflictCheck.conflicts.teacher[0]}`]
                      : []),
                    ...(conflictCheck.conflicts.room.length
                      ? [`Room: ${conflictCheck.conflicts.room[0]}`]
                      : []),
                    ...(conflictCheck.conflicts.class.length
                      ? [`Class: ${conflictCheck.conflicts.class[0]}`]
                      : []),
                  ].join(" · ")}
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => create.mutate()}
              disabled={form.start_time >= form.end_time || conflictCheck?.hasConflict}
            >
              Add slot
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
