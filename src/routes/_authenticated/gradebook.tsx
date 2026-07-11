import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell, PageHeader } from "@/components/app-shell";
import { EmptyRow } from "@/components/empty-state";
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
import { apiFetch, apiGet } from "@/lib/api/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/gradebook")({
  component: GradebookPage,
});

function GradebookPage() {
  const { user } = useCurrentUser();
  const qc = useQueryClient();
  const isAdmin = (user?.roles ?? []).includes("admin");
  const [classId, setClassId] = useState<string>("");
  const [examId, setExamId] = useState<string>("");
  const [openNew, setOpenNew] = useState(false);
  const [newSubjectId, setNewSubjectId] = useState<string>("");
  const [marks, setMarks] = useState<Record<string, string>>({});

  // exams/exam_results are admin-write under RLS (exams_admin_all, results_admin_all);
  // teachers get read-only. Admins pick from all classes, teachers from their own.
  const { data: classes } = useQuery({
    enabled: !!user,
    queryKey: ["gb-classes", user?.id, isAdmin],
    queryFn: async () => {
      if (isAdmin) {
        const rows = await apiGet<{ id: string; name: string; section: string }[]>("/classes");
        return rows.map((r) => ({ id: r.id, name: r.name, section: r.section }));
      }
      const rows = await apiGet<{ classId: string; name: string; section: string }[]>(
        `/teachers/${user!.id}/classes`,
      );
      return rows.map((r) => ({ id: r.classId, name: r.name, section: r.section }));
    },
  });
  useEffect(() => {
    if (!classId && classes?.length) setClassId(classes[0].id);
  }, [classes, classId]);

  const { data: subjects } = useQuery({
    enabled: !!classId,
    queryKey: ["gb-subjects", classId],
    queryFn: async () => apiGet<{ id: string; name: string }[]>(`/subjects?classId=${classId}`),
  });

  const { data: exams } = useQuery({
    enabled: !!classId,
    queryKey: ["gb-exams", classId],
    queryFn: async () => {
      const rows = await apiGet<
        { id: string; name: string; examDate: string; maxMarks: number; subjectName: string }[]
      >(`/exams?classId=${classId}`);
      return rows.map((e) => ({
        id: e.id,
        name: e.name,
        exam_date: e.examDate,
        max_marks: e.maxMarks,
        subjects: e.subjectName ? { name: e.subjectName } : null,
      }));
    },
  });
  useEffect(() => {
    if (exams?.length && !examId) setExamId(exams[0].id);
  }, [exams, examId]);

  const currentExam = (exams ?? []).find((e: any) => e.id === examId);

  const { data: students } = useQuery({
    enabled: !!classId,
    queryKey: ["gb-students", classId],
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

  const { data: results } = useQuery({
    enabled: !!examId,
    queryKey: ["gb-results", examId],
    queryFn: async () => {
      const res = await apiGet<{ rows: any[] }>(`/exam-results?examId=${examId}&pageSize=500`);
      return res.rows.map((r) => ({ student_id: r.studentId, marks_obtained: r.marksObtained }));
    },
  });

  useEffect(() => {
    if (!students) return;
    const seed: Record<string, string> = {};
    for (const s of students) seed[s.id] = "";
    for (const r of results ?? []) seed[r.student_id] = String(r.marks_obtained);
    setMarks(seed);
  }, [students, results]);

  const createExam = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!classId) return;
    const fd = new FormData(e.currentTarget);
    try {
      const res = await apiFetch("/exams", {
        method: "POST",
        body: JSON.stringify({
          classId,
          subjectId: newSubjectId || undefined,
          name: String(fd.get("name")),
          examDate: String(fd.get("date") || format(new Date(), "yyyy-MM-dd")),
          maxMarks: Number(fd.get("max") || 100),
          term: String(fd.get("term") || ""),
        }),
      });
      const body = res ? await res.json() : null;
      toast.success("Exam created");
      setOpenNew(false);
      setNewSubjectId("");
      if (body?.id) setExamId(body.id);
      qc.invalidateQueries({ queryKey: ["gb-exams", classId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create exam");
    }
  };

  const saveMarks = async () => {
    if (!examId) return;
    const entries = Object.entries(marks)
      .filter(([, v]) => v !== "" && v !== null)
      .map(([studentId, v]) => ({ studentId, marks: Number(v) }));
    try {
      await apiFetch("/exam-results", {
        method: "POST",
        body: JSON.stringify({ examId, entries }),
      });
      toast.success(`Saved ${entries.length} marks`);
      qc.invalidateQueries({ queryKey: ["gb-results", examId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save marks");
    }
  };

  return (
    <AppShell>
      <PageHeader title="Gradebook" subtitle="Create exams and enter student marks." />
      <Card className="p-5 rounded-2xl mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label>Class</Label>
            <Select
              value={classId}
              onValueChange={(v) => {
                setClassId(v);
                setExamId("");
              }}
            >
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
            <Label>Exam</Label>
            <Select value={examId} onValueChange={setExamId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick an exam" />
              </SelectTrigger>
              <SelectContent>
                {(exams ?? []).map((e: any) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                    {e.subjects?.name && ` · ${e.subjects.name}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Dialog open={openNew} onOpenChange={setOpenNew}>
              <DialogTrigger asChild>
                <Button variant="outline" disabled={!classId}>
                  <Plus className="size-4" /> New exam
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create exam</DialogTitle>
                </DialogHeader>
                <form onSubmit={createExam} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Name</Label>
                    <Input name="name" required placeholder="Math Unit 2" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Subject</Label>
                    <Select value={newSubjectId} onValueChange={setNewSubjectId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Pick subject" />
                      </SelectTrigger>
                      <SelectContent>
                        {(subjects ?? []).map((s: any) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Date</Label>
                      <Input
                        type="date"
                        name="date"
                        defaultValue={format(new Date(), "yyyy-MM-dd")}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Max marks</Label>
                      <Input type="number" name="max" defaultValue="100" min="1" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Term</Label>
                    <Input name="term" placeholder="Term 1" />
                  </div>
                  <Button type="submit" className="w-full">
                    Create
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </Card>

      {currentExam && (
        <div className="text-sm text-muted-foreground mb-3">
          Max marks:{" "}
          <span className="font-medium text-foreground">{Number(currentExam.max_marks)}</span>
          {currentExam.exam_date && (
            <> · {format(new Date(currentExam.exam_date), "MMM d, yyyy")}</>
          )}
        </div>
      )}

      <Card className="rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-muted-foreground text-left">
              <tr>
                <th className="p-3 font-medium">Roll</th>
                <th className="p-3 font-medium">Student</th>
                <th className="p-3 font-medium">Marks</th>
                <th className="p-3 font-medium">%</th>
              </tr>
            </thead>
            <tbody>
              {(students ?? []).map((s: any) => {
                const val = marks[s.id] ?? "";
                const pct =
                  val && currentExam
                    ? Math.round((Number(val) / Number(currentExam.max_marks)) * 100)
                    : null;
                return (
                  <tr key={s.id} className="border-t">
                    <td className="p-3 font-mono text-xs">{s.roll_no ?? s.admission_no ?? "—"}</td>
                    <td className="p-3 font-medium">{s.profiles?.full_name}</td>
                    <td className="p-3">
                      <Input
                        type="number"
                        min="0"
                        max={Number(currentExam?.max_marks ?? 100)}
                        className="h-9 w-28"
                        disabled={!examId}
                        value={val}
                        onChange={(e) => setMarks((m) => ({ ...m, [s.id]: e.target.value }))}
                      />
                    </td>
                    <td className="p-3 text-muted-foreground">{pct !== null ? `${pct}%` : "—"}</td>
                  </tr>
                );
              })}
              {(students ?? []).length === 0 && (
                <EmptyRow
                  colSpan={4}
                  title="Pick a class to see students"
                  hint="Choose a class and exam above to enter marks."
                />
              )}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t flex justify-end">
          <Button onClick={saveMarks} disabled={!examId || !students?.length}>
            Save Marks
          </Button>
        </div>
      </Card>
    </AppShell>
  );
}
