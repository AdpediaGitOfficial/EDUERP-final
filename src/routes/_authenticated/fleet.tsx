import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { RequireRole } from "@/components/require-role";
import { AppShell } from "@/components/app-shell";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/fleet")({
  component: () => (
    <RequireRole roles={["admin", "fleet_manager"]}>
      <Layout />
    </RequireRole>
  ),
});

const TABS = [
  { to: "/fleet", label: "Dashboard", exact: true },
  { to: "/fleet/vehicles", label: "Vehicles" },
  { to: "/fleet/drivers", label: "Drivers" },
  { to: "/fleet/routes", label: "Routes & Stops" },
  { to: "/fleet/tracking", label: "Live Tracking" },
  { to: "/fleet/fuel", label: "Fuel" },
  { to: "/fleet/maintenance", label: "Maintenance" },
  { to: "/fleet/analytics", label: "Analytics" },
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
