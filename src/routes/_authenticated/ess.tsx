import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/ess")({ component: Layout });

const TABS = [
  { to: "/ess", label: "Overview", exact: true },
  { to: "/ess/profile", label: "Profile" },
  { to: "/ess/attendance", label: "Attendance" },
  { to: "/ess/leave", label: "Leave" },
  { to: "/ess/payslips", label: "Payslips" },
  { to: "/ess/expenses", label: "Expenses" },
  { to: "/ess/assets", label: "My Assets" },
  { to: "/ess/training", label: "Training" },
  { to: "/ess/documents", label: "Documents" },
  { to: "/ess/performance", label: "Performance" },
  { to: "/ess/grievance", label: "Grievance" },
];

function Layout() {
  const loc = useLocation();
  return (
    <AppShell>
      <div className="mb-6 border-b overflow-x-auto">
        <nav className="flex gap-1 min-w-max">
          {TABS.map((t) => {
            const active = t.exact ? loc.pathname === t.to : loc.pathname.startsWith(t.to);
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
