import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { apiGet, apiFetch } from "@/lib/api/client";
import { CHART_PRIMARY, CHART_MUTED } from "@/lib/chart";
import { AppShell, PageHeader } from "@/components/app-shell";
import { RequireRole } from "@/components/require-role";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
import { ArrowLeft, ClipboardCheck, Download, MessageSquare, UserPlus, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";

export const Route = createFileRoute("/_authenticated/classes/$classId")({
  component: () => (
    <RequireRole roles={["admin", "hr"]}>
      <ClassDetailPage />
    </RequireRole>
  ),
});

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const initials = (n?: string | null) =>
  (n ?? "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

function ClassDetailPage() {
  const { classId } = Route.useParams();
  const navigate = useNavigate();

  const { data: detail } = useQuery({
    queryKey: ["class-detail-bundle", classId],
    queryFn: () => apiGet<any>(`/classes/${classId}/detail`),
  });
  const cls = detail?.cls ?? null;
  const classTeacher = detail?.classTeacher ?? null;
  const students = (detail?.students ?? []) as any[];
  const extras = detail?.extras as { att: any[]; ex: any[]; fa: any[]; ps: any[] } | undefined;
  const assignments = detail?.assignments as
    { tc: any[]; tt: any[]; profById: Record<string, any> } | undefined;
  const schoolAvgBySubject = (detail?.schoolAvgBySubject ?? {}) as Record<string, number>;

  const studentIds = useMemo(() => students.map((s: any) => s.id), [students]);

  const attByStudent = useMemo(() => {
    const m: Record<string, { t: number; p: number }> = {};
    for (const a of extras?.att ?? []) {
      const s = (m[a.student_id] ||= { t: 0, p: 0 });
      s.t++;
      if (a.status === "present" || a.status === "late") s.p++;
    }
    return m;
  }, [extras?.att]);

  const perfByStudent = useMemo(() => {
    const m: Record<string, { got: number; max: number }> = {};
    for (const r of (extras?.ex as any[]) ?? []) {
      const s = (m[r.student_id] ||= { got: 0, max: 0 });
      s.got += Number(r.marks_obtained) || 0;
      s.max += Number(r.exams?.max_marks) || 0;
    }
    return m;
  }, [extras?.ex]);

  const feeByStudent = useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of extras?.fa ?? []) m[r.student_id] = r.status;
    return m;
  }, [extras?.fa]);

  const parentByStudent = useMemo(() => {
    const m: Record<string, { name: string; email: string | null; rel: string }> = {};
    for (const r of (extras?.ps as any[]) ?? []) {
      m[r.student_id] = {
        name: r.profiles?.full_name ?? "—",
        email: r.profiles?.email ?? null,
        rel: r.relationship ?? "guardian",
      };
    }
    return m;
  }, [extras?.ps]);

  // Attendance trend (last 30 days) — daily present %
  const attTrend = useMemo(() => {
    const byDate: Record<string, { t: number; p: number }> = {};
    for (const a of extras?.att ?? []) {
      const d = a.date as string;
      const m = (byDate[d] ||= { t: 0, p: 0 });
      m.t++;
      if (a.status === "present" || a.status === "late") m.p++;
    }
    return Object.entries(byDate)
      .map(([d, v]) => ({ date: d.slice(5), pct: v.t ? Math.round((v.p / v.t) * 100) : 0 }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [extras?.att]);

  // Performance by subject (this class)
  const perfBySubject = useMemo(() => {
    const m: Record<string, { got: number; max: number }> = {};
    for (const r of (extras?.ex as any[]) ?? []) {
      const name = r.exams?.subjects?.name ?? "—";
      const s = (m[name] ||= { got: 0, max: 0 });
      s.got += Number(r.marks_obtained) || 0;
      s.max += Number(r.exams?.max_marks) || 0;
    }
    return Object.entries(m).map(([subject, v]) => ({
      subject,
      avg: v.max ? Math.round((v.got / v.max) * 100) : 0,
      schoolAvg: Math.round((schoolAvgBySubject as any)?.[subject] ?? 0),
    }));
  }, [extras?.ex, schoolAvgBySubject]);

  // Grade distribution across all students
  const gradeDist = useMemo(() => {
    const buckets = { "A (85+)": 0, "B (70–84)": 0, "C (55–69)": 0, "D (40–54)": 0, "E (<40)": 0 };
    for (const sid of studentIds) {
      const p = perfByStudent[sid];
      if (!p || !p.max) continue;
      const pct = (p.got / p.max) * 100;
      if (pct >= 85) buckets["A (85+)"]++;
      else if (pct >= 70) buckets["B (70–84)"]++;
      else if (pct >= 55) buckets["C (55–69)"]++;
      else if (pct >= 40) buckets["D (40–54)"]++;
      else buckets["E (<40)"]++;
    }
    return Object.entries(buckets).map(([grade, count]) => ({ grade, count }));
  }, [studentIds, perfByStudent]);

  // Timetable grouped: teacher → subjects + weekly period count
  const teacherPeriods = useMemo(() => {
    const m: Record<string, { profId: string; subjects: Set<string>; periods: number }> = {};
    for (const t of assignments?.tt ?? []) {
      const pid = (t as any).teacher_id;
      if (!pid) continue;
      const row = (m[pid] ||= { profId: pid, subjects: new Set(), periods: 0 });
      row.periods++;
      const subj = (t as any).subjects?.name;
      if (subj) row.subjects.add(subj);
    }
    // Also include teachers from teacher_classes who have no periods yet
    for (const r of assignments?.tc ?? []) {
      if (!(r as any).teacher_id) continue;
      if (!m[(r as any).teacher_id])
        m[(r as any).teacher_id] = {
          profId: (r as any).teacher_id,
          subjects: new Set(),
          periods: 0,
        };
    }
    return Object.values(m);
  }, [assignments]);

  const feeSummary = useMemo(() => {
    let paid = 0,
      partial = 0,
      pending = 0,
      due = 0,
      outstanding = 0;
    for (const r of extras?.fa ?? []) {
      if (r.status === "paid") paid++;
      else if (r.status === "partial") partial++;
      else pending++;
      due += Number(r.amount_due) || 0;
      outstanding += (Number(r.amount_due) || 0) - (Number(r.amount_paid) || 0);
    }
    return { paid, partial, pending, due, outstanding };
  }, [extras?.fa]);

  const feeBadge = (s?: string) => {
    if (!s) return <Badge variant="secondary">—</Badge>;
    if (s === "paid")
      return <Badge className="bg-emerald-100 text-emerald-700 border-0">Paid</Badge>;
    if (s === "partial")
      return <Badge className="bg-amber-100 text-amber-700 border-0">Partial</Badge>;
    return <Badge className="bg-red-100 text-red-700 border-0">Pending</Badge>;
  };

  const exportCsv = () => {
    const header = ["Roll", "Admission #", "Name", "Email", "Gender", "Status"];
    const rows = (students ?? []).map((s: any) =>
      [
        s.roll_no ?? "",
        s.admission_no,
        `"${(s.profiles?.full_name ?? "").replace(/"/g, '""')}"`,
        s.profiles?.email ?? "",
        s.gender ?? "",
        s.status,
      ].join(","),
    );
    const csv = [header.join(","), ...rows].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${cls?.name}-${cls?.section ?? ""}-roster.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${(students ?? []).length} students`);
  };

  const messageAllParents = () => {
    const ids = (students ?? []).map((s: any) => s.id);
    try {
      sessionStorage.setItem("bulk-message-student-ids", JSON.stringify(ids));
    } catch {
      /* sessionStorage unavailable — proceed without prefill */
    }
    navigate({ to: "/communication" });
  };

  if (!cls)
    return (
      <AppShell>
        <PageHeader title="Class" subtitle="Loading…" />
      </AppShell>
    );

  const count = (students ?? []).length;
  const overallAtt = (() => {
    const t = (extras?.att ?? []).length;
    if (!t) return null;
    const p = (extras?.att ?? []).filter(
      (a: any) => a.status === "present" || a.status === "late",
    ).length;
    return Math.round((p / t) * 100);
  })();

  return (
    <AppShell>
      <PageHeader
        title={`${cls.name}${cls.section ? ` · ${cls.section}` : ""}`}
        subtitle={`AY ${cls.academic_year}${cls.room ? ` · ${cls.room}` : ""}${cls.capacity ? ` · Capacity ${count}/${cls.capacity}` : ""}`}
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/classes">
                <ArrowLeft className="size-4" /> Classes
              </Link>
            </Button>
            <Button variant="outline" onClick={exportCsv}>
              <Download className="size-4" /> Export list
            </Button>
            <Button variant="outline" onClick={messageAllParents}>
              <MessageSquare className="size-4" /> Message parents
            </Button>
            <Button asChild variant="outline">
              <Link to="/attendance">
                <ClipboardCheck className="size-4" /> Attendance
              </Link>
            </Button>
            <AddStudentDialog
              classId={classId}
              className={`${cls.name}${cls.section ? ` · ${cls.section}` : ""}`}
            />
          </div>
        }
      />

      {/* Header stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card className="rounded-2xl p-4">
          <div className="text-xs text-muted-foreground">Students</div>
          <div className="font-display text-2xl font-semibold">{count}</div>
        </Card>
        <Card className="rounded-2xl p-4">
          <div className="text-xs text-muted-foreground">Class teacher</div>
          <div className="font-medium truncate">{classTeacher?.full_name ?? "Unassigned"}</div>
        </Card>
        <Card className="rounded-2xl p-4">
          <div className="text-xs text-muted-foreground">Attendance (30d)</div>
          <div className="font-display text-2xl font-semibold">
            {overallAtt ?? "—"}
            {overallAtt != null && "%"}
          </div>
        </Card>
        <Card className="rounded-2xl p-4">
          <div className="text-xs text-muted-foreground">Outstanding fees</div>
          <div className="font-display text-2xl font-semibold">
            ₹{Math.round(feeSummary.outstanding).toLocaleString("en-IN")}
          </div>
        </Card>
      </div>

      <Tabs defaultValue="teachers" className="space-y-4">
        <TabsList>
          <TabsTrigger value="teachers">Teachers</TabsTrigger>
          <TabsTrigger value="students">Students ({count})</TabsTrigger>
          <TabsTrigger value="timetable">Timetable</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="fees">Fees</TabsTrigger>
        </TabsList>

        {/* Teachers */}
        <TabsContent value="teachers">
          <Card className="rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-secondary text-muted-foreground text-left">
                  <tr>
                    <th className="p-3 font-medium">Teacher</th>
                    <th className="p-3 font-medium">Subject(s)</th>
                    <th className="p-3 font-medium">Weekly periods</th>
                    <th className="p-3 font-medium">Role</th>
                  </tr>
                </thead>
                <tbody>
                  {teacherPeriods.map((t) => {
                    const prof = assignments?.profById[t.profId];
                    const isClassTeacher = cls.class_teacher_id === t.profId;
                    const teacherId = prof?.teacher?.id;
                    const inner = (
                      <div className="flex items-center gap-3">
                        <Avatar className="size-8">
                          <AvatarFallback className="text-xs">
                            {initials(prof?.full_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">{prof?.full_name ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">{prof?.email ?? ""}</div>
                        </div>
                      </div>
                    );
                    return (
                      <tr
                        key={t.profId}
                        className={`border-t hover:bg-muted/40 ${isClassTeacher ? "bg-primary/5" : ""}`}
                      >
                        <td className="p-3">
                          {teacherId ? (
                            <Link
                              to="/teachers/$teacherId"
                              params={{ teacherId }}
                              className="block"
                            >
                              {inner}
                            </Link>
                          ) : (
                            inner
                          )}
                        </td>
                        <td className="p-3">
                          {Array.from(t.subjects).join(", ") || prof?.teacher?.subject || "—"}
                        </td>
                        <td className="p-3 font-medium">{t.periods}</td>
                        <td className="p-3">
                          {isClassTeacher ? (
                            <Badge>Class teacher</Badge>
                          ) : (
                            <span className="text-muted-foreground">Subject teacher</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {teacherPeriods.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-muted-foreground">
                        No teachers assigned.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* Students */}
        <TabsContent value="students">
          <Card className="rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary text-muted-foreground text-left">
                  <tr>
                    <th className="p-3 font-medium">Roll</th>
                    <th className="p-3 font-medium">Student</th>
                    <th className="p-3 font-medium">Gender</th>
                    <th className="p-3 font-medium">Attendance</th>
                    <th className="p-3 font-medium">Performance</th>
                    <th className="p-3 font-medium">Parent</th>
                    <th className="p-3 font-medium">Fee</th>
                  </tr>
                </thead>
                <tbody>
                  {(students ?? []).map((s: any) => {
                    const att = attByStudent[s.id];
                    const attPct = att && att.t ? Math.round((att.p / att.t) * 100) : null;
                    const p = perfByStudent[s.id];
                    const perfPct = p && p.max ? Math.round((p.got / p.max) * 100) : null;
                    const parent = parentByStudent[s.id];
                    return (
                      <tr
                        key={s.id}
                        className="border-t hover:bg-muted/40 cursor-pointer"
                        onClick={() =>
                          navigate({
                            to: "/students/$studentId/report",
                            params: { studentId: s.id },
                          })
                        }
                      >
                        <td className="p-3 text-muted-foreground">{s.roll_no || "—"}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-3">
                            <Avatar className="size-8">
                              <AvatarFallback className="text-xs">
                                {initials(s.profiles?.full_name)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-medium">{s.profiles?.full_name}</div>
                              <div className="text-xs text-muted-foreground">{s.admission_no}</div>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 capitalize text-muted-foreground">{s.gender ?? "—"}</td>
                        <td className="p-3">
                          {attPct == null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span
                              className={
                                attPct >= 90
                                  ? "text-emerald-600 font-medium"
                                  : attPct >= 75
                                    ? "text-amber-600 font-medium"
                                    : "text-red-600 font-medium"
                              }
                            >
                              {attPct}%
                            </span>
                          )}
                        </td>
                        <td className="p-3 font-medium">{perfPct == null ? "—" : `${perfPct}%`}</td>
                        <td className="p-3">
                          {parent ? (
                            <div>
                              <div className="text-sm">{parent.name}</div>
                              <div className="text-xs text-muted-foreground">{parent.rel}</div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-3">{feeBadge(feeByStudent[s.id])}</td>
                      </tr>
                    );
                  })}
                  {(students ?? []).length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-muted-foreground">
                        No students in this section.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* Timetable */}
        <TabsContent value="timetable">
          <Card className="rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-secondary text-muted-foreground text-left">
                  <tr>
                    <th className="p-3 font-medium">Day</th>
                    <th className="p-3 font-medium">Time</th>
                    <th className="p-3 font-medium">Subject</th>
                    <th className="p-3 font-medium">Teacher</th>
                    <th className="p-3 font-medium">Room</th>
                  </tr>
                </thead>
                <tbody>
                  {(assignments?.tt ?? []).map((t: any) => (
                    <tr key={t.id} className="border-t">
                      <td className="p-3">{DAYS[t.day_of_week] ?? "—"}</td>
                      <td className="p-3 font-mono text-xs">
                        {t.start_time?.slice(0, 5)}–{t.end_time?.slice(0, 5)}
                      </td>
                      <td className="p-3">{t.subjects?.name ?? "—"}</td>
                      <td className="p-3">
                        {assignments?.profById[t.teacher_id]?.full_name ?? "—"}
                      </td>
                      <td className="p-3 text-muted-foreground">{t.room ?? cls.room ?? "—"}</td>
                    </tr>
                  ))}
                  {(assignments?.tt ?? []).length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-muted-foreground">
                        No timetable defined.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* Attendance */}
        <TabsContent value="attendance">
          <div className="grid md:grid-cols-3 gap-3 mb-4">
            <Card className="rounded-2xl p-4">
              <div className="text-xs text-muted-foreground">30-day attendance</div>
              <div className="font-display text-2xl font-semibold">
                {overallAtt ?? "—"}
                {overallAtt != null && "%"}
              </div>
            </Card>
            <Card className="rounded-2xl p-4">
              <div className="text-xs text-muted-foreground">Records (30d)</div>
              <div className="font-display text-2xl font-semibold">
                {(extras?.att ?? []).length.toLocaleString()}
              </div>
            </Card>
            <Card className="rounded-2xl p-4 flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground">Full overview</div>
                <div className="text-sm">Filtered to this section</div>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link to="/attendance-overview">Open</Link>
              </Button>
            </Card>
          </div>
          <Card className="rounded-2xl p-4">
            <div className="text-sm font-medium mb-2">Daily attendance % (last 30 days)</div>
            <div style={{ width: "100%", height: 240 }}>
              <ResponsiveContainer>
                <LineChart data={attTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis domain={[0, 100]} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="pct"
                    stroke={CHART_PRIMARY}
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </TabsContent>

        {/* Performance */}
        <TabsContent value="performance">
          <div className="grid md:grid-cols-2 gap-3">
            <Card className="rounded-2xl p-4">
              <div className="text-sm font-medium mb-2">Average by subject — class vs grade</div>
              <div style={{ width: "100%", height: 260 }}>
                <ResponsiveContainer>
                  <BarChart data={perfBySubject}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="subject" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip />
                    <Bar dataKey="avg" fill={CHART_PRIMARY} name="This class" />
                    <Bar dataKey="schoolAvg" fill={CHART_MUTED} name="Grade avg" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card className="rounded-2xl p-4">
              <div className="text-sm font-medium mb-2">Grade distribution</div>
              <div style={{ width: "100%", height: 260 }}>
                <ResponsiveContainer>
                  <BarChart data={gradeDist}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="grade" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill={CHART_PRIMARY} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* Fees */}
        <TabsContent value="fees">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            <Card className="rounded-2xl p-4">
              <div className="text-xs text-muted-foreground">Paid</div>
              <div className="font-display text-2xl font-semibold text-emerald-600">
                {feeSummary.paid}
              </div>
            </Card>
            <Card className="rounded-2xl p-4">
              <div className="text-xs text-muted-foreground">Partial</div>
              <div className="font-display text-2xl font-semibold text-amber-600">
                {feeSummary.partial}
              </div>
            </Card>
            <Card className="rounded-2xl p-4">
              <div className="text-xs text-muted-foreground">Pending</div>
              <div className="font-display text-2xl font-semibold text-red-600">
                {feeSummary.pending}
              </div>
            </Card>
            <Card className="rounded-2xl p-4">
              <div className="text-xs text-muted-foreground">Total invoiced</div>
              <div className="font-display text-2xl font-semibold">
                ₹{Math.round(feeSummary.due).toLocaleString("en-IN")}
              </div>
            </Card>
            <Card className="rounded-2xl p-4">
              <div className="text-xs text-muted-foreground">Outstanding</div>
              <div className="font-display text-2xl font-semibold text-red-600">
                ₹{Math.round(feeSummary.outstanding).toLocaleString("en-IN")}
              </div>
            </Card>
          </div>
          <Card className="rounded-2xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="size-4 text-muted-foreground" />
              <span className="text-sm">See per-student fee status in the Students tab.</span>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to="/fees">Open Fees module</Link>
            </Button>
          </Card>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

/* ─────────────────── Add student (in-page, scoped to this class) ─────────────────── */
type ParentMatch = { id: string; fullName: string; phone?: string | null; email?: string | null };

function AddStudentDialog({ classId, className }: { classId: string; className: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gender, setGender] = useState<string>("");
  const [dob, setDob] = useState("");
  const [parentMode, setParentMode] = useState<"new" | "existing">("new");
  // new parent
  const [parentName, setParentName] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  // existing parent
  const [pq, setPq] = useState("");
  const [existingParentId, setExistingParentId] = useState("");

  const reset = () => {
    setFirstName("");
    setLastName("");
    setGender("");
    setDob("");
    setParentMode("new");
    setParentName("");
    setParentPhone("");
    setParentEmail("");
    setPq("");
    setExistingParentId("");
  };

  const { data: parentSearch } = useQuery({
    queryKey: ["class-add-parent-search", pq],
    queryFn: () => apiGet<{ matches: ParentMatch[] }>(`/parents/search?q=${encodeURIComponent(pq)}`),
    enabled: parentMode === "existing" && pq.trim().length >= 2,
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!firstName.trim()) throw new Error("Enter the student's first name");
      if (parentMode === "new" && !parentName.trim())
        throw new Error("Enter a parent/guardian name");
      if (parentMode === "new" && !parentEmail.trim())
        throw new Error("A parent login email is required for a new parent");
      if (parentMode === "existing" && !existingParentId)
        throw new Error("Pick an existing parent");
      const body: Record<string, unknown> = {
        classId,
        firstName: firstName.trim(),
        lastName: lastName.trim() || undefined,
        gender: gender || undefined,
        dob: dob || undefined,
        parentMode,
      };
      if (parentMode === "new") {
        body.primaryGuardian = "father";
        body.father = { name: parentName.trim(), phone: parentPhone.trim() || undefined };
        body.parentLoginEmail = parentEmail.trim();
      } else {
        body.existingParentId = existingParentId;
      }
      const res = await apiFetch("/admissions/admit", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res || !res.ok) {
        const b = res ? await res.json().catch(() => null) : null;
        throw new Error(b?.message ?? "Could not add the student");
      }
      return res.json();
    },
    onSuccess: (r: any) => {
      toast.success(`Added to ${className}${r?.rollNo ? ` · Roll ${r.rollNo}` : ""}`);
      qc.invalidateQueries({ queryKey: ["class-detail-bundle", classId] });
      setOpen(false);
      reset();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="size-4" /> Add student
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add student to {className}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>First name *</Label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus />
            </div>
            <div>
              <Label>Last name</Label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
            <div>
              <Label>Gender</Label>
              <Select value={gender} onValueChange={setGender}>
                <SelectTrigger aria-label="Gender">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Date of birth</Label>
              <Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
            </div>
          </div>

          <div className="rounded-lg border p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm font-medium">Parent / guardian</span>
              <div className="ml-auto flex gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant={parentMode === "new" ? "default" : "outline"}
                  onClick={() => setParentMode("new")}
                >
                  New
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={parentMode === "existing" ? "default" : "outline"}
                  onClick={() => setParentMode("existing")}
                >
                  Existing
                </Button>
              </div>
            </div>

            {parentMode === "new" ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Name *</Label>
                  <Input value={parentName} onChange={(e) => setParentName(e.target.value)} />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} />
                </div>
                <div>
                  <Label>Login email *</Label>
                  <Input
                    type="email"
                    value={parentEmail}
                    onChange={(e) => setParentEmail(e.target.value)}
                  />
                </div>
              </div>
            ) : (
              <div>
                <Input
                  placeholder="Search parent by name, phone or email…"
                  value={pq}
                  onChange={(e) => {
                    setPq(e.target.value);
                    setExistingParentId("");
                  }}
                />
                {pq.trim().length >= 2 && (
                  <div className="mt-2 max-h-40 overflow-y-auto rounded-md border divide-y">
                    {(parentSearch?.matches ?? []).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setExistingParentId(m.id)}
                        className={`block w-full px-3 py-2 text-left text-sm hover:bg-muted ${
                          existingParentId === m.id ? "bg-primary/10" : ""
                        }`}
                      >
                        <div className="font-medium">{m.fullName}</div>
                        <div className="text-xs text-muted-foreground">
                          {[m.phone, m.email].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </button>
                    ))}
                    {(parentSearch?.matches ?? []).length === 0 && (
                      <div className="px-3 py-2 text-sm text-muted-foreground">No matches.</div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => add.mutate()} disabled={add.isPending}>
            {add.isPending ? "Adding…" : "Add student"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
