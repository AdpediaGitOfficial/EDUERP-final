import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { apiGet } from "@/lib/api/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Clock, MapPin } from "lucide-react";

export const Route = createFileRoute("/_authenticated/timetable")({
  component: TimetablePage,
});

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function TimetablePage() {
  const { user } = useCurrentUser();
  const { data } = useQuery({
    enabled: !!user,
    queryKey: ["timetable", user?.id, user?.primaryRole],
    queryFn: () => apiGet<any[]>("/timetable/mine"),
  });

  const byDay = (data ?? []).reduce<Record<number, any[]>>((acc, t) => {
    (acc[t.dayOfWeek] ||= []).push(t);
    return acc;
  }, {});

  return (
    <AppShell>
      <PageHeader
        title="My Timetable"
        subtitle={
          user?.primaryRole === "student"
            ? "Your weekly class schedule."
            : "Your weekly teaching schedule."
        }
      />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5].map((d) => (
          <Card key={d} className="p-5 rounded-2xl">
            <div className="font-display font-semibold mb-3">{DAYS[d]}</div>
            <div className="space-y-2">
              {(byDay[d] ?? []).length === 0 && (
                <div className="text-sm text-muted-foreground py-4 text-center">No classes.</div>
              )}
              {(byDay[d] ?? []).map((t) => (
                <div key={t.id} className="rounded-xl border p-3">
                  <div className="font-medium text-sm">{t.subjectName ?? "Class"}</div>
                  <div className="text-xs text-muted-foreground">{t.className}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-3 mt-1">
                    <span className="flex items-center gap-1">
                      <Clock className="size-3" /> {t.startTime}–{t.endTime}
                    </span>
                    {t.room && (
                      <span className="flex items-center gap-1">
                        <MapPin className="size-3" /> {t.room}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
