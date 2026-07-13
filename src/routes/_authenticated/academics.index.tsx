import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/client";
import { CHART, CHART_PRIMARY, GENDER_CHART } from "@/lib/chart";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { EmptyRow } from "@/components/empty-state";
import { QueryError, TableSkeleton, StatCardsSkeleton } from "@/components/query-states";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useState } from "react";
import {
  LayoutDashboard,
  School,
  CalendarDays,
  Users,
  GraduationCap,
  BookOpen,
  CalendarCheck,
  AlertTriangle,
  CheckCircle2,
  UserCog,
  ClipboardList,
  Eye,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

export const Route = createFileRoute("/_authenticated/academics/")({ component: Dashboard });

// ── Types ────────────────────────────────────────────────────────────────────
type Dash = {
  session: string;
  sessions: { year: string; students: number }[];
  stats: {
    totalClasses: number;
    totalSections: number;
    totalStudents: number;
    totalTeachers: number;
    studentTeacherRatio: number;
    activeSubjects: number;
    timetableCompletion: number;
    attendanceToday: { present: number; total: number };
    teacherAttendanceToday: { present: number; total: number };
    pendingTeacherAllocation: number;
    classesWithoutClassTeacher: number;
    classesWithoutTimetable: number;
    classesWithoutSubjects: number;
    unassignedStudents: number;
    studentsToPromote: number;
    assignedTeachers: number;
  };
  charts: {
    studentsByClass: { name: string; count: number }[];
    genderRatio: { gender: string; count: number }[];
    teacherWorkload: { name: string; periods: number }[];
  };
  classSectionOverview: {
    name: string;
    sections: string[];
    inCharge: string | null;
    students: number;
  }[];
};
type Integrity = {
  session: string;
  healthy: boolean;
  issueCount: number;
  checks: { key: string; label: string; count: number; ok: boolean; samples: string[] }[];
};

// Gender palette sourced from design tokens (dark-mode aware) — see src/lib/chart.ts.
const GENDER_COLORS = GENDER_CHART;
const GENDER_FALLBACK = GENDER_CHART.unknown;

function Dashboard() {
  const [year, setYear] = useState<string>("");
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["academic-dashboard", year],
    queryFn: () => apiGet<Dash>(`/academics/dashboard${year ? `?year=${year}` : ""}`),
  });
  const { data: integrity } = useQuery({
    queryKey: ["academic-integrity", year],
    queryFn: () => apiGet<Integrity>(`/academics/integrity${year ? `?year=${year}` : ""}`),
  });

  const s = data?.stats;
  const attnPct =
    s && s.attendanceToday.total > 0
      ? Math.round((s.attendanceToday.present / s.attendanceToday.total) * 100)
      : null;

  if (isError) {
    return (
      <div className="space-y-4">
        <QueryError onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Session banner + selector */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <StatusBadge
          tone="success"
          label={`Current Session: ${data?.session ?? "—"}`}
          className="text-sm"
        />
        <Select value={year || "current"} onValueChange={(v) => setYear(v === "current" ? "" : v)}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Session" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="current">Current session</SelectItem>
            {(data?.sessions ?? []).map((x) => (
              <SelectItem key={x.year} value={x.year}>
                {x.year} ({x.students} students)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Primary stat cards */}
      {isLoading ? (
        <StatCardsSkeleton count={6} />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Stat
            icon={School}
            label="Classes"
            value={s?.totalClasses}
            hint={`${s?.totalSections ?? 0} sections`}
          />
          <Stat icon={Users} label="Students" value={s?.totalStudents} />
          <Stat
            icon={GraduationCap}
            label="Teachers"
            value={s?.totalTeachers}
            hint={`1:${s?.studentTeacherRatio ?? 0} ratio`}
          />
          <Stat icon={BookOpen} label="Active Subjects" value={s?.activeSubjects} />
          <Stat
            icon={CalendarCheck}
            label="Timetable"
            value={s != null ? `${s.timetableCompletion}%` : undefined}
            hint={`${s?.classesWithoutTimetable ?? 0} pending`}
            tone={s && s.timetableCompletion < 100 ? "warning" : "success"}
          />
          <Stat
            icon={GraduationCap}
            label="To Promote"
            value={s?.studentsToPromote}
            hint="session end"
          />
        </div>
      )}

      {/* Operational alerts strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniAlert
          label="Pending teacher allocation"
          value={s?.pendingTeacherAllocation}
          icon={UserCog}
        />
        <MiniAlert
          label="Classes without class teacher"
          value={s?.classesWithoutClassTeacher}
          icon={UserCog}
        />
        <MiniAlert
          label="Classes without timetable"
          value={s?.classesWithoutTimetable}
          icon={CalendarDays}
        />
        <MiniAlert label="Unassigned students" value={s?.unassignedStudents} icon={Users} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Class & section overview */}
        <Card className="lg:col-span-2 rounded-2xl overflow-hidden">
          <div className="p-4 border-b flex items-center gap-2">
            <LayoutDashboard className="size-4" />
            <h3 className="font-semibold">Class &amp; Section Overview</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="p-3 font-medium">Class</th>
                  <th className="p-3 font-medium">Sections</th>
                  <th className="p-3 font-medium">In-charge</th>
                  <th className="p-3 font-medium text-right">Students</th>
                  <th className="p-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {(data?.classSectionOverview ?? []).map((c) => (
                  <tr key={c.name} className="border-t hover:bg-muted/30">
                    <td className="p-3 font-medium">{c.name}</td>
                    <td className="p-3">{c.sections.join(", ") || "—"}</td>
                    <td className="p-3">
                      {c.inCharge ?? (
                        <span className="text-muted-foreground italic">Not assigned</span>
                      )}
                    </td>
                    <td className="p-3 text-right font-semibold">{c.students}</td>
                    <td className="p-3 text-right">
                      <Link
                        to="/classes"
                        className="inline-flex text-muted-foreground hover:text-foreground"
                        aria-label={`Open ${c.name}`}
                      >
                        <Eye className="size-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
                {data && data.classSectionOverview.length === 0 && (
                  <EmptyRow colSpan={5} title="No classes in this session" />
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Integrity panel */}
        <Card className="rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            {integrity?.healthy ? (
              <CheckCircle2 className="size-4 text-emerald-600" />
            ) : (
              <AlertTriangle className="size-4 text-amber-600" />
            )}
            <h3 className="font-semibold">Data Integrity</h3>
            {integrity && (
              <StatusBadge
                tone={integrity.healthy ? "success" : "warning"}
                label={
                  integrity.healthy
                    ? "All clear"
                    : `${integrity.issueCount} issue${integrity.issueCount === 1 ? "" : "s"}`
                }
                className="ml-auto"
              />
            )}
          </div>
          <div className="space-y-2">
            {(integrity?.checks ?? []).map((c) => (
              <div key={c.key} className="flex items-start gap-2 text-sm">
                {c.ok ? (
                  <CheckCircle2 className="size-4 text-emerald-600 mt-0.5 shrink-0" />
                ) : (
                  <AlertTriangle className="size-4 text-amber-600 mt-0.5 shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={c.ok ? "text-muted-foreground" : "font-medium"}>
                      {c.label}
                    </span>
                    {!c.ok && <span className="text-amber-600 font-semibold">{c.count}</span>}
                  </div>
                  {!c.ok && c.samples.length > 0 && (
                    <p className="text-xs text-muted-foreground truncate">
                      {c.samples.slice(0, 3).join(" · ")}
                      {c.samples.length > 3 ? " …" : ""}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="rounded-2xl p-4 lg:col-span-2">
          <h3 className="font-semibold mb-3">Students by Class</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.charts.studentsByClass ?? []}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  interval={0}
                  angle={-30}
                  textAnchor="end"
                  height={60}
                />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill={CHART_PRIMARY} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="rounded-2xl p-4">
          <h3 className="font-semibold mb-3">Gender Ratio</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data?.charts.genderRatio ?? []}
                  dataKey="count"
                  nameKey="gender"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                >
                  {(data?.charts.genderRatio ?? []).map((g) => (
                    <Cell key={g.gender} fill={GENDER_COLORS[g.gender] ?? GENDER_FALLBACK} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap justify-center gap-3 text-xs">
            {(data?.charts.genderRatio ?? []).map((g) => (
              <span key={g.gender} className="flex items-center gap-1">
                <span
                  className="inline-block size-2.5 rounded-full"
                  style={{ background: GENDER_COLORS[g.gender] ?? GENDER_FALLBACK }}
                />
                {g.gender} ({g.count})
              </span>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <ClipboardList className="size-4" />
            <h3 className="font-semibold">Teacher Workload (weekly periods)</h3>
          </div>
          {data && data.charts.teacherWorkload.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No timetable entries yet — workload appears once periods are scheduled.
            </p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.charts.teacherWorkload ?? []} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                  <Tooltip />
                  <Bar dataKey="periods" fill={CHART[1]} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="rounded-2xl p-4">
          <h3 className="font-semibold mb-3">Attendance Today</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-muted/40 p-4">
              <p className="text-xs text-muted-foreground">Student attendance</p>
              <p className="text-2xl font-bold mt-1">{attnPct != null ? `${attnPct}%` : "—"}</p>
              <p className="text-xs text-muted-foreground">
                {s?.attendanceToday.present ?? 0}/{s?.attendanceToday.total ?? 0} present
              </p>
            </div>
            <div className="rounded-xl bg-muted/40 p-4">
              <p className="text-xs text-muted-foreground">Teacher attendance</p>
              <p className="text-2xl font-bold mt-1">
                {s && s.teacherAttendanceToday.total > 0
                  ? `${Math.round((s.teacherAttendanceToday.present / s.teacherAttendanceToday.total) * 100)}%`
                  : "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                {s?.teacherAttendanceToday.present ?? 0}/{s?.teacherAttendanceToday.total ?? 0}{" "}
                present
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Attendance reflects records marked for today. Empty until today's rolls are taken.
          </p>
        </Card>
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: any;
  label: string;
  value?: number | string;
  hint?: string;
  tone?: "warning" | "success";
}) {
  return (
    <Card className="p-4 rounded-2xl">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4" />
        <span className="text-xs uppercase tracking-wide">{label}</span>
      </div>
      <p
        className={cn(
          "text-2xl font-bold mt-1",
          tone === "warning" && "text-amber-600",
          tone === "success" && "text-emerald-600",
        )}
      >
        {value ?? "—"}
      </p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}

function MiniAlert({ label, value, icon: Icon }: { label: string; value?: number; icon: any }) {
  const warn = (value ?? 0) > 0;
  return (
    <Card className={cn("p-3 rounded-xl flex items-center gap-3", warn && "border-amber-300")}>
      <div
        className={cn(
          "size-9 rounded-lg grid place-items-center shrink-0",
          warn ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700",
        )}
      >
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <p className={cn("text-lg font-bold leading-none", warn ? "text-amber-700" : "")}>
          {value ?? "—"}
        </p>
        <p className="text-xs text-muted-foreground truncate">{label}</p>
      </div>
    </Card>
  );
}
