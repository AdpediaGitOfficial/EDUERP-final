// HTTP client for the NestJS API — the sole backend for the app.
//
// The module-by-module cutover (see BACKEND_MIGRATION_LOG.md) is complete: every
// page and every write goes through this API session (JWT access token in
// localStorage + an httpOnly refresh cookie). The legacy dual-session era, when
// the app also held a second backend session for not-yet-migrated modules, is
// over — this is now the only client.

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

/**
 * Request a password-reset link. Always resolves — the API never reveals whether
 * the address has an account.
 */
export async function apiRequestPasswordReset(email: string): Promise<void> {
  await rawRequest("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  }).catch(() => undefined);
}

/**
 * Complete a password reset with the token from the emailed link. On success the
 * API returns a fresh session, so the user lands signed in.
 */
export async function apiResetPassword(token: string, password: string): Promise<ApiUser> {
  const res = await rawRequest("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message || "This reset link is invalid or has expired");
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

/** Convenience JSON POST for React Query mutationFns. */
export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await apiFetch(path, {
    method: "POST",
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!res) throw new Error("Not authenticated");
  return (await res.json()) as T;
}

/** Convenience JSON PATCH for React Query mutationFns. */
export async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  const res = await apiFetch(path, {
    method: "PATCH",
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!res) throw new Error("Not authenticated");
  return (await res.json()) as T;
}

/** Convenience DELETE for React Query mutationFns. */
export async function apiDelete<T>(path: string): Promise<T> {
  const res = await apiFetch(path, { method: "DELETE" });
  if (!res) throw new Error("Not authenticated");
  return (await res.json()) as T;
}

export type UploadedFileMeta = {
  key: string;
  url: string;
  name: string;
  size: number;
  mime: string;
};

/**
 * Upload a file to POST /files (multipart). The browser sets the multipart
 * content-type + boundary, so we must NOT send our JSON content-type here.
 * Refreshes once on 401, like apiFetch. Returns the stored file's metadata
 * (`url` is what you save on the owning record).
 */
export async function apiUpload(
  file: File,
  category: string,
  path = "/files",
): Promise<UploadedFileMeta> {
  const attempt = () => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("category", category);
    return fetch(`${API_URL}${path}`, {
      method: "POST",
      credentials: "include",
      headers: { Authorization: `Bearer ${getApiToken()}` },
      body: fd,
    });
  };

  let res = await attempt();
  if (res.status === 401) {
    const refreshed = await apiRefresh();
    if (!refreshed) throw new Error("Not authenticated");
    res = await attempt();
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message || `Upload failed (${res.status})`);
  }
  return (await res.json()) as UploadedFileMeta;
}

/**
 * Fetch a stored file (the authed GET /files/:key) and return a blob object URL
 * for inline display or download. The download endpoint requires the bearer
 * token, which a plain <img src>/<a href> can't send — so we fetch it here and
 * hand back an object URL. Remember to URL.revokeObjectURL(url) when done.
 * Returns null if the session is gone or the file is missing.
 */
export async function apiFileObjectUrl(pathOrUrl: string): Promise<string | null> {
  const path = pathOrUrl.replace(/^\/api/, ""); // "/files/…"
  try {
    const res = await apiFetch(path);
    if (!res) return null;
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } catch {
    // Missing/stale file (404) or transient error — degrade to the fallback UI
    // rather than throwing an unhandled rejection into the component tree.
    return null;
  }
}
