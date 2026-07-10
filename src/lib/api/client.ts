// HTTP client for the NestJS API (the Supabase replacement).
//
// Coexistence model (see BACKEND_MIGRATION_LOG.md): during the module-by-module
// cutover the app holds TWO sessions — this API session (used by migrated
// modules and by identity/RBAC resolution) and the legacy Supabase session
// (used by not-yet-migrated modules). Both are established at login with the
// same credentials; when the last module flips, the Supabase client is removed.

export type ApiUser = {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
};

const API_URL: string = import.meta.env.VITE_API_URL || "/api";
const TOKEN_KEY = "erp_access_token";
const USER_KEY = "erp_user";

type Listener = () => void;
const listeners = new Set<Listener>();

function notify() {
  for (const l of listeners) l();
}

/** Subscribe to API auth-state changes (login/logout/refresh). Returns unsubscribe. */
export function onApiAuthChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getApiToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getApiUser(): ApiUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as ApiUser) : null;
  } catch {
    return null;
  }
}

function storeSession(accessToken: string, user: ApiUser) {
  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  notify();
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  notify();
}

async function rawRequest(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include", // refresh cookie
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

export async function apiLogin(email: string, password: string): Promise<ApiUser> {
  const res = await rawRequest("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message || "Invalid email or password");
  }
  const data = await res.json();
  storeSession(data.accessToken, data.user);
  return data.user as ApiUser;
}

export async function apiRegister(
  email: string,
  password: string,
  fullName?: string,
): Promise<ApiUser> {
  const res = await rawRequest("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, fullName }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message || "Could not create the account");
  }
  const data = await res.json();
  storeSession(data.accessToken, data.user);
  return data.user as ApiUser;
}

export async function apiRefresh(): Promise<ApiUser | null> {
  const res = await rawRequest("/auth/refresh", { method: "POST" });
  if (!res.ok) {
    clearSession();
    return null;
  }
  const data = await res.json();
  storeSession(data.accessToken, data.user);
  return data.user as ApiUser;
}

export async function apiLogout(): Promise<void> {
  await rawRequest("/auth/logout", { method: "POST" }).catch(() => undefined);
  clearSession();
}

/** Resolve the current user from the API, refreshing once if the token expired. */
export async function apiMe(): Promise<ApiUser | null> {
  if (!getApiToken()) return null;
  const res = await apiFetch("/auth/me");
  if (!res) return null;
  return (await res.json()) as ApiUser;
}

/**
 * Authenticated fetch against the API with a single automatic refresh+retry on
 * 401. Returns null when the session is truly gone (caller redirects to /auth).
 * Non-auth errors are thrown with the server's message so React Query surfaces them.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response | null> {
  const attempt = () =>
    rawRequest(path, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${getApiToken()}` },
    });

  let res = await attempt();
  if (res.status === 401) {
    const refreshed = await apiRefresh();
    if (!refreshed) return null;
    res = await attempt();
    if (res.status === 401) {
      clearSession();
      return null;
    }
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message || `API error ${res.status}`);
  }
  return res;
}

/** Convenience JSON GET for React Query queryFns. */
export async function apiGet<T>(path: string): Promise<T> {
  const res = await apiFetch(path);
  if (!res) throw new Error("Not authenticated");
  return (await res.json()) as T;
}
