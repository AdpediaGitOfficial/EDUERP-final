import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { ModuleTabs, type TabItem } from "@/components/module-tabs";

export const Route = createFileRoute("/_authenticated/ess")({ component: Layout });

const NAV: TabItem[] = [
  { to: "/ess", label: "Overview", exact: true },
  {
    label: "My Info",
    items: [
      { to: "/ess/profile", label: "Profile" },
      { to: "/ess/documents", label: "Documents" },
      { to: "/ess/assets", label: "My Assets" },
    ],
  },
  {
    label: "Time & Leave",
    items: [
      { to: "/ess/attendance", label: "Attendance" },
      { to: "/ess/leave", label: "Leave" },
    ],
  },
  {
    label: "Pay & Claims",
    items: [
      { to: "/ess/payslips", label: "Payslips" },
      { to: "/ess/expenses", label: "Expenses" },
    ],
  },
  {
    label: "Growth",
    items: [
      { to: "/ess/training", label: "Training" },
      { to: "/ess/performance", label: "Performance" },
      { to: "/ess/grievance", label: "Grievance" },
    ],
  },
];

function Layout() {
  return (
    <AppShell>
      <ModuleTabs items={NAV} />
      <Outlet />
    </AppShell>
  );
}
