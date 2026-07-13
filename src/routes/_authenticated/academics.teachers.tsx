import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { apiGet, apiFetch } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { QueryError, TableSkeleton } from "@/components/query-states";
import { UserPlus, X, Users, GraduationCap } from "lucide-react";

export const Route = createFileRoute("/_authenticated/academics/teachers")({ component: Page });

type ClassRow = { id: string; name: string; section: string | null; academicYear: string };
type Subject = { id: string; name: string; code: string | null; weeklyPeriods: number };
type Assignment = {
  id: string;
  teacherId: string;
  teacherName: string;
  subjectId: string;
  role: string;
};
type TeacherOption = { id: string; fullName: string };
type Workload = {
  session: string;
  cap: number;
  teachers: {
    teacherId: string;
    teacherName: string;
    assignments: number;
    plannedPeriods: number;
    scheduledPeriods: number;
    remaining: number;
    overloaded: boolean;
  }[];
};

function Page() {
  const qc = useQueryClient();
  const [classId, setClassId] = useState<string>("");

  const { data: classes } = useQuery({
    queryKey: ["academic-classes-all"],
    queryFn: () => apiGet<ClassRow[]>("/classes"),
  });
  const { data: teachers } = useQuery({
    queryKey: ["teacher-options"],
    queryFn: () => apiGet<TeacherOption[]>("/classes/teacher-options"),
  });
  const {
    data: subjects,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["academic-subjects", classId],
    queryFn: () => apiGet<Subject[]>(`/subjects?classId=${classId}`),
    enabled: !!classId,
  });
  const { data: assignments } = useQuery({
    queryKey: ["teacher-subjects", classId],
    queryFn: () => apiGet<Assignment[]>(`/academics/teacher-subjects?classId=${classId}`),
    enabled: !!classId,
  });
  const { data: workload } = useQuery({
    queryKey: ["teacher-workload"],
    queryFn: () => apiGet<Workload>("/academics/teacher-workload"),
  });

  const classLabel = (c: ClassRow) =>
    `${c.name}${c.section ? ` ${c.section}` : ""} · ${c.academicYear}`;

  const assign = useMutation({
    mutationFn: async ({ subjectId, teacherId }: { subjectId: string; teacherId: string }) => {
      const res = await apiFetch("/academics/teacher-subjects", {
        method: "POST",
        body: JSON.stringify({ teacher_id: teacherId, class_id: classId, subject_id: subjectId }),
      });
      if (!res || !res.ok) {
        const b = res ? await res.json().catch(() => null) : null;
        throw new Error(b?.message ?? "Could not assign teacher");
      }
    },
    onSuccess: () => {
      toast.success("Teacher assigned");
      qc.invalidateQueries({ queryKey: ["teacher-subjects", classId] });
      qc.invalidateQueries({ queryKey: ["teacher-workload"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const unassign = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/academics/teacher-subjects/${id}`, { method: "DELETE" });
      if (!res || !res.ok) throw new Error("Could not remove assignment");
    },
    onSuccess: () => {
      toast.success("Assignment removed");
      qc.invalidateQueries({ queryKey: ["teacher-subjects", classId] });
      qc.invalidateQueries({ queryKey: ["teacher-workload"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const bySubject = (subjectId: string) =>
    (assignments ?? []).filter((a) => a.subjectId === subjectId);

  return (
    <div className="space-y-4">
      {/* Assignment grid */}
      <Card className="rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <h3 className="font-semibold">Assign teachers to subjects</h3>
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
        </div>

        {!classId ? (
          <EmptyState
            icon={GraduationCap}
            title="Pick a class"
            hint="Select a class-section to assign subject teachers."
          />
        ) : isError ? (
          <QueryError onRetry={() => refetch()} />
        ) : isLoading ? (
          <TableSkeleton rows={6} cols={4} />
        ) : (subjects ?? []).length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title="No subjects"
            hint="Add subjects to this class first."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="p-3 font-medium">Subject</th>
                  <th className="p-3 font-medium text-right">Periods/wk</th>
                  <th className="p-3 font-medium">Assigned teachers</th>
                  <th className="p-3 font-medium w-64">Add teacher</th>
                </tr>
              </thead>
              <tbody>
                {(subjects ?? []).map((s) => (
                  <tr key={s.id} className="border-t align-top">
                    <td className="p-3">
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{s.code ?? "—"}</div>
                    </td>
                    <td className="p-3 text-right">{s.weeklyPeriods}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1.5">
                        {bySubject(s.id).map((a) => (
                          <Badge key={a.id} variant="secondary" className="gap-1">
                            {a.teacherName}
                            <button
                              aria-label={`Remove ${a.teacherName}`}
                              onClick={() => unassign.mutate(a.id)}
                              className="hover:text-red-600"
                            >
                              <X className="size-3" />
                            </button>
                          </Badge>
                        ))}
                        {bySubject(s.id).length === 0 && (
                          <span className="text-xs text-muted-foreground">Unassigned</span>
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      <Select
                        value=""
                        onValueChange={(teacherId) => assign.mutate({ subjectId: s.id, teacherId })}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue placeholder="＋ Add teacher" />
                        </SelectTrigger>
                        <SelectContent>
                          {(teachers ?? [])
                            .filter((t) => !bySubject(s.id).some((a) => a.teacherId === t.id))
                            .map((t) => (
                              <SelectItem key={t.id} value={t.id}>
                                {t.fullName}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Workload */}
      <Card className="rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Users className="size-4" />
          <h3 className="font-semibold">Teacher Workload</h3>
          <span className="text-sm text-muted-foreground">
            session {workload?.session ?? "—"} · soft cap {workload?.cap ?? 40} periods/wk
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="p-3 font-medium">Teacher</th>
                <th className="p-3 font-medium text-right">Assignments</th>
                <th className="p-3 font-medium text-right">Planned periods</th>
                <th className="p-3 font-medium text-right">Scheduled</th>
                <th className="p-3 font-medium text-right">Remaining</th>
                <th className="p-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {(workload?.teachers ?? []).map((t) => (
                <tr key={t.teacherId} className="border-t">
                  <td className="p-3 font-medium flex items-center gap-2">
                    <UserPlus className="size-4 text-muted-foreground" />
                    {t.teacherName}
                  </td>
                  <td className="p-3 text-right">{t.assignments}</td>
                  <td className="p-3 text-right">{t.plannedPeriods}</td>
                  <td className="p-3 text-right">{t.scheduledPeriods}</td>
                  <td className="p-3 text-right">{t.remaining}</td>
                  <td className="p-3">
                    <StatusBadge
                      tone={
                        t.overloaded ? "danger" : t.scheduledPeriods > 0 ? "success" : "neutral"
                      }
                      label={
                        t.overloaded ? "Overloaded" : t.scheduledPeriods > 0 ? "Active" : "Free"
                      }
                    />
                  </td>
                </tr>
              ))}
              {workload && workload.teachers.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground">
                    No teacher assignments or scheduled periods yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
