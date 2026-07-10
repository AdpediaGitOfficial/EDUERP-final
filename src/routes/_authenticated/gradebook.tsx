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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
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
  const [classId, setClassId] = useState<string>("");
  const [examId, setExamId] = useState<string>("");
  const [openNew, setOpenNew] = useState(false);
  const [newSubjectId, setNewSubjectId] = useState<string>("");
  const [marks, setMarks] = useState<Record<string, string>>({});

  const { data: classes } = useQuery({
    enabled: !!user,
    queryKey: ["teacher-gb-classes", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("teacher_classes")
        .select("classes(id, name, section)")
        .eq("teacher_id", user!.id);
      return (data ?? []).map((r: any) => r.classes).filter(Boolean);
    },
  });
  useEffect(() => {
    if (!classId && classes?.length) setClassId(classes[0].id);
  }, [classes, classId]);

  const { data: subjects } = useQuery({
    enabled: !!classId,
    queryKey: ["gb-subjects", classId],
    queryFn: async () =>
      (await supabase.from("subjects").select("id,name").eq("class_id", classId).order("name"))
        .data ?? [],
  });

  const { data: exams } = useQuery({
    enabled: !!classId,
    queryKey: ["gb-exams", classId],
    queryFn: async () =>
      (
        await supabase
          .from("exams")
          .select("id, name, exam_date, max_marks, subjects(name)")
          .eq("class_id", classId)
          .order("exam_date", { ascending: false })
      ).data ?? [],
  });
  useEffect(() => {
    if (exams?.length && !examId) setExamId(exams[0].id);
  }, [exams, examId]);

  const currentExam = (exams ?? []).find((e: any) => e.id === examId);

  const { data: students } = useQuery({
    enabled: !!classId,
    queryKey: ["gb-students", classId],
    queryFn: async () =>
      (
        await supabase
          .from("students")
          .select("id, roll_no, admission_no, profiles(full_name)")
          .eq("class_id", classId)
          .order("roll_no")
      ).data ?? [],
  });

  const { data: results } = useQuery({
    enabled: !!examId,
    queryKey: ["gb-results", examId],
    queryFn: async () =>
      (
        await supabase
          .from("exam_results")
          .select("student_id, marks_obtained")
          .eq("exam_id", examId)
      ).data ?? [],
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
    const { data, error } = await supabase
      .from("exams")
      .insert({
        class_id: classId,
        subject_id: newSubjectId || null,
        name: String(fd.get("name")),
        exam_date: String(fd.get("date") || format(new Date(), "yyyy-MM-dd")),
        max_marks: Number(fd.get("max") || 100),
        term: String(fd.get("term") || ""),
      })
      .select("id")
      .single();
    if (error) return toast.error(error.message);
    toast.success("Exam created");
    setOpenNew(false);
    setNewSubjectId("");
    setExamId(data!.id);
    qc.invalidateQueries({ queryKey: ["gb-exams", classId] });
  };

  const saveMarks = async () => {
    if (!examId) return;
    const rows = Object.entries(marks)
      .filter(([, v]) => v !== "" && v !== null)
      .map(([student_id, v]) => ({ exam_id: examId, student_id, marks_obtained: Number(v) }));
    const { error } = await supabase
      .from("exam_results")
      .upsert(rows, { onConflict: "exam_id,student_id" });
    if (error) return toast.error(error.message);
    toast.success(`Saved ${rows.length} marks`);
    qc.invalidateQueries({ queryKey: ["gb-results", examId] });
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
                <tr>
                  <td colSpan={4} className="p-8 text-center text-muted-foreground">
                    Pick a class to see students.
                  </td>
                </tr>
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
