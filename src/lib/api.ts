import axios from "axios";

export const AUTH_EXPIRED_EVENT = "medusa:auth-expired";
const API_KEY_STORAGE_KEY = "medusa_api_key";

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
  const jwt = sessionStorage.getItem("medusa_token");
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
  const token = sessionStorage.getItem("medusa_token");
  if (token) config.headers["x-auth"] = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      sessionStorage.removeItem("medusa_token");
      clearApiKey();
      window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
    }
    return Promise.reject(err);
  },
);

// /token returns the JWT for /api/v2/* requests; /login sets the
// SECURE_TOKEN cookie the WebSocket handler requires.
export async function fetchToken(
  username: string,
  password: string,
): Promise<string> {
  const creds = btoa(`${username}:${password}`);
  const { data } = await axios.get<string>("/token", {
    headers: { Authorization: `Basic ${creds}` },
  });
  sessionStorage.setItem("medusa_token", data);
  const apiKey = decodeJwtPayload(data)?.apiKey;
  if (apiKey) sessionStorage.setItem(API_KEY_STORAGE_KEY, apiKey);

  // Fire-and-forget — /login responds with a 302 that browsers auto-follow;
  // we only care about the Set-Cookie header on the way through.
  const form = new URLSearchParams({ username, password });
  axios.post("/login", form).catch((err) => {
    console.warn(
      "Legacy /login call failed — WebSocket live updates may not work",
      err,
    );
  });

  return data;
}

export default api;
