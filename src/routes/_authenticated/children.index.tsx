import { createFileRoute, redirect } from "@tanstack/react-router";

// Backward-compatible redirect: /children → /students (the "My Children" list
// now lives at /students, scoped to the parent's linked students).
export const Route = createFileRoute("/_authenticated/children/")({
  beforeLoad: () => {
    throw redirect({ to: "/students", replace: true });
  },
});
