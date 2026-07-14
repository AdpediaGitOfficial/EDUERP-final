import { createFileRoute, Outlet } from "@tanstack/react-router";
import { RequireRole } from "@/components/require-role";
import { AppShell } from "@/components/app-shell";
import { ModuleTabs, type TabItem } from "@/components/module-tabs";

export const Route = createFileRoute("/_authenticated/finance")({
  component: () => (
    <RequireRole roles={["admin", "accountant"]}>
      <Layout />
    </RequireRole>
  ),
});

const NAV: TabItem[] = [
  { to: "/finance", label: "Dashboard", exact: true },
  { to: "/finance/collection", label: "Collection" },
  { to: "/finance/challans", label: "Challans" },
  { to: "/finance/payments", label: "Payments" },
  {
    label: "Setup",
    items: [
      { to: "/finance/fee-types", label: "Fee Types" },
      { to: "/finance/fee-groups", label: "Fee Groups" },
      { to: "/finance/assign-fees", label: "Assign Fees" },
      { to: "/finance/fees", label: "Fee Structures" },
    ],
  },
  { to: "/finance/expenses", label: "Expenses" },
  { to: "/finance/ledger", label: "Ledger" },
  { to: "/finance/reconciliation", label: "Reconciliation" },
];

function Layout() {
  return (
    <AppShell>
      <ModuleTabs items={NAV} />
      <Outlet />
    </AppShell>
  );
}
