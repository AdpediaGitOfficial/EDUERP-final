import { RequireRole } from "@/components/require-role";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { EmptyRow } from "@/components/empty-state";
import { apiGet } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Users, Check, X, Clock, FileText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/attendance-overview")({
  component: () => (
    <RequireRole roles={["admin"]}>
      <Page />
    </RequireRole>
  ),
});

function Page() {
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [classId, setClassId] = useState<string>("");

  const { data } = useQuery({
    queryKey: ["ao-overview", date],
    queryFn: () =>
      apiGet<{
        classes: { id: string; name: string; section: string | null }[];
        perClass: {
          id: string;
          name: string;
          total: number;
          present: number;
          absent: number;
          late: number;
          excused: number;
        }[];
        totals: {
          total: number;
          present: number;
          absent: number;
          late: number;
          excused: number;
          marked: number;
        };
        rows: {
          student_id: string;
          class_id: string;
          status: string;
          student_name: string | null;
          roll_no: string | null;
          admission_no: string | null;
        }[];
      }>(`/attendance/overview?date=${date}`),
  });

  const classes = data?.classes ?? [];
  const rows = data?.rows ?? [];

  const byClass = useMemo(() => {
    const perClassList = data?.perClass ?? [];
    const map = new Map<string, (typeof perClassList)[number]>();
    for (const c of perClassList) map.set(c.id, c);
    return map;
  }, [data]);

  const totals = data?.totals ?? {
    total: 0,
    present: 0,
    absent: 0,
    late: 0,
    excused: 0,
    marked: 0,
  };

  const drill = useMemo(() => {
    if (!classId) return [] as any[];
    return rows.filter((r) => r.class_id === classId);
  }, [rows, classId]);

  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

  const statMeta: Record<string, { label: string; icon: any; cls: string }> = {
    present: { label: "Present", icon: Check, cls: "bg-emerald-100 text-emerald-900" },
    absent: { label: "Absent", icon: X, cls: "bg-red-100 text-red-900" },
    late: { label: "Late", icon: Clock, cls: "bg-amber-100 text-amber-900" },
    excused: { label: "Leave", icon: FileText, cls: "bg-blue-100 text-blue-900" },
  };

  return (
    <AppShell>
      <PageHeader
        title="Attendance Overview"
        subtitle="School-wide attendance for the selected date, with per-class drill-down."
      />
      <Card className="p-4 rounded-2xl mb-4">
        <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-3 md:items-end">
          <div className="space-y-1.5">
            <Label className="text-xs">Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="text-sm text-muted-foreground">
            {totals.marked} of {totals.total} students marked · {pct(totals.present, totals.total)}%
            present school-wide
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {(["present", "absent", "late", "excused"] as const).map((k) => {
          const meta = statMeta[k];
          const Icon = meta.icon;
          const n = (totals as any)[k] as number;
          return (
            <Card key={k} className="p-4 rounded-2xl">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className={`size-6 rounded-md grid place-items-center ${meta.cls}`}>
                  <Icon className="size-3.5" />
                </span>
                {meta.label}
              </div>
              <div className="text-2xl font-semibold mt-2">{n}</div>
              <div className="text-[11px] text-muted-foreground">
                {pct(n, totals.total)}% of school
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="rounded-2xl overflow-hidden mb-6">
        <div className="p-4 border-b font-medium">Per-class summary</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-muted-foreground text-left">
              <tr>
                <th className="p-3 font-medium">Class</th>
                <th className="p-3 font-medium">Present</th>
                <th className="p-3 font-medium">Absent</th>
                <th className="p-3 font-medium">Late</th>
                <th className="p-3 font-medium">Leave</th>
                <th className="p-3 font-medium w-64">% Present</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {Array.from(byClass.entries()).map(([id, v]) => {
                const p = pct(v.present, v.total);
                return (
                  <tr
                    key={id}
                    className="border-t hover:bg-muted/40 cursor-pointer"
                    onClick={() => setClassId(id)}
                  >
                    <td className="p-3 font-medium">{v.name}</td>
                    <td className="p-3">{v.present}</td>
                    <td className="p-3">{v.absent}</td>
                    <td className="p-3">{v.late}</td>
                    <td className="p-3">{v.excused}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <Progress value={p} className="h-2 flex-1" />
                        <span className="text-xs w-9 text-right">{p}%</span>
                      </div>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      <Users className="size-3.5 inline mr-1" />
                      {v.total}
                    </td>
                  </tr>
                );
              })}
              {byClass.size === 0 && (
                <EmptyRow
                  colSpan={7}
                  title="No classes"
                  hint="Classes will appear here once created."
                />
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {classId && (
        <Card className="rounded-2xl overflow-hidden">
          <div className="p-4 border-b flex items-center justify-between">
            <div className="font-medium">Drill-down · {byClass.get(classId)?.name}</div>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(classes ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                    {c.section && ` · ${c.section}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-muted-foreground text-left">
                <tr>
                  <th className="p-3 font-medium">Student</th>
                  <th className="p-3 font-medium">Roll</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {drill.map((r: any) => (
                  <tr key={r.student_id} className="border-t">
                    <td className="p-3 font-medium">{r.student_name}</td>
                    <td className="p-3 text-muted-foreground font-mono">
                      {r.roll_no ?? r.admission_no ?? "—"}
                    </td>
                    <td className="p-3">
                      <Badge className={`${statMeta[r.status]?.cls ?? ""} border-0 capitalize`}>
                        {r.status}
                      </Badge>
                    </td>
                    <td className="p-3 text-right">
                      <Link
                        to="/children/$studentId/report"
                        params={{ studentId: r.student_id }}
                        className="text-xs text-primary hover:underline"
                      >
                        View report
                      </Link>
                    </td>
                  </tr>
                ))}
                {drill.length === 0 && (
                  <EmptyRow
                    colSpan={4}
                    title="No attendance recorded"
                    hint={`Nothing marked for this class on ${date}.`}
                  />
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </AppShell>
  );
}
