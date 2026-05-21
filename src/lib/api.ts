import axios from "axios";

export const AUTH_EXPIRED_EVENT = "medusa:auth-expired";
const TOKEN_KEY = "medusa_token";
const API_KEY_STORAGE_KEY = "medusa_api_key";

// Dual-storage helper. "Remember me" writes to localStorage (persists across
// browser restarts); the default writes to sessionStorage (cleared on tab
// close). Reads prefer localStorage so a long-lived session beats a stale
// session-storage token if both ever coexist.
function readToken(): string | null {
  return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY);
}

function writeToken(jwt: string, remember: boolean) {
  if (remember) {
    localStorage.setItem(TOKEN_KEY, jwt);
    sessionStorage.removeItem(TOKEN_KEY);
  } else {
    sessionStorage.setItem(TOKEN_KEY, jwt);
    localStorage.removeItem(TOKEN_KEY);
  }
}

function eraseToken() {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}

export function getStoredToken(): string | null {
  return readToken();
}

export function clearStoredToken() {
  eraseToken();
}

// <img src> can't send Authorization headers, so asset endpoints fall back
// to an api_key query string. We pull it from the JWT's `apiKey` claim.
export type AssetVariant =
  | "poster"
  | "posterThumb"
  | "banner"
  | "bannerThumb"
  | "fanart"
  | "network";

// Server verifies signatures; we only read claims.
function decodeJwtPayload(jwt: string): { apiKey?: string } | null {
  const payload = jwt.split(".")[1];
  if (!payload) return null;
  try {
    const bytes = Uint8Array.fromBase64(payload, { alphabet: "base64url" });
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

function getApiKey(): string {
  const cached = sessionStorage.getItem(API_KEY_STORAGE_KEY);
  if (cached) return cached;
  const jwt = readToken();
  if (!jwt) return "";
  const apiKey = decodeJwtPayload(jwt)?.apiKey ?? "";
  if (apiKey) sessionStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
  return apiKey;
}

export function getAssetUrl(
  slug: string,
  variant: AssetVariant = "posterThumb",
): string {
  const key = getApiKey();
  const qs = key ? `?api_key=${key}` : "";
  return `/api/v2/series/${slug}/asset/${variant}${qs}`;
}

export function clearApiKey() {
  sessionStorage.removeItem(API_KEY_STORAGE_KEY);
}

const api = axios.create({
  baseURL: "/api/v2",
  timeout: 30000,
  headers: { Accept: "application/json" },
});

api.interceptors.request.use((config) => {
  const token = readToken();
  if (token) config.headers["x-auth"] = `Bearer ${token}`;
  return config;
});

// Single in-flight /token call shared across all parallel 401s — avoids a
// stampede when the JWT expires while several queries are in flight at once.
let refreshInFlight: Promise<string> | null = null;

// Explicit logout flag stops the interceptor from silently re-issuing a JWT
// for in-flight requests that resolve after the user clicked Logout — the
// cookie is still valid on the server until /logout completes, so otherwise
// a stale request could undo the sign-out.
let loggingOut = false;

function refreshAccessToken(): Promise<string> {
  if (loggingOut) return Promise.reject(new Error("logging out"));
  if (refreshInFlight) return refreshInFlight;
  // Preserve the storage tier of the existing token so a remembered session
  // stays remembered after refresh, and a session-scoped one stays session.
  const wasRemembered = !!localStorage.getItem(TOKEN_KEY);
  refreshInFlight = axios
    .get<string>("/token")
    .then((r) => {
      const jwt = r.data;
      writeToken(jwt, wasRemembered);
      const apiKey = decodeJwtPayload(jwt)?.apiKey;
      if (apiKey) sessionStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
      return jwt;
    })
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config as
      | (typeof err.config & { _retried?: boolean })
      | undefined;
    const is401 = err.response?.status === 401;

    if (is401 && original && !original._retried && !loggingOut) {
      original._retried = true;
      try {
        const fresh = await refreshAccessToken();
        original.headers = { ...original.headers, "x-auth": `Bearer ${fresh}` };
        return api.request(original);
      } catch {
        // Cookie expired too — fall through to terminal-401 handling below.
      }
    }

    if (is401) {
      eraseToken();
      clearApiKey();
      window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
    }
    return Promise.reject(err);
  },
);

// Tear down both the JWT (local + session storage) and the SECURE_TOKEN
// cookie. Hitting GET /logout server-side is what clears the cookie — without
// it, an in-flight 401 could silently re-issue a JWT against the still-valid
// cookie and undo the sign-out.
export async function logoutSession() {
  loggingOut = true;
  try {
    // Best-effort; ignore failures (e.g. offline) and clear locally anyway.
    await axios.get("/logout").catch(() => undefined);
  } finally {
    eraseToken();
    clearApiKey();
    loggingOut = false;
  }
}

// JWT lifetimes: 30 days when the user opts into "Remember me", 24h
// otherwise. The cookie lifetime set by the legacy /login call matches.
const JWT_EXP_REMEMBERED = 30 * 86400; // seconds
const JWT_EXP_DEFAULT = 86400;

// Initial sign-in. Hits the v2 /api/v2/authenticate endpoint (JSON body,
// caller-controlled exp) for the JWT, then fires the legacy /login call to
// set the SECURE_TOKEN cookie that legacy endpoints (/home, /errorlogs,
// /browser, /config/general, /config/postProcessing) and the WebSocket
// handler need. The silent-refresh path (refreshAccessToken) still uses
// GET /token because it's the only endpoint that can re-issue without
// credentials in the body.
export async function fetchToken(
  username: string,
  password: string,
  remember = false,
): Promise<string> {
  const { data } = await axios.post<{ token: string }>(
    "/api/v2/authenticate",
    {
      username,
      password,
      exp: remember ? JWT_EXP_REMEMBERED : JWT_EXP_DEFAULT,
    },
    { headers: { "Content-Type": "application/json" } },
  );
  console.log("token data", data);
  const jwt = data.token;
  writeToken(jwt, remember);
  const apiKey = decodeJwtPayload(jwt)?.apiKey;
  if (apiKey) sessionStorage.setItem(API_KEY_STORAGE_KEY, apiKey);

  // Fire-and-forget — /login responds with a 302 that axios auto-follows;
  // we only care about the Set-Cookie header on the way through.
  const form = new URLSearchParams({
    username,
    password,
    ...(remember ? { remember_me: "1" } : {}),
  });
  axios.post("/login", form).catch((err) => {
    console.warn(
      "Legacy /login call failed — WebSocket live updates may not work",
      err,
    );
  });

  return jwt;
}

export default api;
