import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireRole } from "@/components/require-role";
import { AppShell, PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { QueryError } from "@/components/query-states";
import {
  Users,
  ClipboardCheck,
  BookOpenCheck,
  DoorOpen,
  School,
  GraduationCap,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/my-classes")({
  component: () => (
    <RequireRole roles={["teacher"]}>
      <MyClassesPage />
    </RequireRole>
  ),
});

type ClassRow = {
  id: string;
  name: string;
  section: string | null;
  academicYear: string;
  capacity: number | null;
  room: string | null;
  studentCount: number;
  attendanceTotal: number;
  attendancePresent: number;
  classTeacherName: string | null;
};

function MyClassesPage() {
  // /classes is role-scoped server-side, so a teacher receives only the classes
  // they teach or are the class-teacher of.
  const {
    data: classes,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["my-classes"],
    queryFn: () => apiGet<ClassRow[]>("/classes"),
  });

  const totalStudents = (classes ?? []).reduce((a, c) => a + (c.studentCount ?? 0), 0);

  return (
    <AppShell>
      <PageHeader
        title="My Classes"
        subtitle="The classes you teach — jump straight to attendance, grades or the roster."
      />

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="p-5 rounded-2xl h-40 animate-pulse bg-muted/40" />
          ))}
        </div>
      ) : isError ? (
        <QueryError onRetry={() => refetch()} />
      ) : (classes ?? []).length === 0 ? (
        <EmptyState
          icon={School}
          title="No classes assigned"
          hint="You have not been assigned to any class yet. Ask an administrator to add you."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
            <Stat
              icon={<School className="size-4" />}
              label="Classes"
              value={String(classes!.length)}
            />
            <Stat
              icon={<Users className="size-4" />}
              label="Students"
              value={String(totalStudents)}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {classes!.map((c) => {
              const attPct = c.attendanceTotal
                ? Math.round((c.attendancePresent / c.attendanceTotal) * 100)
                : null;
              return (
                <Card key={c.id} className="p-5 rounded-2xl flex flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-display text-lg font-semibold">
                        {c.name}
                        {c.section && <span className="text-muted-foreground"> · {c.section}</span>}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        AY {c.academicYear}
                        {c.room && ` · ${c.room}`}
                      </div>
                    </div>
                    {attPct != null && (
                      <span
                        className={`text-xs font-semibold ${attPct >= 90 ? "text-emerald-600" : attPct >= 75 ? "text-amber-600" : "text-red-600"}`}
                        title="30-day attendance"
                      >
                        {attPct}%
                      </span>
                    )}
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Users className="size-3.5" /> {c.studentCount} students
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground truncate">
                      <GraduationCap className="size-3.5" />
                      {c.classTeacherName ?? "—"}
                    </div>
                  </div>

                  {c.capacity && (
                    <div className="mt-3 h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div
                        className={`h-full ${c.studentCount > c.capacity ? "bg-red-500" : c.studentCount / c.capacity > 0.9 ? "bg-amber-500" : "bg-primary"}`}
                        style={{ width: `${Math.min(100, (c.studentCount / c.capacity) * 100)}%` }}
                      />
                    </div>
                  )}
                  {c.capacity && (
                    <div className="mt-1 text-[10px] text-muted-foreground flex items-center gap-1">
                      <DoorOpen className="size-3" /> Capacity {c.studentCount}/{c.capacity}
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2 pt-1">
                    <Button asChild size="sm" className="flex-1">
                      <Link to="/attendance" search={{ classId: c.id }}>
                        <ClipboardCheck className="size-4" /> Attendance
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="outline" className="flex-1">
                      <Link to="/gradebook" search={{ classId: c.id }}>
                        <BookOpenCheck className="size-4" /> Grades
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="outline" className="flex-1">
                      <Link to="/students">
                        <Users className="size-4" /> Students
                      </Link>
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </AppShell>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="p-3 rounded-2xl">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="font-display text-2xl font-semibold mt-0.5">{value}</div>
    </Card>
  );
}
