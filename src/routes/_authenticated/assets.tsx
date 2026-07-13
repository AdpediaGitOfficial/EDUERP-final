import { createFileRoute, Outlet } from "@tanstack/react-router";
import { RequireRole } from "@/components/require-role";
import { AppShell } from "@/components/app-shell";
import { ModuleTabs, type TabItem } from "@/components/module-tabs";

export const Route = createFileRoute("/_authenticated/assets")({
  component: () => (
    <RequireRole roles={["admin"]}>
      <AssetsLayout />
    </RequireRole>
  ),
});

const NAV: TabItem[] = [
  { to: "/assets", label: "Dashboard", exact: true },
  { to: "/assets/registry", label: "Registry" },
  { to: "/assets/categories", label: "Categories" },
  { to: "/assets/allocation", label: "Allocation" },
  { to: "/assets/maintenance", label: "Maintenance & AMC" },
  { to: "/assets/vendors", label: "Vendors" },
];

function AssetsLayout() {
  return (
    <AppShell>
      <ModuleTabs items={NAV} />
      <Outlet />
    </AppShell>
  );
}
