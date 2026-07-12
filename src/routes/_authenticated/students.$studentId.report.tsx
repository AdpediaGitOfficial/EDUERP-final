import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { apiGet, apiFileObjectUrl } from "@/lib/api/client";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  Download,
  GraduationCap,
  ClipboardCheck,
  BookOpenCheck,
  NotebookPen,
  MessageSquare,
  Award,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { useMemo, useState } from "react";
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
  Legend,
} from "recharts";

export const Route = createFileRoute("/_authenticated/students/$studentId/report")({
  component: StudentReportPage,
});

type PeriodKey = "term1" | "term2" | "term3" | "annual" | "custom";

const initials = (n?: string) =>
  (n ?? "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

const inr = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

const gradeFor = (pct: number | null) =>
  pct == null ? "—" : pct >= 85 ? "A" : pct >= 70 ? "B" : pct >= 55 ? "C" : pct >= 40 ? "D" : "E";

function StudentReportPage() {
  const { studentId } = Route.useParams();
  const [period, setPeriod] = useState<PeriodKey>("annual");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ["report-dashboard", studentId],
    queryFn: () => apiGet<any>(`/students/${studentId}/dashboard`),
  });
  const student = dashboard?.student ?? null;
  const results = (dashboard?.results ?? []) as any[];
  const classResults = (dashboard?.classResults ?? []) as any[];
  const attendance = (dashboard?.attendance ?? []) as any[];
  const assignedHomework = (dashboard?.homework ?? []) as any[];
  const submissions = (dashboard?.submissions ?? []) as any[];

  const classId: string | undefined = (student as any)?.classes?.id;

  // ---------- Period filter ----------
  const range = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    if (period === "term1")
      return { from: new Date(year, 3, 1), to: new Date(year, 6, 31), label: "Term 1 (Apr–Jul)" };
    if (period === "term2")
      return { from: new Date(year, 7, 1), to: new Date(year, 10, 30), label: "Term 2 (Aug–Nov)" };
    if (period === "term3")
      return {
        from: new Date(year, 11, 1),
        to: new Date(year + 1, 2, 31),
        label: "Term 3 (Dec–Mar)",
      };
    if (period === "custom") {
      const from = customFrom ? new Date(customFrom) : new Date(year, 0, 1);
      const to = customTo ? new Date(customTo) : new Date(year, 11, 31);
      return { from, to, label: "Custom" };
    }
    return { from: new Date(year, 0, 1), to: new Date(year, 11, 31), label: "Annual" };
  }, [period, customFrom, customTo]);

  const inRange = (iso?: string | null) => {
    if (!iso) return true;
    const d = new Date(iso);
    return d >= range.from && d <= range.to;
  };

  // ---------- Academic ----------
  const classAvgBySubject = useMemo(() => {
    const map = new Map<string, { sum: number; count: number; max: number }>();
    for (const r of (classResults as any[]) ?? []) {
      const subj = r.exams?.subjects?.name;
      const max = Number(r.exams?.max_marks) || 0;
      if (!subj || !max) continue;
      const pct = (Number(r.marks_obtained) / max) * 100;
      const g = map.get(subj) ?? { sum: 0, count: 0, max };
      g.sum += pct;
      g.count += 1;
      map.set(subj, g);
    }
    const out: Record<string, number> = {};
    map.forEach((v, k) => (out[k] = Math.round(v.sum / v.count)));
    return out;
  }, [classResults]);

  const filteredResults = useMemo(
    () => ((results as any[]) ?? []).filter((r) => inRange(r.exams?.exam_date)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [results, range.from, range.to],
  );

  const subjectRows = useMemo(() => {
    // Aggregate per subject across exams within range
    const map = new Map<
      string,
      {
        subject: string;
        got: number;
        max: number;
        grade: string;
        remarks: string[];
        classAvg: number;
      }
    >();
    for (const r of filteredResults) {
      const subj = r.exams?.subjects?.name || "—";
      const g = map.get(subj) ?? {
        subject: subj,
        got: 0,
        max: 0,
        grade: r.grade || "",
        remarks: [] as string[],
        classAvg: classAvgBySubject[subj] ?? 0,
      };
      g.got += Number(r.marks_obtained) || 0;
      g.max += Number(r.exams?.max_marks) || 0;
      if (r.remarks) g.remarks.push(r.remarks);
      if (r.grade) g.grade = r.grade;
      map.set(subj, g);
    }
    return Array.from(map.values()).map((r) => {
      const pct = r.max ? Math.round((r.got / r.max) * 100) : 0;
      return { ...r, pct, grade: r.grade || gradeFor(pct) };
    });
  }, [filteredResults, classAvgBySubject]);

  const overallAcademic = useMemo(() => {
    const got = subjectRows.reduce((a, r) => a + r.got, 0);
    const max = subjectRows.reduce((a, r) => a + r.max, 0);
    const pct = max ? Math.round((got / max) * 100) : null;
    return { got, max, pct, grade: gradeFor(pct) };
  }, [subjectRows]);

  const trendData = useMemo(() => {
    // Per-exam percentage sorted by date
    const rows = ((results as any[]) ?? [])
      .filter((r) => r.exams?.exam_date)
      .map((r) => ({
        name: r.exams?.name || "Exam",
        date: r.exams.exam_date as string,
        pct: r.exams?.max_marks
          ? Math.round((Number(r.marks_obtained) / Number(r.exams.max_marks)) * 100)
          : 0,
      }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    return rows.slice(-8);
  }, [results]);

  // ---------- Attendance ----------
  const attInRange = useMemo(
    () => ((attendance as any[]) ?? []).filter((r) => inRange(r.date)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [attendance, range.from, range.to],
  );

  const attStats = useMemo(() => {
    const total = attInRange.length;
    const present = attInRange.filter((r) => r.status === "present").length;
    const late = attInRange.filter((r) => r.status === "late").length;
    const absent = attInRange.filter((r) => r.status === "absent").length;
    const leave = attInRange.filter((r) => r.status === "excused").length;
    const pct = total ? Math.round(((present + late) / total) * 100) : 0;
    return { total, present, late, absent, leave, pct };
  }, [attInRange]);

  const heatmap = useMemo(() => {
    const byDate = new Map<string, string>();
    for (const r of attInRange) byDate.set(r.date, r.status);
    // Build a list of days from range.from to range.to (cap ~180 days)
    const days: { iso: string; status?: string; isWeekend: boolean }[] = [];
    const from = new Date(range.from);
    const to = new Date(Math.min(range.to.getTime(), from.getTime() + 180 * 86400000));
    const cur = new Date(from);
    while (cur <= to) {
      const iso = cur.toISOString().slice(0, 10);
      days.push({
        iso,
        status: byDate.get(iso),
        isWeekend: cur.getDay() === 0 || cur.getDay() === 6,
      });
      cur.setDate(cur.getDate() + 1);
    }
    return days;
  }, [attInRange, range.from, range.to]);

  // ---------- Homework ----------
  const homeworkRows = useMemo(() => {
    const subMap = new Map<string, any>();
    for (const s of (submissions as any[]) ?? []) subMap.set(s.homework_id, s);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return ((assignedHomework as any[]) ?? [])
      .filter((hw) => inRange(hw.assigned_date))
      .map((hw) => {
        const sub = subMap.get(hw.id);
        const due = hw.due_date ? new Date(hw.due_date) : null;
        const submittedAt = sub?.submitted_at ? new Date(sub.submitted_at) : null;
        let status: "submitted" | "late" | "pending" | "missed" = "pending";
        if (submittedAt) status = due && submittedAt > due ? "late" : "submitted";
        else if (due && due < today) status = "missed";
        return { hw, sub, status };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignedHomework, submissions, range.from, range.to]);

  const hwStats = useMemo(() => {
    const total = homeworkRows.length;
    const submitted = homeworkRows.filter((h) => h.status === "submitted").length;
    const late = homeworkRows.filter((h) => h.status === "late").length;
    const missed = homeworkRows.filter((h) => h.status === "missed").length;
    const pending = homeworkRows.filter((h) => h.status === "pending").length;
    const rate = total ? Math.round(((submitted + late) / total) * 100) : 0;
    return { total, submitted, late, missed, pending, rate };
  }, [homeworkRows]);

  // ---------- Progress notes ----------
  const notes = useMemo(() => {
    type Note = {
      date: string;
      teacher?: string;
      subject?: string;
      text: string;
      tone: "positive" | "attention" | "neutral";
    };
    const out: Note[] = [];
    const classify = (t: string): Note["tone"] => {
      const s = t.toLowerCase();
      if (/(excellent|great|good|improv|well done|outstanding|congrat)/.test(s)) return "positive";
      if (/(needs|improve|weak|poor|attention|late|missed|struggl|absent)/.test(s))
        return "attention";
      return "neutral";
    };
    for (const r of filteredResults) {
      if (r.remarks)
        out.push({
          date: r.exams?.exam_date || "",
          subject: r.exams?.subjects?.name,
          text: r.remarks,
          tone: classify(r.remarks),
        });
    }
    for (const h of homeworkRows) {
      if (h.sub?.remarks)
        out.push({
          date: h.sub.reviewed_at || h.sub.submitted_at || h.hw.assigned_date || "",
          teacher: h.hw.teachers?.full_name,
          subject: h.hw.subjects?.name,
          text: h.sub.remarks,
          tone: classify(h.sub.remarks),
        });
    }
    return out.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 30);
  }, [filteredResults, homeworkRows]);

  // ---------- Helpers ----------
  const hwBadge = (s: string) => {
    if (s === "submitted")
      return <Badge className="bg-emerald-100 text-emerald-700 border-0">Submitted</Badge>;
    if (s === "late") return <Badge className="bg-orange-100 text-orange-700 border-0">Late</Badge>;
    if (s === "missed") return <Badge className="bg-red-100 text-red-700 border-0">Missed</Badge>;
    return <Badge className="bg-amber-100 text-amber-700 border-0">Pending</Badge>;
  };
  const toneBadge = (t: string) => {
    if (t === "positive")
      return <Badge className="bg-emerald-100 text-emerald-700 border-0">Positive</Badge>;
    if (t === "attention")
      return <Badge className="bg-red-100 text-red-700 border-0">Needs improvement</Badge>;
    return <Badge className="bg-slate-100 text-slate-700 border-0">Neutral</Badge>;
  };
  const cellClass = (status?: string, weekend?: boolean) => {
    if (weekend) return "bg-slate-100";
    if (!status) return "bg-slate-50";
    if (status === "present") return "bg-emerald-400";
    if (status === "late") return "bg-amber-300";
    if (status === "excused") return "bg-sky-300";
    if (status === "absent") return "bg-red-400";
    return "bg-slate-100";
  };

  const chartData = subjectRows.map((r) => ({ subject: r.subject, You: r.pct, Class: r.classAvg }));
  const conductRating =
    attStats.pct >= 90 && hwStats.rate >= 80
      ? "Excellent"
      : attStats.pct >= 75
        ? "Good"
        : "Needs Improvement";

  if (isLoading)
    return (
      <AppShell>
        <div className="p-8 text-muted-foreground">Loading report…</div>
      </AppShell>
    );
  if (!student)
    return (
      <AppShell>
        <div className="p-8">Student not found.</div>
      </AppShell>
    );

  const s: any = student;
  const cls = s.classes
    ? `${s.classes.name}${s.classes.section ? ` · ${s.classes.section}` : ""}`
    : "No class yet";

  const sections = [
    { id: "academic", label: "Academic", icon: BookOpenCheck },
    { id: "attendance", label: "Attendance", icon: ClipboardCheck },
    { id: "homework", label: "Homework", icon: NotebookPen },
    { id: "notes", label: "Progress Notes", icon: MessageSquare },
    { id: "summary", label: "Report Card", icon: Award },
  ];

  return (
    <AppShell>
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center gap-2 sm:gap-3 print:hidden">
        <Link to="/students/$studentId" params={{ studentId }}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="size-4" /> Back
          </Button>
        </Link>
        <div className="ml-auto flex flex-wrap items-center gap-2 min-w-0">
          <Select value={period} onValueChange={(v) => setPeriod(v as PeriodKey)}>
            <SelectTrigger className="w-[140px] sm:w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="term1">Term 1</SelectItem>
              <SelectItem value="term2">Term 2</SelectItem>
              <SelectItem value="term3">Term 3</SelectItem>
              <SelectItem value="annual">Annual</SelectItem>
              <SelectItem value="custom">Custom range</SelectItem>
            </SelectContent>
          </Select>
          {period === "custom" && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-9 min-w-0 rounded-md border bg-background px-2 text-sm"
              />
              <span className="text-muted-foreground text-sm">to</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-9 min-w-0 rounded-md border bg-background px-2 text-sm"
              />
            </div>
          )}
          <Button
            size="sm"
            onClick={async () => {
              const url = await apiFileObjectUrl(`/students/${studentId}/report-card.pdf`);
              if (url) window.open(url, "_blank", "noopener");
              else toast.error("Could not open the report card");
            }}
          >
            <Download className="size-4" />{" "}
            <span className="hidden sm:inline">Report card PDF</span>
            <span className="sm:hidden">PDF</span>
          </Button>
        </div>
      </div>

      <Card className="rounded-2xl p-4 sm:p-6 mb-4">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <Avatar className="size-16 shrink-0">
            <AvatarFallback className="text-lg bg-stat-indigo text-stat-indigo-foreground">
              {initials(s.profiles?.full_name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="font-display text-xl sm:text-2xl font-semibold break-words">
              {s.profiles?.full_name}
            </div>
            <div className="text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 mt-1">
              <span>
                <GraduationCap className="size-3.5 inline mr-1" />
                {cls}
              </span>
              <span>Admission: {s.admission_no || "—"}</span>
              <span>Roll: {s.roll_no || "—"}</span>
              <span>Period: {range.label}</span>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6 min-w-0">
        {/* TOC */}
        <aside className="print:hidden min-w-0 w-full">
          <div className="lg:sticky lg:top-4 min-w-0">
            {/* Mobile chips */}
            <div className="lg:hidden pb-3 overflow-x-auto max-w-full w-full">
              <div className="flex gap-2 w-max pr-2">
                {sections.map((s) => (
                  <a
                    key={s.id}
                    href={`#${s.id}`}
                    className="whitespace-nowrap rounded-full border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted"
                  >
                    {s.label}
                  </a>
                ))}
              </div>
            </div>
            {/* Desktop list */}
            <Card className="rounded-2xl p-3 hidden lg:block">
              <div className="text-xs uppercase text-muted-foreground px-2 pb-2">On this page</div>
              <nav className="flex flex-col">
                {sections.map(({ id, label, icon: Icon }) => (
                  <a
                    key={id}
                    href={`#${id}`}
                    className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-muted"
                  >
                    <Icon className="size-4 text-muted-foreground" /> {label}
                  </a>
                ))}
              </nav>
            </Card>
          </div>
        </aside>

        <div className="space-y-8">
          {/* Section 1: Academic */}
          <section id="academic" className="scroll-mt-24">
            <h2 className="font-display text-xl font-semibold mb-3 flex items-center gap-2">
              <BookOpenCheck className="size-5" /> Academic Performance
            </h2>

            <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
              <Card className="rounded-2xl p-4">
                <div className="text-xs text-muted-foreground">Total marks</div>
                <div className="font-display text-lg sm:text-2xl font-semibold mt-1 break-words">
                  {overallAcademic.got} / {overallAcademic.max || "—"}
                </div>
              </Card>
              <Card className="rounded-2xl p-4">
                <div className="text-xs text-muted-foreground">Percentage</div>
                <div className="font-display text-lg sm:text-2xl font-semibold mt-1">
                  {overallAcademic.pct == null ? "—" : `${overallAcademic.pct}%`}
                </div>
              </Card>
              <Card className="rounded-2xl p-4">
                <div className="text-xs text-muted-foreground">Overall grade</div>
                <div className="font-display text-lg sm:text-2xl font-semibold mt-1">
                  {overallAcademic.grade}
                </div>
              </Card>
            </div>

            <Card className="rounded-2xl overflow-hidden mb-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[560px]">
                  <thead className="bg-muted/50 text-left">
                    <tr>
                      <th className="p-3">Subject</th>
                      <th className="p-3">Marks</th>
                      <th className="p-3">Max</th>
                      <th className="p-3">%</th>
                      <th className="p-3">Grade</th>
                      <th className="p-3">Class avg</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subjectRows.map((r) => (
                      <tr key={r.subject} className="border-t">
                        <td className="p-3 font-medium">{r.subject}</td>
                        <td className="p-3">{r.got}</td>
                        <td className="p-3">{r.max}</td>
                        <td className="p-3">{r.pct}%</td>
                        <td className="p-3">{r.grade}</td>
                        <td className="p-3 text-muted-foreground">
                          {r.classAvg ? `${r.classAvg}%` : "—"}
                        </td>
                      </tr>
                    ))}
                    {subjectRows.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-muted-foreground">
                          No exam results in this period.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            <div className="grid lg:grid-cols-2 gap-4 mb-4">
              <Card className="rounded-2xl p-4">
                <div className="text-sm font-medium mb-2">You vs class average</div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="subject" fontSize={11} />
                      <YAxis fontSize={11} domain={[0, 100]} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="You" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                      <Bar
                        dataKey="Class"
                        fill="hsl(var(--muted-foreground))"
                        radius={[6, 6, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <Card className="rounded-2xl p-4">
                <div className="text-sm font-medium mb-2">Performance trend</div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="name" fontSize={11} />
                      <YAxis fontSize={11} domain={[0, 100]} />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="pct"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>

            {subjectRows.some((r) => r.remarks.length > 0) && (
              <Card className="rounded-2xl p-4">
                <div className="text-sm font-medium mb-3">Subject-wise teacher remarks</div>
                <div className="grid md:grid-cols-2 gap-3">
                  {subjectRows
                    .filter((r) => r.remarks.length)
                    .map((r) => (
                      <div key={r.subject} className="rounded-xl border p-3 bg-muted/30">
                        <div className="font-medium">{r.subject}</div>
                        <ul className="mt-1 space-y-1 text-sm text-muted-foreground list-disc pl-4">
                          {r.remarks.map((rk, i) => (
                            <li key={i}>{rk}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                </div>
              </Card>
            )}
          </section>

          {/* Section 2: Attendance */}
          <section id="attendance" className="scroll-mt-24">
            <h2 className="font-display text-xl font-semibold mb-3 flex items-center gap-2">
              <ClipboardCheck className="size-5" /> Attendance Summary
            </h2>
            <div className="grid sm:grid-cols-[180px_1fr] md:grid-cols-[220px_1fr] gap-4">
              <Card className="rounded-2xl p-4 flex flex-col items-center justify-center">
                <div className="relative size-36 sm:size-40">
                  <svg viewBox="0 0 36 36" className="size-36 sm:size-40 -rotate-90">
                    <circle
                      cx="18"
                      cy="18"
                      r="15.9"
                      fill="none"
                      stroke="hsl(var(--muted))"
                      strokeWidth="3"
                    />
                    <circle
                      cx="18"
                      cy="18"
                      r="15.9"
                      fill="none"
                      stroke={
                        attStats.pct >= 85
                          ? "rgb(52 211 153)"
                          : attStats.pct >= 70
                            ? "rgb(251 191 36)"
                            : "rgb(248 113 113)"
                      }
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeDasharray={`${attStats.pct}, 100`}
                    />
                  </svg>
                  <div className="absolute inset-0 grid place-items-center">
                    <div className="text-center">
                      <div className="font-display text-3xl font-semibold">{attStats.pct}%</div>
                      <div className="text-xs text-muted-foreground">Attendance</div>
                    </div>
                  </div>
                </div>
              </Card>
              <Card className="rounded-2xl p-4 min-w-0">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4">
                  <div className="rounded-xl bg-emerald-50 p-3">
                    <div className="text-xs text-emerald-700">Present</div>
                    <div className="text-xl font-semibold text-emerald-800">{attStats.present}</div>
                  </div>
                  <div className="rounded-xl bg-red-50 p-3">
                    <div className="text-xs text-red-700">Absent</div>
                    <div className="text-xl font-semibold text-red-800">{attStats.absent}</div>
                  </div>
                  <div className="rounded-xl bg-amber-50 p-3">
                    <div className="text-xs text-amber-700">Late</div>
                    <div className="text-xl font-semibold text-amber-800">{attStats.late}</div>
                  </div>
                  <div className="rounded-xl bg-sky-50 p-3">
                    <div className="text-xs text-sky-700">On leave</div>
                    <div className="text-xl font-semibold text-sky-800">{attStats.leave}</div>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground mb-2">
                  Heatmap ({heatmap.length} days)
                </div>
                <div className="flex flex-wrap gap-1">
                  {heatmap.map((d) => (
                    <div
                      key={d.iso}
                      title={`${d.iso}${d.status ? ` · ${d.status}` : ""}`}
                      className={`size-3.5 rounded-sm ${cellClass(d.status, d.isWeekend)}`}
                    />
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="size-3 rounded-sm bg-emerald-400" /> Present
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="size-3 rounded-sm bg-amber-300" /> Late
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="size-3 rounded-sm bg-red-400" /> Absent
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="size-3 rounded-sm bg-sky-300" /> Leave
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="size-3 rounded-sm bg-slate-100" /> Weekend / no data
                  </span>
                </div>
                <div className="mt-4 print:hidden">
                  <Link to="/students/$studentId" params={{ studentId }}>
                    <Button variant="outline" size="sm">
                      View full attendance breakdown
                    </Button>
                  </Link>
                </div>
              </Card>
            </div>
          </section>

          {/* Section 3: Homework */}
          <section id="homework" className="scroll-mt-24">
            <h2 className="font-display text-xl font-semibold mb-3 flex items-center gap-2">
              <NotebookPen className="size-5" /> Homework & Assignments
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-3 mb-3">
              <Card className="rounded-2xl p-3">
                <div className="text-xs text-muted-foreground">Total</div>
                <div className="text-xl font-semibold">{hwStats.total}</div>
              </Card>
              <Card className="rounded-2xl p-3">
                <div className="text-xs text-emerald-700">Submitted</div>
                <div className="text-xl font-semibold text-emerald-800">{hwStats.submitted}</div>
              </Card>
              <Card className="rounded-2xl p-3">
                <div className="text-xs text-orange-700">Late</div>
                <div className="text-xl font-semibold text-orange-800">{hwStats.late}</div>
              </Card>
              <Card className="rounded-2xl p-3">
                <div className="text-xs text-red-700">Missed</div>
                <div className="text-xl font-semibold text-red-800">{hwStats.missed}</div>
              </Card>
              <Card className="rounded-2xl p-3">
                <div className="text-xs text-muted-foreground">Submission rate</div>
                <div className="text-xl font-semibold">{hwStats.rate}%</div>
              </Card>
            </div>
            <Card className="rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[620px]">
                  <thead className="bg-muted/50 text-left">
                    <tr>
                      <th className="p-3">Subject</th>
                      <th className="p-3">Title</th>
                      <th className="p-3">Due</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Grade / Remark</th>
                    </tr>
                  </thead>
                  <tbody>
                    {homeworkRows.map(({ hw, sub, status }) => (
                      <tr key={hw.id} className="border-t">
                        <td className="p-3">{hw.subjects?.name || "—"}</td>
                        <td className="p-3 font-medium">{hw.title}</td>
                        <td className="p-3 whitespace-nowrap">
                          {hw.due_date ? hw.due_date.slice(0, 10) : "—"}
                        </td>
                        <td className="p-3">{hwBadge(status)}</td>
                        <td className="p-3 text-muted-foreground">
                          {sub?.marks != null
                            ? `${sub.marks}${hw.max_marks ? ` / ${hw.max_marks}` : ""}`
                            : ""}
                          {sub?.remarks ? <div className="text-xs">{sub.remarks}</div> : null}
                        </td>
                      </tr>
                    ))}
                    {homeworkRows.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-muted-foreground">
                          No assignments in this period.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
            <div className="mt-3 print:hidden">
              <Link to="/students/$studentId" params={{ studentId }}>
                <Button variant="outline" size="sm">
                  View full homework history
                </Button>
              </Link>
            </div>
          </section>

          {/* Section 4: Progress notes */}
          <section id="notes" className="scroll-mt-24">
            <h2 className="font-display text-xl font-semibold mb-3 flex items-center gap-2">
              <MessageSquare className="size-5" /> Progress Notes & Teacher Remarks
            </h2>
            <Card className="rounded-2xl p-4">
              {notes.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-6">
                  No teacher remarks in this period.
                </div>
              ) : (
                <ol className="relative border-l pl-6 space-y-4">
                  {notes.map((n, i) => (
                    <li key={i} className="relative">
                      <span className="absolute -left-[27px] top-1.5 size-3 rounded-full bg-primary" />
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {n.date && <span>{String(n.date).slice(0, 10)}</span>}
                        {n.subject && <span>· {n.subject}</span>}
                        {n.teacher && <span>· {n.teacher}</span>}
                        {toneBadge(n.tone)}
                      </div>
                      <div className="text-sm mt-1">{n.text}</div>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </section>

          {/* Section 5: Report card */}
          <section id="summary" className="scroll-mt-24">
            <h2 className="font-display text-xl font-semibold mb-3 flex items-center gap-2">
              <Award className="size-5" /> Overall Report Card
            </h2>
            <Card className="rounded-2xl border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-4 sm:p-6 md:p-8">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                <div className="min-w-0">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    Report Card
                  </div>
                  <div className="font-display text-xl sm:text-2xl font-semibold break-words">
                    {s.profiles?.full_name}
                  </div>
                  <div className="text-sm text-muted-foreground break-words">
                    {cls} · {range.label} · {s.classes?.academic_year || ""}
                  </div>
                </div>
                <div className="md:text-right">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    Admission
                  </div>
                  <div className="font-medium">{s.admission_no || "—"}</div>
                </div>
              </div>
              <Separator className="mb-6" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div>
                  <div className="text-xs text-muted-foreground">Overall grade</div>
                  <div className="font-display text-3xl font-semibold">{overallAcademic.grade}</div>
                  <div className="text-xs text-muted-foreground">
                    {overallAcademic.pct == null ? "—" : `${overallAcademic.pct}%`}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Attendance</div>
                  <div className="font-display text-3xl font-semibold">{attStats.pct}%</div>
                  <div className="text-xs text-muted-foreground">
                    {attStats.present}/{attStats.total} days
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Conduct</div>
                  <div className="font-display text-2xl font-semibold">{conductRating}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Promotion</div>
                  <div className="font-display text-2xl font-semibold">
                    {overallAcademic.pct != null && overallAcademic.pct >= 40 && attStats.pct >= 60
                      ? "Promoted"
                      : "Under review"}
                  </div>
                </div>
              </div>
              <Separator className="my-6" />
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                  Class teacher's remark
                </div>
                <p className="text-sm">
                  {overallAcademic.pct == null
                    ? "Awaiting exam results for this period."
                    : overallAcademic.pct >= 75
                      ? `${(s.profiles?.full_name || "The student").split(" ")[0]} has performed excellently this ${range.label.toLowerCase()}. Keep up the great work!`
                      : overallAcademic.pct >= 50
                        ? `${(s.profiles?.full_name || "The student").split(" ")[0]} has shown steady progress. With more focus on weaker subjects, further improvement is possible.`
                        : `${(s.profiles?.full_name || "The student").split(" ")[0]} needs additional support to strengthen fundamentals. We recommend targeted practice and regular attendance.`}
                </p>
              </div>
              <div className="mt-8 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                <div>Generated: {new Date().toISOString().slice(0, 10)}</div>
                <div>Class teacher signature</div>
              </div>
            </Card>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
