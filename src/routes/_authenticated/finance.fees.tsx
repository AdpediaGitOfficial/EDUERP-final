import { createFileRoute } from "@tanstack/react-router";
import { FeesPage } from "./fees";

// Fees rendered as a Finance sub-tab. FeesPage's own AppShell collapses to a
// fragment here (it's nested inside the Finance layout's shell), so it shows
// inside the Finance page with the tab bar intact — no routing outside.
export const Route = createFileRoute("/_authenticated/finance/fees")({
  component: FeesPage,
});
