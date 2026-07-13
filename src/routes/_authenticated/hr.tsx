import { createFileRoute, Outlet } from "@tanstack/react-router";
import { RequireRole } from "@/components/require-role";
import { AppShell } from "@/components/app-shell";
import { ModuleTabs, type TabItem } from "@/components/module-tabs";

export const Route = createFileRoute("/_authenticated/hr")({
  component: () => (
    <RequireRole roles={["admin", "hr"]}>
      <HrLayout />
    </RequireRole>
  ),
});

const NAV: TabItem[] = [
  { to: "/hr", label: "Dashboard", exact: true },
  // Surfaced as top-level tabs — Attendance is a daily action and Payroll a
  // frequent monthly one; the rest stay grouped to keep the row short.
  { to: "/hr/attendance", label: "Attendance" },
  { to: "/hr/payroll", label: "Payroll" },
  {
    label: "People",
    items: [
      { to: "/hr/staff", label: "Staff" },
      { to: "/hr/recruitment", label: "Recruitment" },
      { to: "/hr/departments", label: "Departments" },
    ],
  },
  {
    label: "Time & Leave",
    items: [
      { to: "/hr/leave", label: "Leave" },
      { to: "/hr/shifts", label: "Shifts" },
      { to: "/hr/overtime", label: "Overtime" },
    ],
  },
  {
    label: "Compensation",
    items: [
      { to: "/hr/salary", label: "Salary" },
      { to: "/hr/loans", label: "Loans" },
      { to: "/hr/expenses", label: "Expenses" },
      { to: "/hr/travel", label: "Travel" },
    ],
  },
  {
    label: "Growth",
    items: [
      { to: "/hr/performance", label: "Performance" },
      { to: "/hr/appraisals", label: "Appraisals" },
      { to: "/hr/training", label: "Training" },
    ],
  },
  {
    label: "Admin",
    items: [
      { to: "/hr/documents", label: "Documents" },
      { to: "/hr/exit", label: "Exit" },
      { to: "/hr/reports", label: "Reports" },
      { to: "/hr/analytics", label: "Analytics" },
      { to: "/hr/settings", label: "Settings" },
    ],
  },
];

function HrLayout() {
  return (
    <AppShell>
      <ModuleTabs items={NAV} />
      <Outlet />
    </AppShell>
  );
}
