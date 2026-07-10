import { RequireRole } from "@/components/require-role";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell, PageHeader } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
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

export const Route = createFileRoute("/_authenticated/classes")({
  component: () => (
    <RequireRole roles={["admin"]}>
      <ClassesPage />
    </RequireRole>
  ),
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
    queryFn: async () => {
      let query = supabase.from("classes").select("*").order("name").order("section");
      if (year !== "all") query = query.eq("academic_year", year);
      return (await query).data ?? [];
    },
  });

  const { data: years } = useQuery({
    queryKey: ["class-years"],
    queryFn: async () => {
      const { data } = await supabase.from("classes").select("academic_year");
      return Array.from(new Set((data ?? []).map((r) => r.academic_year)))
        .sort()
        .reverse();
    },
  });

  const classIds = useMemo(() => (classes ?? []).map((c: any) => c.id), [classes]);

  const { data: aggregates } = useQuery({
    enabled: classIds.length > 0,
    queryKey: ["classes-agg", classIds.join(",")],
    queryFn: async () => {
      const [{ data: stats }, { data: teacherIds }] = await Promise.all([
        supabase.rpc("get_class_stats", { _class_ids: classIds }),
        supabase.from("classes").select("id, class_teacher_id").in("id", classIds),
      ]);
      const uniqTeachers = Array.from(
        new Set((teacherIds ?? []).map((r: any) => r.class_teacher_id).filter(Boolean)),
      );
      const { data: profs } = uniqTeachers.length
        ? await supabase.from("profiles").select("id,full_name").in("id", uniqTeachers)
        : { data: [] };
      const teacherMap: Record<string, string> = {};
      (profs ?? []).forEach((p: any) => {
        teacherMap[p.id] = p.full_name;
      });

      const counts: Record<string, number> = {};
      const attMap: Record<string, { t: number; p: number }> = {};
      for (const row of (stats ?? []) as any[]) {
        counts[row.class_id] = Number(row.student_count) || 0;
        attMap[row.class_id] = {
          t: Number(row.attendance_total) || 0,
          p: Number(row.attendance_present) || 0,
        };
      }
      const teacherByClass: Record<string, string | null> = {};
      for (const r of teacherIds ?? [])
        teacherByClass[r.id] = r.class_teacher_id ? (teacherMap[r.class_teacher_id] ?? null) : null;
      return { counts, attMap, teacherByClass };
    },
  });

  const { data: allTeachers } = useQuery({
    queryKey: ["classes-form-teachers"],
    queryFn: async () => {
      const { data } = await supabase.from("teacher_classes").select("teacher_id");
      const ids = Array.from(new Set((data ?? []).map((r) => r.teacher_id))).filter(Boolean);
      if (!ids.length) return [];
      const { data: profs } = await supabase
        .from("profiles")
        .select("id,full_name")
        .in("id", ids)
        .order("full_name");
      return profs ?? [];
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
    const { error } = await supabase.from("classes").insert({
      name,
      section,
      academic_year: yr,
      capacity: capRaw ? Number(capRaw) : null,
      room,
      class_teacher_id: formTeacher || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`${name}${section ? ` · ${section}` : ""} created`);
    setOpen(false);
    setFormTeacher("");
    qc.invalidateQueries({ queryKey: ["classes"] });
    qc.invalidateQueries({ queryKey: ["class-years"] });
  };

  return (
    <AppShell>
      <PageHeader
        title="Classes"
        subtitle="Sections running by academic year."
        action={
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
        }
      />

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
                      AY {c.academic_year}
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
    </AppShell>
  );
}
