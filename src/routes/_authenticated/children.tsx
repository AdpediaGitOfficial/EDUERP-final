import { createFileRoute, Outlet } from "@tanstack/react-router";

// The /children routes were renamed to /students. This layout only hosts the
// backward-compatible redirect stubs (children.index / children.$) so old
// bookmarks and links keep working.
export const Route = createFileRoute("/_authenticated/children")({
  component: () => <Outlet />,
});
