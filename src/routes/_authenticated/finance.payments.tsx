import { createFileRoute } from "@tanstack/react-router";
import { PaymentsPage } from "./payments";

// Payments rendered as a Finance sub-tab (see finance.fees.tsx). Access is gated
// by the Finance layout's RequireRole (admin + accountant).
export const Route = createFileRoute("/_authenticated/finance/payments")({
  component: PaymentsPage,
});
