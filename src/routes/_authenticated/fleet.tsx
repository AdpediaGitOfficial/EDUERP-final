import { createFileRoute, Outlet } from "@tanstack/react-router";
import { RequireRole } from "@/components/require-role";
import { AppShell } from "@/components/app-shell";
import { ModuleTabs, type TabItem } from "@/components/module-tabs";

export const Route = createFileRoute("/_authenticated/fleet")({
  component: () => (
    <RequireRole roles={["admin", "fleet_manager"]}>
      <Layout />
    </RequireRole>
  ),
});

const NAV: TabItem[] = [
  { to: "/fleet", label: "Dashboard", exact: true },
  {
    label: "Fleet",
    items: [
      { to: "/fleet/vehicles", label: "Vehicles" },
      { to: "/fleet/drivers", label: "Drivers" },
      { to: "/fleet/routes", label: "Routes & Stops" },
      { to: "/fleet/tracking", label: "Live Tracking" },
    ],
  },
  {
    label: "Operations",
    items: [
      { to: "/fleet/fuel", label: "Fuel" },
      { to: "/fleet/maintenance", label: "Maintenance" },
      { to: "/fleet/analytics", label: "Analytics" },
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
