import { createFileRoute, Outlet } from "@tanstack/react-router";
import { RequireRole } from "@/components/require-role";
import { AppShell, PageHeader } from "@/components/app-shell";
import { ModuleTabs, type TabItem } from "@/components/module-tabs";

export const Route = createFileRoute("/_authenticated/academics")({
  component: () => (
    <RequireRole roles={["admin"]}>
      <AcademicsWorkspace />
    </RequireRole>
  ),
});

// The workspace shell. Sub-pages Classes and Timetable still live at their own
// top-level routes today; the tab bar links out to them and highlights by path.
const NAV: TabItem[] = [
  { to: "/academics", label: "Dashboard", exact: true },
  {
    label: "Structure",
    items: [
      { to: "/academics/sessions", label: "Sessions" },
      { to: "/classes", label: "Classes" },
      { to: "/academics/subjects", label: "Subjects" },
      { to: "/academics/rooms", label: "Rooms" },
    ],
  },
  {
    label: "Teaching",
    items: [
      { to: "/academics/teachers", label: "Assign Teacher" },
      { to: "/academics/electives", label: "Electives" },
      { to: "/academics/timetable", label: "Timetable" },
    ],
  },
  {
    label: "Records",
    items: [
      { to: "/academics/calendar", label: "Calendar" },
      { to: "/academics/promote", label: "Promote" },
      { to: "/academics/reports", label: "Reports" },
    ],
  },
];

function AcademicsWorkspace() {
  return (
    <AppShell>
      <PageHeader
        title="Academic Management"
        subtitle="Sessions, classes, sections, subjects, teachers and timetables — one integrated workflow."
      />
      <ModuleTabs items={NAV} />
      <Outlet />
    </AppShell>
  );
}
