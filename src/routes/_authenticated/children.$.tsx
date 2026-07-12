import { createFileRoute, redirect } from "@tanstack/react-router";

// Backward-compatible redirect for every old /children/* deep link
// (/children/$studentId, /children/$studentId/report, .../transport, …)
// to the equivalent /students/* route.
export const Route = createFileRoute("/_authenticated/children/$")({
  beforeLoad: ({ params }) => {
    const splat = (params as { _splat?: string })._splat ?? "";
    throw redirect({ href: `/students/${splat}`, replace: true });
  },
});
