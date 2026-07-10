import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell, PageHeader } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  ArrowLeft,
  GraduationCap,
  CalendarClock,
  TrendingUp,
  Wallet,
  BookOpenCheck,
  ClipboardCheck,
  NotebookPen,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
  Search,
  LayoutGrid,
  List,
} from "lucide-react";
import { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_authenticated/children/$studentId/")({
  component: ChildDetailPage,
});

const initials = (n?: string) =>
  (n ?? "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

function ChildDetailPage() {
  const { studentId } = Route.useParams();

  const { data: student, isLoading } = useQuery({
    queryKey: ["child-detail", studentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("students")
        .select(
          "id, admission_no, roll_no, admission_date, gender, profiles(full_name,email,phone), classes(id,name,section,academic_year)",
        )
        .eq("id", studentId)
        .maybeSingle();
      return data;
    },
  });

  const [attMonth, setAttMonth] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [attView, setAttView] = useState<"calendar" | "list">("calendar");
  const [hwSearch, setHwSearch] = useState("");
  const [hwSubject, setHwSubject] = useState<string>("all");
  const [hwStatus, setHwStatus] = useState<string>("all");
  const [hwRange, setHwRange] = useState<string>("all");

  const { data: attendance } = useQuery({
    queryKey: ["child-attendance", studentId],
    queryFn: async () => {
      const since = new Date();
      since.setMonth(since.getMonth() - 6);
      since.setDate(1);
      const { data } = await supabase
        .from("attendance")
        .select("date,status,note")
        .eq("student_id", studentId)
        .gte("date", since.toISOString().slice(0, 10))
        .order("date", { ascending: false });
      return data ?? [];
    },
  });

  const { data: results } = useQuery({
    queryKey: ["child-results", studentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("exam_results")
        .select("marks_obtained,grade,remarks,exams(name,exam_date,max_marks,subjects(name))")
        .eq("student_id", studentId);
      return data ?? [];
    },
  });

  const { data: fees } = useQuery({
    queryKey: ["child-fees", studentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("fee_assignments")
        .select("amount_due,amount_paid,status,due_date,fee_structures(name,term)")
        .eq("student_id", studentId)
        .order("due_date", { ascending: true });
      return data ?? [];
    },
  });

  const classId: string | undefined = (student as any)?.classes?.id;

  const { data: assignedHomework } = useQuery({
    enabled: !!classId,
    queryKey: ["child-hw-assigned", classId],
    queryFn: async () => {
      const { data } = await supabase
        .from("homework")
        .select("id,title,assigned_date,due_date,max_marks,subjects(name)")
        .eq("class_id", classId!)
        .order("assigned_date", { ascending: false })
        .limit(100);
      return data ?? [];
    },
  });

  const { data: submissionsAll } = useQuery({
    queryKey: ["child-hw-all", studentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("homework_submissions")
        .select("homework_id,submitted_at,marks,remarks,status")
        .eq("student_id", studentId);
      return data ?? [];
    },
  });

  const homeworkHistory = useMemo(() => {
    const subMap = new Map<string, any>();
    for (const s of submissionsAll ?? []) subMap.set(s.homework_id, s);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return ((assignedHomework as any[]) ?? []).map((hw) => {
      const sub = subMap.get(hw.id);
      const due = hw.due_date ? new Date(hw.due_date) : null;
      const submittedAt = sub?.submitted_at ? new Date(sub.submitted_at) : null;
      let status: "submitted" | "late" | "pending" | "missed" = "pending";
      if (submittedAt) {
        status = due && submittedAt > due ? "late" : "submitted";
      } else if (due && due < today) {
        status = "missed";
      }
      return { hw, sub, status };
    });
  }, [assignedHomework, submissionsAll]);

  const hwSubjects = useMemo(() => {
    const set = new Set<string>();
    for (const { hw } of homeworkHistory) {
      const n = hw.subjects?.name;
      if (n) set.add(n);
    }
    return Array.from(set).sort();
  }, [homeworkHistory]);

  const filteredHomework = useMemo(() => {
    const now = new Date();
    const firstThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const firstLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    const term = hwSearch.trim().toLowerCase();
    return homeworkHistory.filter(({ hw, status }) => {
      if (hwSubject !== "all" && hw.subjects?.name !== hwSubject) return false;
      if (hwStatus !== "all" && status !== hwStatus) return false;
      if (term && !(hw.title || "").toLowerCase().includes(term)) return false;
      if (hwRange !== "all" && hw.assigned_date) {
        const d = new Date(hw.assigned_date);
        if (hwRange === "this-month" && d < firstThisMonth) return false;
        if (hwRange === "last-month" && (d < firstLastMonth || d > endLastMonth)) return false;
      }
      return true;
    });
  }, [homeworkHistory, hwSearch, hwSubject, hwStatus, hwRange]);

  const hwSummary = useMemo(() => {
    const total = homeworkHistory.length;
    const submitted = homeworkHistory.filter((h) => h.status === "submitted").length;
    const pending = homeworkHistory.filter((h) => h.status === "pending").length;
    const late = homeworkHistory.filter((h) => h.status === "late").length;
    const missed = homeworkHistory.filter((h) => h.status === "missed").length;
    const submittedPct = total ? Math.round(((submitted + late) / total) * 100) : 0;
    return { total, submitted, pending, late, missed, submittedPct };
  }, [homeworkHistory]);

  const attendanceMonthly = useMemo(() => {
    const groups = new Map<
      string,
      { key: string; label: string; rows: any[]; p: number; a: number; l: number; e: number }
    >();
    for (const r of attendance ?? []) {
      const d = new Date(r.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleString(undefined, { month: "long", year: "numeric" });
      let g = groups.get(key);
      if (!g) {
        g = { key, label, rows: [], p: 0, a: 0, l: 0, e: 0 };
        groups.set(key, g);
      }
      g.rows.push(r);
      if (r.status === "present") g.p += 1;
      else if (r.status === "late") g.l += 1;
      else if (r.status === "excused") g.e += 1;
      else if (r.status === "absent") g.a += 1;
    }
    return Array.from(groups.values()).sort((x, y) => (x.key < y.key ? 1 : -1));
  }, [attendance]);

  const hwStatusBadge = (s: string) => {
    if (s === "submitted")
      return <Badge className="bg-emerald-100 text-emerald-700 border-0">Submitted</Badge>;
    if (s === "late") return <Badge className="bg-orange-100 text-orange-700 border-0">Late</Badge>;
    if (s === "missed") return <Badge className="bg-red-100 text-red-700 border-0">Missed</Badge>;
    return <Badge className="bg-amber-100 text-amber-700 border-0">Pending</Badge>;
  };

  // ----- Attendance helpers (calendar + trend) -----
  const attByDate = useMemo(() => {
    const m = new Map<string, any>();
    for (const r of attendance ?? []) m.set(r.date, r);
    return m;
  }, [attendance]);

  const monthLabel = attMonth.toLocaleString(undefined, { month: "long", year: "numeric" });
  const calendarCells = useMemo(() => {
    const first = new Date(attMonth);
    const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const startPad = first.getDay(); // 0=Sun
    const cells: Array<{
      date: Date | null;
      iso?: string;
      status?: string;
      note?: string | null;
      isWeekend?: boolean;
      isFuture?: boolean;
    } | null> = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(first.getFullYear(), first.getMonth(), d);
      const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
      const rec = attByDate.get(iso);
      const dow = dt.getDay();
      cells.push({
        date: dt,
        iso,
        status: rec?.status,
        note: rec?.note,
        isWeekend: dow === 0 || dow === 6,
        isFuture: dt > today,
      });
    }
    return cells;
  }, [attMonth, attByDate]);

  const monthSummary = useMemo(() => {
    let p = 0,
      a = 0,
      l = 0,
      e = 0,
      total = 0;
    for (const c of calendarCells) {
      if (!c || !c.status) continue;
      total += 1;
      if (c.status === "present") p += 1;
      else if (c.status === "late") l += 1;
      else if (c.status === "excused") e += 1;
      else if (c.status === "absent") a += 1;
    }
    const pct = total ? Math.round(((p + l) / total) * 100) : 0;
    return { p, a, l, e, total, pct };
  }, [calendarCells]);

  const trendData = useMemo(() => {
    const now = new Date();
    const months: { key: string; label: string; pct: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      let total = 0,
        present = 0;
      for (const r of attendance ?? []) {
        if (r.date.startsWith(key)) {
          total += 1;
          if (r.status === "present" || r.status === "late") present += 1;
        }
      }
      months.push({
        key,
        label: d.toLocaleString(undefined, { month: "short" }),
        pct: total ? Math.round((present / total) * 100) : 0,
      });
    }
    return months;
  }, [attendance]);

  const shiftMonth = (delta: number) => {
    setAttMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const attStats = useMemo(() => {
    const rows = attendance ?? [];
    const total = rows.length;
    const present = rows.filter((r) => r.status === "present" || r.status === "late").length;
    const absent = rows.filter((r) => r.status === "absent").length;
    const late = rows.filter((r) => r.status === "late").length;
    const excused = rows.filter((r) => r.status === "excused").length;
    const pct = total ? Math.round((present / total) * 100) : null;
    return { total, present, absent, late, excused, pct };
  }, [attendance]);

  const perfStats = useMemo(() => {
    const rows = (results ?? []) as any[];
    let got = 0,
      max = 0;
    for (const r of rows) {
      got += Number(r.marks_obtained) || 0;
      max += Number(r.exams?.max_marks) || 0;
    }
    const pct = max ? Math.round((got / max) * 100) : null;
    const grade =
      pct == null
        ? "—"
        : pct >= 85
          ? "A"
          : pct >= 70
            ? "B"
            : pct >= 55
              ? "C"
              : pct >= 40
                ? "D"
                : "E";
    return { got, max, pct, grade, count: rows.length };
  }, [results]);

  const feeStats = useMemo(() => {
    const rows = fees ?? [];
    const due = rows.reduce((a, r) => a + Number(r.amount_due || 0), 0);
    const paid = rows.reduce((a, r) => a + Number(r.amount_paid || 0), 0);
    return {
      due,
      paid,
      outstanding: Math.max(due - paid, 0),
      pct: due ? Math.round((paid / due) * 100) : 0,
    };
  }, [fees]);

  const statusBadge = (s: string) => {
    if (s === "present")
      return (
        <Badge className="bg-emerald-100 text-emerald-700 border-0">
          <CheckCircle2 className="size-3 mr-1" />
          Present
        </Badge>
      );
    if (s === "late")
      return (
        <Badge className="bg-amber-100 text-amber-700 border-0">
          <Clock className="size-3 mr-1" />
          Late
        </Badge>
      );
    if (s === "excused") return <Badge className="bg-sky-100 text-sky-700 border-0">Excused</Badge>;
    return (
      <Badge className="bg-red-100 text-red-700 border-0">
        <XCircle className="size-3 mr-1" />
        Absent
      </Badge>
    );
  };

  const feeBadge = (s?: string) => {
    if (s === "paid")
      return <Badge className="bg-emerald-100 text-emerald-700 border-0">Paid</Badge>;
    if (s === "partial")
      return <Badge className="bg-amber-100 text-amber-700 border-0">Partial</Badge>;
    return <Badge className="bg-red-100 text-red-700 border-0">Pending</Badge>;
  };

  if (isLoading) {
    return (
      <AppShell>
        <div className="p-8 text-muted-foreground">Loading student details…</div>
      </AppShell>
    );
  }
  if (!student) {
    return (
      <AppShell>
        <PageHeader title="Student not found" subtitle="You may not have access to this student." />
        <Link to="/children">
          <Button variant="outline">
            <ArrowLeft className="size-4" /> Back to my children
          </Button>
        </Link>
      </AppShell>
    );
  }

  const s: any = student;
  const cls = s.classes
    ? `${s.classes.name}${s.classes.section ? ` · ${s.classes.section}` : ""}`
    : "No class yet";

  return (
    <AppShell>
      <div className="mb-4">
        <Link to="/children">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="size-4" /> Back
          </Button>
        </Link>
      </div>

      {/* Profile header */}
      <Card className="rounded-2xl p-6 mb-4">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <Avatar className="size-16">
            <AvatarFallback className="text-lg bg-stat-indigo text-stat-indigo-foreground">
              {initials(s.profiles?.full_name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <div className="font-display text-2xl font-semibold">{s.profiles?.full_name}</div>
            <div className="text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 mt-1">
              <span>
                <GraduationCap className="size-3.5 inline mr-1" />
                {cls}
              </span>
              <span>Admission: {s.admission_no || "—"}</span>
              <span>Roll: {s.roll_no || "—"}</span>
              {s.gender && <span className="capitalize">{s.gender}</span>}
              <span>Admitted: {new Date(s.admission_date).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card className="rounded-2xl p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ClipboardCheck className="size-3.5" />
            Attendance (last 120d)
          </div>
          <div className="font-display text-2xl font-semibold mt-1">
            {attStats.pct == null ? "—" : `${attStats.pct}%`}
          </div>
          <div className="text-xs text-muted-foreground">
            {attStats.present}/{attStats.total} present
          </div>
        </Card>
        <Card className="rounded-2xl p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <TrendingUp className="size-3.5" />
            Overall performance
          </div>
          <div className="font-display text-2xl font-semibold mt-1">
            {perfStats.pct == null ? "—" : `${perfStats.pct}% · ${perfStats.grade}`}
          </div>
          <div className="text-xs text-muted-foreground">{perfStats.count} exam(s)</div>
        </Card>
        <Card className="rounded-2xl p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Wallet className="size-3.5" />
            Fees paid
          </div>
          <div className="font-display text-2xl font-semibold mt-1">
            ₹{feeStats.paid.toLocaleString("en-IN")}
          </div>
          <Progress value={feeStats.pct} className="mt-2 h-1.5" />
        </Card>
        <Card className="rounded-2xl p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarClock className="size-3.5" />
            Outstanding
          </div>
          <div className="font-display text-2xl font-semibold mt-1">
            ₹{feeStats.outstanding.toLocaleString("en-IN")}
          </div>
          <div className="text-xs text-muted-foreground">
            of ₹{feeStats.due.toLocaleString("en-IN")}
          </div>
        </Card>
      </div>

      <Tabs defaultValue="attendance">
        <TabsList>
          <TabsTrigger value="attendance">
            <ClipboardCheck className="size-4 mr-1" />
            Attendance
          </TabsTrigger>
          <TabsTrigger value="marks">
            <BookOpenCheck className="size-4 mr-1" />
            Marksheet
          </TabsTrigger>
          <TabsTrigger value="homework">
            <NotebookPen className="size-4 mr-1" />
            Homework
          </TabsTrigger>
          <TabsTrigger value="fees">
            <Wallet className="size-4 mr-1" />
            Fees
          </TabsTrigger>
        </TabsList>

        <TabsContent value="attendance">
          <Card className="rounded-2xl overflow-hidden mb-4">
            <div className="p-4 flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30">
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => shiftMonth(-1)}
                  aria-label="Previous month"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <div className="min-w-[10rem] text-center font-display font-semibold">
                  {monthLabel}
                </div>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => shiftMonth(1)}
                  aria-label="Next month"
                >
                  <ChevronRight className="size-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const d = new Date();
                    d.setDate(1);
                    d.setHours(0, 0, 0, 0);
                    setAttMonth(d);
                  }}
                >
                  This month
                </Button>
              </div>
              <div className="flex items-center gap-1 rounded-lg border p-1">
                <Button
                  size="sm"
                  variant={attView === "calendar" ? "default" : "ghost"}
                  onClick={() => setAttView("calendar")}
                >
                  <LayoutGrid className="size-4 mr-1" />
                  Calendar
                </Button>
                <Button
                  size="sm"
                  variant={attView === "list" ? "default" : "ghost"}
                  onClick={() => setAttView("list")}
                >
                  <List className="size-4 mr-1" />
                  List
                </Button>
              </div>
            </div>

            {attView === "calendar" ? (
              <div className="p-4">
                <div className="grid grid-cols-7 gap-1 mb-2 text-[11px] uppercase tracking-wide text-muted-foreground text-center">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                    <div key={d}>{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {calendarCells.map((c, i) => {
                    if (!c) return <div key={i} className="aspect-square" />;
                    let cls = "bg-muted/40 text-muted-foreground";
                    if (c.status === "present")
                      cls = "bg-emerald-100 text-emerald-800 border-emerald-200";
                    else if (c.status === "late")
                      cls = "bg-amber-100 text-amber-800 border-amber-200";
                    else if (c.status === "excused")
                      cls = "bg-yellow-100 text-yellow-800 border-yellow-200";
                    else if (c.status === "absent") cls = "bg-red-100 text-red-800 border-red-200";
                    else if (c.isWeekend || c.isFuture) cls = "bg-muted/30 text-muted-foreground";
                    return (
                      <div
                        key={i}
                        title={c.note || c.status || ""}
                        className={`aspect-square rounded-lg border grid place-items-center text-sm ${cls}`}
                      >
                        {c.date?.getDate()}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="size-3 rounded bg-emerald-200 inline-block" /> Present
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="size-3 rounded bg-red-200 inline-block" /> Absent
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="size-3 rounded bg-amber-200 inline-block" /> Late
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="size-3 rounded bg-yellow-200 inline-block" /> Leave
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="size-3 rounded bg-muted inline-block" /> Weekend / No school
                  </span>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-secondary text-muted-foreground text-left">
                    <tr>
                      <th className="p-3 font-medium">Date</th>
                      <th className="p-3 font-medium">Day</th>
                      <th className="p-3 font-medium">Status</th>
                      <th className="p-3 font-medium">Remark</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calendarCells
                      .filter((c): c is NonNullable<typeof c> => !!c && !!c.status)
                      .map((c, i) => (
                        <tr key={i} className="border-t">
                          <td className="p-3">{c.date!.toLocaleDateString()}</td>
                          <td className="p-3 text-muted-foreground">
                            {c.date!.toLocaleDateString(undefined, { weekday: "long" })}
                          </td>
                          <td className="p-3">{statusBadge(c.status!)}</td>
                          <td className="p-3 text-muted-foreground">{c.note || "—"}</td>
                        </tr>
                      ))}
                    {monthSummary.total === 0 && (
                      <tr>
                        <td colSpan={4} className="p-8 text-center text-muted-foreground">
                          No attendance records for {monthLabel}.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Monthly summary card */}
          <Card className="rounded-2xl p-5 mb-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
              <div className="font-display font-semibold">{monthLabel} summary</div>
              <div className="text-sm text-muted-foreground">{monthSummary.pct}% attendance</div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
              <div className="rounded-xl bg-muted/40 p-3">
                <div className="text-[11px] uppercase text-muted-foreground">School days</div>
                <div className="font-semibold text-lg">{monthSummary.total}</div>
              </div>
              <div className="rounded-xl bg-emerald-50 p-3">
                <div className="text-[11px] uppercase text-emerald-700">Present</div>
                <div className="font-semibold text-lg text-emerald-700">{monthSummary.p}</div>
              </div>
              <div className="rounded-xl bg-red-50 p-3">
                <div className="text-[11px] uppercase text-red-700">Absent</div>
                <div className="font-semibold text-lg text-red-700">{monthSummary.a}</div>
              </div>
              <div className="rounded-xl bg-amber-50 p-3">
                <div className="text-[11px] uppercase text-amber-700">Late</div>
                <div className="font-semibold text-lg text-amber-700">{monthSummary.l}</div>
              </div>
              <div className="rounded-xl bg-yellow-50 p-3">
                <div className="text-[11px] uppercase text-yellow-700">Leave</div>
                <div className="font-semibold text-lg text-yellow-700">{monthSummary.e}</div>
              </div>
            </div>
          </Card>

          {/* 6-month trend */}
          <Card className="rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="size-4 text-primary" />
              <div className="font-display font-semibold">Last 6 months</div>
            </div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    formatter={(v: any) => [`${v}%`, "Attendance"]}
                    cursor={{ fill: "hsl(var(--muted))" }}
                  />
                  <Bar dataKey="pct" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="marks">
          <Card className="rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary text-muted-foreground text-left">
                  <tr>
                    <th className="p-3 font-medium">Exam</th>
                    <th className="p-3 font-medium">Subject</th>
                    <th className="p-3 font-medium">Date</th>
                    <th className="p-3 font-medium">Marks</th>
                    <th className="p-3 font-medium">%</th>
                    <th className="p-3 font-medium">Grade</th>
                    <th className="p-3 font-medium">Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {((results ?? []) as any[]).map((r, i) => {
                    const max = Number(r.exams?.max_marks) || 0;
                    const got = Number(r.marks_obtained) || 0;
                    const pct = max ? Math.round((got / max) * 100) : null;
                    return (
                      <tr key={i} className="border-t">
                        <td className="p-3 font-medium">{r.exams?.name || "—"}</td>
                        <td className="p-3">{r.exams?.subjects?.name || "—"}</td>
                        <td className="p-3 text-muted-foreground">
                          {r.exams?.exam_date
                            ? new Date(r.exams.exam_date).toLocaleDateString()
                            : "—"}
                        </td>
                        <td className="p-3">
                          {got}/{max}
                        </td>
                        <td className="p-3">{pct == null ? "—" : `${pct}%`}</td>
                        <td className="p-3 font-medium">{r.grade || "—"}</td>
                        <td className="p-3 text-muted-foreground">{r.remarks || "—"}</td>
                      </tr>
                    );
                  })}
                  {((results ?? []) as any[]).length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-muted-foreground">
                        No exam results yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="homework">
          {/* Summary strip */}
          <Card className="rounded-2xl overflow-hidden mb-4">
            <div className="p-4 grid grid-cols-2 md:grid-cols-5 gap-3 text-center bg-muted/40">
              <div>
                <div className="text-[11px] uppercase text-muted-foreground">Total</div>
                <div className="font-semibold text-lg">{hwSummary.total}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase text-emerald-700">Submitted %</div>
                <div className="font-semibold text-lg text-emerald-700">
                  {hwSummary.submittedPct}%
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase text-amber-700">Pending</div>
                <div className="font-semibold text-lg text-amber-700">{hwSummary.pending}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase text-orange-700">Late</div>
                <div className="font-semibold text-lg text-orange-700">{hwSummary.late}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase text-red-700">Missed</div>
                <div className="font-semibold text-lg text-red-700">{hwSummary.missed}</div>
              </div>
            </div>
          </Card>

          {/* Filters */}
          <Card className="rounded-2xl p-4 mb-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="relative">
                <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search assignments…"
                  className="pl-9"
                  value={hwSearch}
                  onChange={(e) => setHwSearch(e.target.value)}
                />
              </div>
              <Select value={hwSubject} onValueChange={setHwSubject}>
                <SelectTrigger>
                  <SelectValue placeholder="Subject" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All subjects</SelectItem>
                  {hwSubjects.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={hwStatus} onValueChange={setHwStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="late">Late</SelectItem>
                  <SelectItem value="missed">Missed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={hwRange} onValueChange={setHwRange}>
                <SelectTrigger>
                  <SelectValue placeholder="Date range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All time</SelectItem>
                  <SelectItem value="this-month">This month</SelectItem>
                  <SelectItem value="last-month">Last month</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Card>

          {/* Desktop table */}
          <Card className="rounded-2xl overflow-hidden hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary text-muted-foreground text-left">
                  <tr>
                    <th className="p-3 font-medium">Subject</th>
                    <th className="p-3 font-medium">Assignment</th>
                    <th className="p-3 font-medium">Assigned</th>
                    <th className="p-3 font-medium">Due</th>
                    <th className="p-3 font-medium">Submitted</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 font-medium">Grade / Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHomework.map(({ hw, sub, status }, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-3">{hw.subjects?.name || "—"}</td>
                      <td className="p-3 font-medium">{hw.title || "—"}</td>
                      <td className="p-3 text-muted-foreground">
                        {hw.assigned_date ? new Date(hw.assigned_date).toLocaleDateString() : "—"}
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {hw.due_date ? new Date(hw.due_date).toLocaleDateString() : "—"}
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {sub?.submitted_at ? new Date(sub.submitted_at).toLocaleDateString() : "—"}
                      </td>
                      <td className="p-3">{hwStatusBadge(status)}</td>
                      <td className="p-3 text-muted-foreground">
                        {sub?.marks != null && (
                          <span className="text-foreground font-medium mr-2">
                            {sub.marks}/{hw.max_marks ?? "—"}
                          </span>
                        )}
                        {sub?.remarks || (sub?.marks == null ? "—" : "")}
                      </td>
                    </tr>
                  ))}
                  {filteredHomework.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-muted-foreground">
                        No homework matches these filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Mobile stacked cards */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {filteredHomework.map(({ hw, sub, status }, i) => (
              <Card key={i} className="rounded-2xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground">{hw.subjects?.name || "—"}</div>
                    <div className="font-medium truncate">{hw.title || "—"}</div>
                  </div>
                  {hwStatusBadge(status)}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="text-muted-foreground">Assigned</div>
                    <div>
                      {hw.assigned_date ? new Date(hw.assigned_date).toLocaleDateString() : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Due</div>
                    <div>{hw.due_date ? new Date(hw.due_date).toLocaleDateString() : "—"}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Submitted</div>
                    <div>
                      {sub?.submitted_at ? new Date(sub.submitted_at).toLocaleDateString() : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Grade</div>
                    <div>{sub?.marks != null ? `${sub.marks}/${hw.max_marks ?? "—"}` : "—"}</div>
                  </div>
                </div>
                {sub?.remarks && (
                  <div className="mt-2 text-xs text-muted-foreground italic">"{sub.remarks}"</div>
                )}
              </Card>
            ))}
            {filteredHomework.length === 0 && (
              <Card className="rounded-2xl p-6 text-center text-muted-foreground text-sm">
                No homework matches these filters.
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="fees">
          <Card className="rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary text-muted-foreground text-left">
                  <tr>
                    <th className="p-3 font-medium">Fee</th>
                    <th className="p-3 font-medium">Term</th>
                    <th className="p-3 font-medium">Due date</th>
                    <th className="p-3 font-medium">Amount</th>
                    <th className="p-3 font-medium">Paid</th>
                    <th className="p-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {((fees ?? []) as any[]).map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-3 font-medium">{r.fee_structures?.name || "—"}</td>
                      <td className="p-3">{r.fee_structures?.term || "—"}</td>
                      <td className="p-3 text-muted-foreground">
                        {r.due_date ? new Date(r.due_date).toLocaleDateString() : "—"}
                      </td>
                      <td className="p-3">₹{Number(r.amount_due || 0).toLocaleString("en-IN")}</td>
                      <td className="p-3">₹{Number(r.amount_paid || 0).toLocaleString("en-IN")}</td>
                      <td className="p-3">{feeBadge(r.status)}</td>
                    </tr>
                  ))}
                  {((fees ?? []) as any[]).length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-muted-foreground">
                        No fees assigned yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t flex justify-end">
              <Link to="/fees">
                <Button size="sm">Pay fees online</Button>
              </Link>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
