export interface AuthUser {
  id: string;
  email?: string;
}

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  token_type?: string;
  expires_in?: number;
  expires_at?: number;
  user: AuthUser;
}

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || "https://ipqgtcfnlaivnaeehywm.supabase.co").replace(/\/+$/, "");
// Supabase publishable keys are designed for browser use; access is enforced by Auth + RLS.
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_qDqEy5C7SfxV1SVLZJls9w_Zm5JcW3U";
const SESSION_KEY = "aarogya-alert-reviewer-session";

export function isAuthConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

export function getAuthSession(): AuthSession | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    return parsed?.access_token && parsed?.user?.id ? parsed : null;
  } catch {
    return null;
  }
}

function saveSession(raw: Record<string, unknown>): AuthSession | null {
  if (typeof raw.access_token !== "string" || typeof raw.refresh_token !== "string" || !raw.user) return null;
  const session: AuthSession = {
    access_token: raw.access_token,
    refresh_token: raw.refresh_token,
    token_type: typeof raw.token_type === "string" ? raw.token_type : "bearer",
    expires_in: typeof raw.expires_in === "number" ? raw.expires_in : 3600,
    expires_at: Math.floor(Date.now() / 1000) + (typeof raw.expires_in === "number" ? raw.expires_in : 3600),
    user: raw.user as AuthUser,
  };
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

async function authRequest(path: string, body?: Record<string, string>, accessToken?: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      apikey: SUPABASE_KEY,
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const message = typeof payload.msg === "string" ? payload.msg
      : typeof payload.message === "string" ? payload.message
      : typeof payload.error_description === "string" ? payload.error_description
      : "Authentication request failed.";
    throw new Error(message);
  }
  return payload;
}

export async function signInWithPassword(email: string, password: string): Promise<AuthSession> {
  const result = await authRequest("token?grant_type=password", { email: email.trim(), password });
  const session = saveSession(result);
  if (!session) throw new Error("Supabase did not return a reviewer session.");
  return session;
}

export async function signUpReviewer(email: string, password: string): Promise<{ session: AuthSession | null; confirmationRequired: boolean }> {
  const redirectTo = `${window.location.origin}/`;
  const result = await authRequest(`signup?redirect_to=${encodeURIComponent(redirectTo)}`, { email: email.trim(), password });
  const session = saveSession(result);
  return { session, confirmationRequired: !session };
}

export async function signOutReviewer(): Promise<void> {
  const session = getAuthSession();
  try {
    if (session?.access_token) await authRequest("logout", {}, session.access_token);
  } finally {
    window.localStorage.removeItem(SESSION_KEY);
  }
}

export async function getValidAuthSession(): Promise<AuthSession | null> {
  const session = getAuthSession();
  if (!session) return null;
  if (!session.expires_at || session.expires_at > Math.floor(Date.now() / 1000) + 60) return session;
  try {
    const result = await authRequest("token?grant_type=refresh_token", { refresh_token: session.refresh_token });
    return saveSession(result);
  } catch {
    window.localStorage.removeItem(SESSION_KEY);
    return null;
  }
}


export async function consumeAuthRedirect(): Promise<AuthSession | null> {
  const hash = window.location.hash;
  if (!hash || hash.length < 2) return null;

  const params = new URLSearchParams(hash.slice(1));
  const authError = params.get("error_description") || params.get("error");
  if (authError) {
    window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
    throw new Error(authError.replace(/\+/g, " "));
  }

  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (!accessToken || !refreshToken) return null;

  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const user = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || typeof user.id !== "string") {
    window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
    throw new Error("The confirmation link could not establish a reviewer session. Please sign in again.");
  }

  const session = saveSession({
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: params.get("token_type") || "bearer",
    expires_in: Number(params.get("expires_in") || "3600"),
    user,
  });
  window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
  if (!session) throw new Error("The confirmation link did not return a valid reviewer session.");
  return session;
}
