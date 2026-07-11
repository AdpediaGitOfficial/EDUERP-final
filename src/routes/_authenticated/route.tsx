import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { apiMe, getApiToken } from "@/lib/api/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // The NestJS API session is now the sole identity source (validates +
    // auto-refreshes the token). No signed-in user is redirected to /auth.
    if (getApiToken()) {
      const user = await apiMe();
      if (user) return { user };
    }
    throw redirect({ to: "/auth" });
  },
  component: () => <Outlet />,
});
