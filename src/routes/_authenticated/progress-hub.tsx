import { RequireRole } from "@/components/require-role";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { apiGet, apiFetch } from "@/lib/api/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import { Search, Plus, FileText, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/progress-hub")({
  component: () => (
    <RequireRole roles={["admin", "teacher"]}>
      <Page />
    </RequireRole>
  ),
});

const TONE_META: Record<string, string> = {
  positive: "bg-emerald-100 text-emerald-900",
  neutral: "bg-slate-100 text-slate-900",
  concern: "bg-amber-100 text-amber-900",
};

function Page() {
  const { user } = useCurrentUser();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [openNote, setOpenNote] = useState(false);
  const [noteStudent, setNoteStudent] = useState("");
  const [tone, setTone] = useState("positive");

  const { data: students } = useQuery({
    queryKey: ["ph-students"],
    queryFn: () => apiGet<any[]>("/progress/students"),
  });

  const { data: notes } = useQuery({
    queryKey: ["ph-notes"],
    queryFn: () => apiGet<any[]>("/progress/notes"),
  });

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return (students ?? []).slice(0, 20);
    return (students ?? [])
      .filter(
        (s: any) =>
          (s.full_name ?? "").toLowerCase().includes(t) ||
          (s.admission_no ?? "").toLowerCase().includes(t),
      )
      .slice(0, 30);
  }, [students, q]);

  const submitNote = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user || !noteStudent) return toast.error("Pick a student");
    const fd = new FormData(e.currentTarget);
    const res = await apiFetch("/progress/notes", {
      method: "POST",
      body: JSON.stringify({ student_id: noteStudent, note: String(fd.get("note") || ""), tone }),
    });
    if (!res || !res.ok) {
      const b = res ? await res.json().catch(() => null) : null;
      return toast.error(b?.message ?? "Could not add note");
    }
    toast.success("Note added");
    setOpenNote(false);
    setNoteStudent("");
    qc.invalidateQueries({ queryKey: ["ph-notes"] });
  };

  const byDay = useMemo(() => {
    const g = new Map<string, any[]>();
    for (const n of notes ?? []) {
      const day = format(new Date(n.note_date), "EEE, dd MMM yyyy");
      if (!g.has(day)) g.set(day, []);
      g.get(day)!.push(n);
    }
    return Array.from(g.entries());
  }, [notes]);

  return (
    <AppShell>
      <PageHeader
        title="Progress Reports Hub"
        subtitle="Search a student to open their detailed report, or log a day-wise progress note."
        action={
          <Dialog open={openNote} onOpenChange={setOpenNote}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4" /> New note
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Day-wise progress note</DialogTitle>
              </DialogHeader>
              <form onSubmit={submitNote} className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Student</Label>
                  <Select value={noteStudent} onValueChange={setNoteStudent}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pick a student" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {(students ?? []).map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.full_name} · {s.admission_no}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Tone</Label>
                  <Select value={tone} onValueChange={setTone}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="positive">Positive</SelectItem>
                      <SelectItem value="neutral">Neutral</SelectItem>
                      <SelectItem value="concern">Concern</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Note</Label>
                  <Textarea
                    name="note"
                    required
                    rows={4}
                    placeholder="Short observation on today's progress…"
                  />
                </div>
                <Button type="submit" className="w-full">
                  Save note
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-6">
        <Card className="rounded-2xl overflow-hidden">
          <div className="p-4 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search students by name or admission #"
                className="pl-9"
              />
            </div>
          </div>
          <ul className="divide-y">
            {filtered.map((s: any) => (
              <li key={s.id} className="p-3 flex items-center gap-3 hover:bg-muted/40">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{s.full_name}</div>
                  <div className="text-xs text-muted-foreground font-mono">
                    {s.admission_no}
                    {s.className ? ` · ${s.className}` : ""}
                  </div>
                </div>
                <Link
                  to="/children/$studentId/report"
                  params={{ studentId: s.id }}
                  className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                >
                  View report <ArrowRight className="size-3" />
                </Link>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="p-8 text-center text-sm text-muted-foreground">No students match.</li>
            )}
          </ul>
        </Card>

        <Card className="rounded-2xl overflow-hidden">
          <div className="p-4 border-b font-medium flex items-center gap-2">
            <FileText className="size-4" /> Day-wise progress feed
          </div>
          <div className="p-4 space-y-5 max-h-[70vh] overflow-y-auto">
            {byDay.map(([day, items]) => (
              <div key={day}>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                  {day}
                </div>
                <div className="space-y-2">
                  {items.map((n: any) => (
                    <div key={n.id} className="rounded-xl border p-3">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <Link
                          to="/children/$studentId/report"
                          params={{ studentId: n.student_id }}
                          className="font-medium text-sm hover:underline"
                        >
                          {n.student_name}
                        </Link>
                        <Badge className={`${TONE_META[n.tone] ?? ""} border-0 capitalize`}>
                          {n.tone}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{n.note}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {byDay.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                No progress notes yet. Use "New note" to add the first one.
              </p>
            )}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
