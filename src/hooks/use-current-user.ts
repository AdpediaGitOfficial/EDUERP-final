import { useEffect, useState } from "react";
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
      // The NestJS API session is the sole identity source. Render the cached
      // copy immediately, then revalidate against /auth/me.
      if (getApiToken()) {
        const cached = getApiUser();
        if (cached && mounted) {
          setUser(toCurrentUser(cached.id, cached.email, cached.fullName, cached.roles));
          setLoading(false);
        }
        const fresh = await apiMe();
        if (mounted) {
          setUser(fresh ? toCurrentUser(fresh.id, fresh.email, fresh.fullName, fresh.roles) : null);
          setLoading(false);
        }
        return;
      }

      if (mounted) {
        setUser(null);
        setLoading(false);
      }
    };

    load();
    const unsubApi = onApiAuthChange(load);
    return () => {
      mounted = false;
      unsubApi();
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
