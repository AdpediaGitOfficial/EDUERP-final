import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { RequireRole } from "@/components/require-role";
import { AppShell } from "@/components/app-shell";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/hr")({
  component: () => (
    <RequireRole roles={["admin", "hr"]}>
      <HrLayout />
    </RequireRole>
  ),
});

const TABS = [
  { to: "/hr", label: "Dashboard", exact: true },
  { to: "/hr/staff", label: "Staff" },
  { to: "/hr/recruitment", label: "Recruitment" },
  { to: "/hr/departments", label: "Departments" },
  { to: "/hr/attendance", label: "Attendance" },
  { to: "/hr/payroll", label: "Payroll" },
  { to: "/hr/salary", label: "Salary" },
  { to: "/hr/loans", label: "Loans" },
  { to: "/hr/leave", label: "Leave" },
  { to: "/hr/shifts", label: "Shifts" },
  { to: "/hr/performance", label: "Performance" },
  { to: "/hr/appraisals", label: "Appraisals" },
  { to: "/hr/training", label: "Training" },
  { to: "/hr/documents", label: "Documents" },
  { to: "/hr/expenses", label: "Expenses" },
  { to: "/hr/travel", label: "Travel" },
  { to: "/hr/overtime", label: "Overtime" },
  { to: "/hr/exit", label: "Exit" },
  { to: "/hr/reports", label: "Reports" },
  { to: "/hr/analytics", label: "Analytics" },
  { to: "/hr/settings", label: "Settings" },
];

function HrLayout() {
  const location = useLocation();
  return (
    <AppShell>
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
