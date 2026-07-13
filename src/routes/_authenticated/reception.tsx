import { createFileRoute, Outlet } from "@tanstack/react-router";
import { RequireRole } from "@/components/require-role";
import { AppShell } from "@/components/app-shell";
import { ModuleTabs, type TabItem } from "@/components/module-tabs";

export const Route = createFileRoute("/_authenticated/reception")({
  component: () => (
    <RequireRole roles={["admin", "reception"]}>
      <Layout />
    </RequireRole>
  ),
});

const NAV: TabItem[] = [
  { to: "/reception", label: "Dashboard", exact: true },
  { to: "/reception/admissions", label: "Admissions" },
  { to: "/reception/visitors", label: "Visitors" },
  { to: "/reception/transport", label: "Transport" },
];

function Layout() {
  return (
    <AppShell>
      <ModuleTabs items={NAV} />
      <Outlet />
    </AppShell>
  );
}
