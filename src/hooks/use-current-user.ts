import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { apiMe, getApiToken, getApiUser, onApiAuthChange } from "@/lib/api/client";
import type { AppRole } from "@/lib/roles";
import { pickPrimaryRole } from "@/lib/roles";

export type CurrentUser = {
  id: string;
  email: string | null;
  fullName: string;
  roles: AppRole[];
  primaryRole: AppRole | null;
};

export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      // Primary: the NestJS API session — identity + roles come from /auth/me
      // (cached copy renders immediately, then revalidates).
      if (getApiToken()) {
        const cached = getApiUser();
        if (cached && mounted) {
          setUser(toCurrentUser(cached.id, cached.email, cached.fullName, cached.roles));
          setLoading(false);
        }
        const fresh = await apiMe();
        if (fresh && mounted) {
          setUser(toCurrentUser(fresh.id, fresh.email, fresh.fullName, fresh.roles));
          setLoading(false);
        }
        if (fresh || cached) return;
      }

      // Legacy fallback: a pre-cutover Supabase session.
      const { data: sessionData } = await supabase.auth.getSession();
      const authUser = sessionData.session?.user;
      if (!authUser) {
        if (mounted) {
          setUser(null);
          setLoading(false);
        }
        return;
      }
      const [{ data: profile }, { data: roleRows }] = await Promise.all([
        supabase.from("profiles").select("full_name,email").eq("id", authUser.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", authUser.id),
      ]);
      const roles = (roleRows ?? []).map((r) => r.role as AppRole);
      if (mounted) {
        setUser({
          id: authUser.id,
          email: authUser.email ?? null,
          fullName: profile?.full_name || authUser.email?.split("@")[0] || "User",
          roles,
          primaryRole: pickPrimaryRole(roles),
        });
        setLoading(false);
      }
    };

    load();
    const unsubApi = onApiAuthChange(load);
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        load();
      }
    });
    return () => {
      mounted = false;
      unsubApi();
      sub.subscription.unsubscribe();
    };
  }, []);

  return { user, loading };
}

function toCurrentUser(
  id: string,
  email: string | null,
  fullName: string,
  roles: string[],
): CurrentUser {
  const appRoles = roles as AppRole[];
  return {
    id,
    email,
    fullName: fullName || email?.split("@")[0] || "User",
    roles: appRoles,
    primaryRole: pickPrimaryRole(appRoles),
  };
}
