import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { badgeClass, niceLabel, todayISO } from "@/lib/module-util";
import { toast } from "sonner";
import { CheckCircle2, Clock, Home } from "lucide-react";

export const Route = createFileRoute("/_authenticated/ess/attendance")({ component: Page });

type SelfStatus = "present" | "half_day" | "wfh";

function Page() {
  const { user } = useCurrentUser();
  const qc = useQueryClient();
  const today = todayISO();

  const { data: teacher } = useQuery({
    queryKey: ["me-teacher", user?.id],
    enabled: !!user,
    queryFn: async () =>
      (
        await supabase
          .from("teachers")
          .select("id, email")
          .ilike("email", user!.email ?? "")
          .maybeSingle()
      ).data,
  });

  const { data } = useQuery({
    queryKey: ["me-attn", teacher?.id],
    enabled: !!teacher,
    queryFn: async () =>
      (
        await supabase
          .from("teacher_attendance")
          .select("*")
          .eq("teacher_id", teacher!.id)
          .order("date", { ascending: false })
          .limit(60)
      ).data ?? [],
  });

  const todayRow = (data ?? []).find((a: any) => a.date === today);

  const markMut = useMutation({
    mutationFn: async (status: SelfStatus) => {
      const { error } = await supabase.from("teacher_attendance").insert({
        teacher_id: teacher!.id,
        date: today,
        status,
        marked_by: "self",
        marked_by_user: user!.id,
        check_in_time: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Attendance marked");
      qc.invalidateQueries({ queryKey: ["me-attn", teacher?.id] });
      qc.invalidateQueries({ queryKey: ["me-attn-today", teacher?.id, today] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to mark"),
  });

  const present = (data ?? []).filter((a: any) =>
    ["present", "half_day", "wfh", "late"].includes(a.status),
  ).length;
  const pct = data && data.length ? Math.round((present / data.length) * 100) : 0;

  if (!teacher) {
    return (
      <>
        <PageHeader title="My Attendance" subtitle="Self check-in" />
        <Card className="p-8 text-center text-muted-foreground rounded-2xl">
          Attendance is captured for teaching staff only.
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="My Attendance" subtitle="Self check-in · Last 60 days" />

      <Card className="p-5 rounded-2xl mb-4">
        {todayRow ? (
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="text-xs text-muted-foreground">Today · {today}</div>
              <div className="text-lg font-semibold mt-1 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                Marked: {niceLabel(todayRow.status)}
                {todayRow.check_in_time && (
                  <span className="text-sm text-muted-foreground font-normal">
                    at{" "}
                    {new Date(todayRow.check_in_time).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                )}
              </div>
              {todayRow.marked_by !== "self" && (
                <div className="text-xs text-amber-700 mt-1">
                  Adjusted by {niceLabel(todayRow.marked_by)}
                  {todayRow.correction_reason ? ` — ${todayRow.correction_reason}` : ""}
                </div>
              )}
            </div>
            <Badge className={badgeClass(todayRow.status)}>Locked for today</Badge>
          </div>
        ) : (
          <div>
            <div className="text-sm font-semibold mb-1">Mark My Attendance</div>
            <div className="text-xs text-muted-foreground mb-3">
              Once per day · To record Absent or Leave, apply through the Leave module.
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                onClick={() => markMut.mutate("present")}
                disabled={markMut.isPending}
                className="gap-2"
              >
                <CheckCircle2 className="w-4 h-4" /> Present
              </Button>
              <Button
                onClick={() => markMut.mutate("half_day")}
                disabled={markMut.isPending}
                variant="outline"
                className="gap-2"
              >
                <Clock className="w-4 h-4" /> Half Day
              </Button>
              <Button
                onClick={() => markMut.mutate("wfh")}
                disabled={markMut.isPending}
                variant="outline"
                className="gap-2"
              >
                <Home className="w-4 h-4" /> Work From Home
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card className="p-4 rounded-2xl mb-4">
        <div className="text-xs text-muted-foreground">Attendance %</div>
        <div className="text-2xl font-semibold text-emerald-600">{pct}%</div>
      </Card>

      <Card className="rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-left">
              <th className="p-3">Date</th>
              <th className="p-3">Status</th>
              <th className="p-3">Check-in</th>
              <th className="p-3">Source</th>
              <th className="p-3">Notes</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((a: any) => (
              <tr key={a.id} className="border-t">
                <td className="p-3">{a.date}</td>
                <td className="p-3">
                  <Badge className={badgeClass(a.status)}>{niceLabel(a.status)}</Badge>
                </td>
                <td className="p-3 text-xs">
                  {a.check_in_time
                    ? new Date(a.check_in_time).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "—"}
                </td>
                <td className="p-3 text-xs text-muted-foreground">
                  {niceLabel(a.marked_by ?? "self")}
                </td>
                <td className="p-3 text-xs text-muted-foreground">
                  {a.correction_reason ?? a.notes ?? ""}
                </td>
              </tr>
            ))}
            {(data ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground">
                  No records yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </>
  );
}
