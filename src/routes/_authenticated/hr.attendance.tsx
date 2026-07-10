import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { badgeClass, niceLabel, todayISO, fmtDateTime } from "@/lib/module-util";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/hr/attendance")({ component: Page });

const CUTOFF_HOUR = 10; // 10:00 AM
const STATUS_OPTIONS = ["present", "absent", "late", "leave"] as const;

function Page() {
  const { user } = useCurrentUser();
  const qc = useQueryClient();
  const [date, setDate] = useState(todayISO());
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [markMissing, setMarkMissing] = useState<any | null>(null);

  const { data: teachers } = useQuery({
    queryKey: ["teachers-active"],
    queryFn: async () =>
      (
        await supabase
          .from("teachers")
          .select("id, full_name, email, subject, status")
          .eq("status", "active")
          .order("full_name")
      ).data ?? [],
  });

  const { data: dayRows } = useQuery({
    queryKey: ["ta-day", date],
    queryFn: async () =>
      (await supabase.from("teacher_attendance").select("*").eq("date", date)).data ?? [],
  });

  const { data: monthRows } = useQuery({
    queryKey: ["ta-month", date.slice(0, 7)],
    queryFn: async () => {
      const start = `${date.slice(0, 7)}-01`;
      const d = new Date(start);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
      return (
        (
          await supabase
            .from("teacher_attendance")
            .select("*, teacher:teacher_id(full_name)")
            .gte("date", start)
            .lte("date", end)
            .order("date", { ascending: false })
        ).data ?? []
      );
    },
  });

  const { data: corrections } = useQuery({
    queryKey: ["attn-corrections"],
    queryFn: async () =>
      (
        await supabase
          .from("attendance_corrections")
          .select("*, teacher:teacher_id(full_name)")
          .order("created_at", { ascending: false })
          .limit(200)
      ).data ?? [],
  });

  const rowByTeacher = useMemo(() => {
    const m: Record<string, any> = {};
    (dayRows ?? []).forEach((r: any) => {
      m[r.teacher_id] = r;
    });
    return m;
  }, [dayRows]);

  const now = new Date();
  const isToday = date === todayISO();
  const pastCutoff = !isToday || now.getHours() >= CUTOFF_HOUR;

  const rows = (teachers ?? []).map((t: any) => ({
    teacher: t,
    row: rowByTeacher[t.id] ?? null,
    notMarked: !rowByTeacher[t.id] && pastCutoff,
  }));

  const present = rows.filter(
    (r) => r.row && ["present", "half_day", "wfh", "late"].includes(r.row.status),
  ).length;
  const absent = rows.filter((r) => r.row?.status === "absent").length;
  const late = rows.filter((r) => r.row?.status === "late").length;
  const notMarked = rows.filter((r) => r.notMarked).length;
  const totalRecorded = rows.filter((r) => r.row).length;
  const pct = totalRecorded ? Math.round((present / totalRecorded) * 100) : 0;

  const role: "admin" | "hr" = user?.roles?.includes("admin") ? "admin" : "hr";

  const upsertMut = useMutation({
    mutationFn: async (args: {
      teacherId: string;
      status: string;
      reason: string;
      existing: any | null;
      checkIn?: string | null;
    }) => {
      const { teacherId, status, reason, existing, checkIn } = args;
      const payload: any = {
        teacher_id: teacherId,
        date,
        status,
        marked_by: role,
        marked_by_user: user!.id,
        correction_reason: reason,
        check_in_time: checkIn ?? existing?.check_in_time ?? null,
      };
      let attendanceId = existing?.id ?? null;
      if (existing) {
        const { error } = await supabase
          .from("teacher_attendance")
          .update(payload)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { data: ins, error } = await supabase
          .from("teacher_attendance")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        attendanceId = ins.id;
      }
      const { error: aerr } = await supabase.from("attendance_corrections").insert({
        attendance_id: attendanceId,
        teacher_id: teacherId,
        date,
        from_status: existing?.status ?? null,
        to_status: status,
        from_check_in: existing?.check_in_time ?? null,
        to_check_in: checkIn ?? existing?.check_in_time ?? null,
        reason,
        changed_by: user!.id,
        changed_by_role: role,
      });
      if (aerr) throw aerr;
    },
    onSuccess: () => {
      toast.success("Attendance updated");
      qc.invalidateQueries({ queryKey: ["ta-day", date] });
      qc.invalidateQueries({ queryKey: ["ta-month", date.slice(0, 7)] });
      qc.invalidateQueries({ queryKey: ["attn-corrections"] });
      setEditing(null);
      setMarkMissing(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const bulkMut = useMutation({
    mutationFn: async (args: { status: string; reason: string; teacherIds: string[] }) => {
      for (const tid of args.teacherIds) {
        await upsertMut.mutateAsync({
          teacherId: tid,
          status: args.status,
          reason: args.reason,
          existing: rowByTeacher[tid] ?? null,
        });
      }
    },
    onSuccess: () => {
      setBulkOpen(false);
      setSelected({});
    },
  });

  const selectedIds = Object.entries(selected)
    .filter(([, v]) => v)
    .map(([k]) => k);

  return (
    <>
      <PageHeader
        title="Teacher Attendance"
        subtitle="Self-marked by teachers · HR/Admin can correct and bulk-mark"
        action={
          <div className="flex gap-2 items-center">
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-40"
            />
            <Button
              variant="outline"
              disabled={!selectedIds.length}
              onClick={() => setBulkOpen(true)}
            >
              Bulk mark {selectedIds.length ? `(${selectedIds.length})` : ""}
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <Card className="p-4 rounded-2xl">
          <div className="text-xs text-muted-foreground">Attendance %</div>
          <div className="text-2xl font-semibold text-emerald-600">{pct}%</div>
        </Card>
        <Card className="p-4 rounded-2xl">
          <div className="text-xs text-muted-foreground">Present</div>
          <div className="text-2xl font-semibold">{present}</div>
        </Card>
        <Card className="p-4 rounded-2xl">
          <div className="text-xs text-muted-foreground">Late</div>
          <div className="text-2xl font-semibold text-amber-600">{late}</div>
        </Card>
        <Card className="p-4 rounded-2xl">
          <div className="text-xs text-muted-foreground">Absent</div>
          <div className="text-2xl font-semibold text-red-600">{absent}</div>
        </Card>
        <Card className="p-4 rounded-2xl">
          <div className="text-xs text-muted-foreground">Not Marked</div>
          <div className="text-2xl font-semibold text-slate-600">{notMarked}</div>
        </Card>
      </div>

      <Tabs defaultValue="day">
        <TabsList>
          <TabsTrigger value="day">Daily grid</TabsTrigger>
          <TabsTrigger value="month">This month</TabsTrigger>
          <TabsTrigger value="audit">Correction log</TabsTrigger>
        </TabsList>

        <TabsContent value="day" className="pt-4">
          <Card className="rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="p-3 w-10">
                      <Checkbox
                        checked={selectedIds.length > 0 && selectedIds.length === rows.length}
                        onCheckedChange={(v) => {
                          const next: Record<string, boolean> = {};
                          if (v) rows.forEach((r) => (next[r.teacher.id] = true));
                          setSelected(next);
                        }}
                      />
                    </th>
                    <th className="p-3">Teacher</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Quick mark</th>
                    <th className="p-3">Check-in</th>
                    <th className="p-3">Source</th>
                    <th className="p-3">Reason</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ teacher, row, notMarked: nm }) => (
                    <tr key={teacher.id} className="border-t">
                      <td className="p-3">
                        <Checkbox
                          checked={!!selected[teacher.id]}
                          onCheckedChange={(v) => setSelected((s) => ({ ...s, [teacher.id]: !!v }))}
                        />
                      </td>
                      <td className="p-3">
                        <div className="font-medium">{teacher.full_name}</div>
                        <div className="text-xs text-muted-foreground">{teacher.subject}</div>
                      </td>
                      <td className="p-3">
                        {row ? (
                          <Badge className={badgeClass(row.status)}>{niceLabel(row.status)}</Badge>
                        ) : nm ? (
                          <Badge className="bg-slate-200 text-slate-800 border-0">Not Marked</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Pending</span>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex gap-3 text-xs">
                          {(["present", "absent", "late", "leave"] as const).map((s) => (
                            <label key={s} className="flex items-center gap-1 cursor-pointer">
                              <input
                                type="radio"
                                name={`qm-${teacher.id}`}
                                className="accent-primary"
                                checked={row?.status === s}
                                onChange={() =>
                                  upsertMut.mutate({
                                    teacherId: teacher.id,
                                    status: s,
                                    reason: row
                                      ? `Quick-mark update by ${niceLabel(role)}`
                                      : `Quick-mark by ${niceLabel(role)}`,
                                    existing: row,
                                    checkIn: row?.check_in_time ?? new Date().toISOString(),
                                  })
                                }
                              />
                              {niceLabel(s)}
                            </label>
                          ))}
                        </div>
                      </td>
                      <td className="p-3 text-xs">
                        {row?.check_in_time
                          ? new Date(row.check_in_time).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {row ? niceLabel(row.marked_by ?? "self") : "—"}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {row?.correction_reason ?? ""}
                      </td>
                      <td className="p-3 text-right">
                        {row ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditing({ teacher, row })}
                          >
                            Correct
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setMarkMissing({ teacher })}
                          >
                            Mark
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-muted-foreground">
                        No active teachers.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="month" className="pt-4">
          <Card className="rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="p-3">Date</th>
                    <th className="p-3">Teacher</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Source</th>
                    <th className="p-3">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {(monthRows ?? []).map((a: any) => (
                    <tr key={a.id} className="border-t">
                      <td className="p-3">{a.date}</td>
                      <td className="p-3">{a.teacher?.full_name}</td>
                      <td className="p-3">
                        <Badge className={badgeClass(a.status)}>{niceLabel(a.status)}</Badge>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {niceLabel(a.marked_by ?? "self")}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {a.correction_reason ?? a.notes ?? ""}
                      </td>
                    </tr>
                  ))}
                  {(monthRows ?? []).length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-muted-foreground">
                        No records this month.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="pt-4">
          <Card className="rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="p-3">When</th>
                    <th className="p-3">Teacher</th>
                    <th className="p-3">Date</th>
                    <th className="p-3">Change</th>
                    <th className="p-3">By</th>
                    <th className="p-3">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {(corrections ?? []).map((c: any) => (
                    <tr key={c.id} className="border-t">
                      <td className="p-3 text-xs">{fmtDateTime(c.created_at)}</td>
                      <td className="p-3">{c.teacher?.full_name}</td>
                      <td className="p-3">{c.date}</td>
                      <td className="p-3 text-xs">
                        <span className="text-muted-foreground">
                          {c.from_status ? niceLabel(c.from_status) : "—"}
                        </span>
                        <span className="mx-1">→</span>
                        <Badge className={badgeClass(c.to_status)}>{niceLabel(c.to_status)}</Badge>
                      </td>
                      <td className="p-3 text-xs">{niceLabel(c.changed_by_role)}</td>
                      <td className="p-3 text-xs text-muted-foreground">{c.reason}</td>
                    </tr>
                  ))}
                  {(corrections ?? []).length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-muted-foreground">
                        No corrections yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <CorrectionDialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? `Correct attendance — ${editing.teacher.full_name}` : ""}
        initialStatus={editing?.preset ?? editing?.row.status ?? "present"}
        onSubmit={(status, reason) =>
          upsertMut.mutate({
            teacherId: editing!.teacher.id,
            status,
            reason,
            existing: editing!.row,
          })
        }
        submitting={upsertMut.isPending}
      />
      <CorrectionDialog
        open={!!markMissing}
        onClose={() => setMarkMissing(null)}
        title={markMissing ? `Mark attendance — ${markMissing.teacher.full_name}` : ""}
        initialStatus={markMissing?.preset ?? "present"}
        reasonRequired
        onSubmit={(status, reason) =>
          upsertMut.mutate({
            teacherId: markMissing!.teacher.id,
            status,
            reason,
            existing: null,
            checkIn: new Date().toISOString(),
          })
        }
        submitting={upsertMut.isPending}
      />
      <BulkDialog
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        count={selectedIds.length}
        onSubmit={(status, reason) => bulkMut.mutate({ status, reason, teacherIds: selectedIds })}
        submitting={bulkMut.isPending}
      />
    </>
  );
}

function CorrectionDialog({
  open,
  onClose,
  title,
  initialStatus,
  onSubmit,
  submitting,
  reasonRequired = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  initialStatus: string;
  onSubmit: (status: string, reason: string) => void;
  submitting: boolean;
  reasonRequired?: boolean;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [reason, setReason] = useState("");
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          onClose();
          setReason("");
        } else {
          setStatus(initialStatus);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Every change is logged in the Correction Log.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {niceLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Reason {reasonRequired && <span className="text-red-600">*</span>}</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., forgot to check in, confirmed present via manager"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={submitting || (reasonRequired && !reason.trim())}
            onClick={() => onSubmit(status, reason.trim())}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BulkDialog({
  open,
  onClose,
  count,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onClose: () => void;
  count: number;
  onSubmit: (status: string, reason: string) => void;
  submitting: boolean;
}) {
  const [status, setStatus] = useState("present");
  const [reason, setReason] = useState("");
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          onClose();
          setReason("");
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bulk mark {count} teachers</DialogTitle>
          <DialogDescription>
            Use for exceptional situations (school closed, staff meeting, etc.). Logged
            individually.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {niceLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>
              Reason <span className="text-red-600">*</span>
            </Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., school closed for heavy rain"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={submitting || !reason.trim()}
            onClick={() => onSubmit(status, reason.trim())}
          >
            Apply to {count}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
