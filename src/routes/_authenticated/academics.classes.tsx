import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiGet } from "@/lib/api/client";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useMemo, useState } from "react";
import { Plus, Search, Users, GraduationCap, DoorOpen } from "lucide-react";

// Classes lives inside the Academics workspace (rendered under the Academics
// tab bar). The old top-level /classes route redirects here.
export const Route = createFileRoute("/_authenticated/academics/classes")({
  component: ClassesPage,
});

const CURRENT_YEAR = "2025-2026";

function ClassesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [year, setYear] = useState(CURRENT_YEAR);
  const [gradeFilter, setGradeFilter] = useState("all");
  const [saving, setSaving] = useState(false);
  const [formTeacher, setFormTeacher] = useState<string>("");

  const { data: classes } = useQuery({
    queryKey: ["classes", year],
    queryFn: () => apiGet<any[]>(`/classes?year=${encodeURIComponent(year)}`),
  });

  const { data: years } = useQuery({
    queryKey: ["class-years"],
    queryFn: () => apiGet<string[]>("/classes/years"),
  });

  // Stats + class-teacher names ride along on /classes now (get_class_stats
  // was ported into the API), so derive the same aggregate maps client-side.
  const aggregates = useMemo(() => {
    if (!classes) return undefined;
    const counts: Record<string, number> = {};
    const attMap: Record<string, { t: number; p: number }> = {};
    const teacherByClass: Record<string, string | null> = {};
    for (const c of classes as any[]) {
      counts[c.id] = c.studentCount ?? 0;
      attMap[c.id] = { t: c.attendanceTotal ?? 0, p: c.attendancePresent ?? 0 };
      teacherByClass[c.id] = c.classTeacherName ?? null;
    }
    return { counts, attMap, teacherByClass };
  }, [classes]);

  const { data: allTeachers } = useQuery({
    queryKey: ["classes-form-teachers"],
    queryFn: async () => {
      const opts = await apiGet<{ id: string; fullName: string }[]>("/classes/teacher-options");
      return opts.map((t) => ({ id: t.id, full_name: t.fullName }));
    },
  });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (classes ?? []).filter((c: any) => {
      if (gradeFilter !== "all" && c.name !== gradeFilter) return false;
      if (!term) return true;
      return `${c.name} ${c.section ?? ""}`.toLowerCase().includes(term);
    });
  }, [classes, q, gradeFilter]);

  const gradeOptions = useMemo(
    () => Array.from(new Set((classes ?? []).map((c: any) => c.name))).sort(),
    [classes],
  );

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") || "").trim();
    const section = String(fd.get("section") || "").trim() || null;
    const yr = String(fd.get("year") || CURRENT_YEAR).trim();
    const capRaw = String(fd.get("capacity") || "").trim();
    const room = String(fd.get("room") || "").trim() || null;
    if (!name) return toast.error("Class name is required");
    setSaving(true);
    try {
      await apiFetch("/classes", {
        method: "POST",
        body: JSON.stringify({
          name,
          section: section ?? undefined,
          academicYear: yr,
          capacity: capRaw ? Number(capRaw) : undefined,
          room: room ?? undefined,
          classTeacherId: formTeacher || undefined,
        }),
      });
    } catch (err) {
      setSaving(false);
      return toast.error(err instanceof Error ? err.message : "Could not create class");
    }
    setSaving(false);
    toast.success(`${name}${section ? ` · ${section}` : ""} created`);
    setOpen(false);
    setFormTeacher("");
    qc.invalidateQueries({ queryKey: ["classes"] });
    qc.invalidateQueries({ queryKey: ["class-years"] });
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" /> New class
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New class</DialogTitle>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Grade</Label>
                  <Input name="name" required placeholder="Grade 5" />
                </div>
                <div className="space-y-1.5">
                  <Label>Section</Label>
                  <Input name="section" placeholder="A" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Academic year</Label>
                  <Input name="year" defaultValue={CURRENT_YEAR} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Capacity</Label>
                  <Input name="capacity" type="number" min={1} placeholder="60" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Room</Label>
                <Input name="room" placeholder="Room 5-A" />
              </div>
              <div className="space-y-1.5">
                <Label>Class teacher</Label>
                <Select value={formTeacher} onValueChange={setFormTeacher}>
                  <SelectTrigger>
                    <SelectValue placeholder="Assign later" />
                  </SelectTrigger>
                  <SelectContent>
                    {(allTeachers ?? []).map((t: any) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving…" : "Save class"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="rounded-2xl p-3 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px] space-y-1.5">
            <Label className="text-xs">Search</Label>
            <div className="relative">
              <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Grade or section…"
                className="pl-8"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Academic year</Label>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All years</SelectItem>
                {(years ?? []).map((y) => (
                  <SelectItem key={y} value={y}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Grade</Label>
            <Select value={gradeFilter} onValueChange={setGradeFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All grades</SelectItem>
                {gradeOptions.map((g) => (
                  <SelectItem key={g} value={g}>
                    {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto text-xs text-muted-foreground">
            {filtered.length} of {(classes ?? []).length} sections
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((c: any) => {
          const count = aggregates?.counts[c.id] ?? 0;
          const att = aggregates?.attMap[c.id];
          const attPct = att && att.t ? Math.round((att.p / att.t) * 100) : null;
          const teacherName = aggregates?.teacherByClass[c.id] ?? null;
          return (
            <Link key={c.id} to="/classes/$classId" params={{ classId: c.id }} className="block">
              <Card className="p-5 rounded-2xl hover:border-primary/60 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-display text-lg font-semibold">
                      {c.name}
                      {c.section && <span className="text-muted-foreground"> · {c.section}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      AY {c.academicYear}
                      {c.room && ` · ${c.room}`}
                    </div>
                  </div>
                  {attPct != null && (
                    <span
                      className={`text-xs font-semibold ${attPct >= 90 ? "text-emerald-600" : attPct >= 75 ? "text-amber-600" : "text-red-600"}`}
                    >
                      {attPct}%
                    </span>
                  )}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Users className="size-3.5" /> {count} students
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground truncate">
                    <GraduationCap className="size-3.5" /> {teacherName ?? "Unassigned"}
                  </div>
                </div>
                {c.capacity && (
                  <div className="mt-3 h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div
                      className={`h-full ${count > c.capacity ? "bg-red-500" : count / c.capacity > 0.9 ? "bg-amber-500" : "bg-primary"}`}
                      style={{ width: `${Math.min(100, (count / c.capacity) * 100)}%` }}
                    />
                  </div>
                )}
                {c.capacity && (
                  <div className="mt-1 text-[10px] text-muted-foreground flex items-center gap-1">
                    <DoorOpen className="size-3" /> Capacity {count}/{c.capacity}
                  </div>
                )}
              </Card>
            </Link>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground col-span-full">No classes match.</p>
        )}
      </div>
    </div>
  );
}
