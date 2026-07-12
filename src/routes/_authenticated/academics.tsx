import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { RequireRole } from "@/components/require-role";
import { AppShell, PageHeader } from "@/components/app-shell";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/academics")({
  component: () => (
    <RequireRole roles={["admin"]}>
      <AcademicsWorkspace />
    </RequireRole>
  ),
});

// The workspace shell. Sub-pages Classes and Timetable still live at their own
// top-level routes today; the tab bar links out to them and highlights by path.
const TABS = [
  { to: "/academics", label: "Dashboard", exact: true },
  { to: "/academics/sessions", label: "Sessions" },
  { to: "/classes", label: "Classes" },
  { to: "/academics/subjects", label: "Subjects" },
  { to: "/academics/rooms", label: "Rooms" },
  { to: "/academics/teachers", label: "Assign Teacher" },
  { to: "/academics/electives", label: "Electives" },
  { to: "/academics/timetable", label: "Timetable" },
  { to: "/academics/calendar", label: "Calendar" },
  { to: "/academics/promote", label: "Promote" },
  { to: "/academics/reports", label: "Reports" },
];

function AcademicsWorkspace() {
  const location = useLocation();
  return (
    <AppShell>
      <PageHeader
        title="Academic Management"
        subtitle="Sessions, classes, sections, subjects, teachers and timetables — one integrated workflow."
      />
      <div className="mb-6 border-b overflow-x-auto">
        <nav className="flex gap-1 min-w-max">
          {TABS.map((t) => {
            const active = t.exact
              ? location.pathname === t.to
              : location.pathname.startsWith(t.to);
            return (
              <Link
                key={t.to}
                to={t.to}
                className={cn(
                  "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <Outlet />
    </AppShell>
  );
}
