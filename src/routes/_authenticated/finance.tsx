import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { RequireRole } from "@/components/require-role";
import { AppShell } from "@/components/app-shell";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/finance")({
  component: () => (
    <RequireRole roles={["admin", "accountant"]}>
      <Layout />
    </RequireRole>
  ),
});

const TABS = [
  { to: "/finance", label: "Dashboard", exact: true },
  { to: "/finance/expenses", label: "Expenses" },
  { to: "/finance/ledger", label: "Ledger" },
  { to: "/finance/reconciliation", label: "Reconciliation" },
  { to: "/finance/fees", label: "Fees" },
  { to: "/finance/payments", label: "Payments" },
];

function Layout() {
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
