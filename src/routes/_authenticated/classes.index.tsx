import { createFileRoute, redirect } from "@tanstack/react-router";

// Classes now lives under the Academics workspace. Keep the old /classes URL
// working by redirecting to /academics/classes.
export const Route = createFileRoute("/_authenticated/classes/")({
  beforeLoad: () => {
    throw redirect({ to: "/academics/classes", replace: true });
  },
});
