import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { apiMe, getApiToken } from "@/lib/api/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // Primary: the NestJS API session (validates + auto-refreshes the token).
    if (getApiToken()) {
      const user = await apiMe();
      if (user) return { user };
    }
    // Legacy fallback: an existing Supabase session from before the cutover,
    // so already-signed-in users aren't logged out mid-rollout.
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: () => <Outlet />,
});
