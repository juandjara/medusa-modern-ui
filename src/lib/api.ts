import axios from 'axios'

export const AUTH_EXPIRED_EVENT = 'medusa:auth-expired'
const API_KEY_STORAGE_KEY = 'medusa_api_key'

// PyMedusa exposes per-user asset endpoints under /api/v2/series/{slug}/asset/{variant}.
// Browsers can't send Authorization headers from <img src>, so the backend
// accepts the legacy `api_key` via query string. We extract the key from the
// JWT payload (`apiKey` claim, set in medusa/server/api/v2/auth.py:300) rather
// than requiring it as a separate env var.
export type AssetVariant = 'poster' | 'posterThumb' | 'banner' | 'bannerThumb'

// Decode the base64url payload of a JWT without verifying the signature.
// The server signs and verifies; we only need to read claims.
//
// JWTs use base64url (RFC 7515 §2) — `-`/`_` swapped for `+`/`/` and padding
// stripped. The native Uint8Array.fromBase64() with alphabet:'base64url'
// handles both differences directly, so we don't need to remap chars or
// re-pad before decoding.
function decodeJwtPayload(jwt: string): { apiKey?: string } | null {
  const payload = jwt.split('.')[1]
  if (!payload) return null
  try {
    const bytes = Uint8Array.fromBase64(payload, { alphabet: 'base64url' })
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return null
  }
}

// Returns the user's api_key, caching it in sessionStorage on first call.
// Self-heals for sessions that pre-date the JWT-extraction logic — those
// already have a token but no cached key.
function getApiKey(): string {
  const cached = sessionStorage.getItem(API_KEY_STORAGE_KEY)
  if (cached) return cached
  const jwt = sessionStorage.getItem('medusa_token')
  if (!jwt) return ''
  const apiKey = decodeJwtPayload(jwt)?.apiKey ?? ''
  if (apiKey) sessionStorage.setItem(API_KEY_STORAGE_KEY, apiKey)
  return apiKey
}

export function getAssetUrl(slug: string, variant: AssetVariant = 'posterThumb'): string {
  const key = getApiKey()
  const qs = key ? `?api_key=${key}` : ''
  return `/api/v2/series/${slug}/asset/${variant}${qs}`
}

export function clearApiKey() {
  sessionStorage.removeItem(API_KEY_STORAGE_KEY)
}

const api = axios.create({
  baseURL: '/api/v2',
  timeout: 30000,
  headers: { Accept: 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('medusa_token')
  if (token) config.headers['x-auth'] = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      sessionStorage.removeItem('medusa_token')
      clearApiKey()
      window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT))
    }
    return Promise.reject(err)
  },
)

// Logs in via two parallel mechanisms:
//   1. GET /token (Basic auth) → returns JWT for /api/v2/* requests.
//   2. POST /login (form-encoded) → sets the SECURE_TOKEN secure cookie that
//      Tornado's WebSocket handler (`@authenticated`) checks. The WS handler
//      doesn't read the JWT, so without this second call the socket would
//      fail to upgrade as soon as web auth is enabled on the backend.
export async function fetchToken(username: string, password: string): Promise<string> {
  const creds = btoa(`${username}:${password}`)
  const { data } = await axios.get<string>('/token', {
    headers: { Authorization: `Basic ${creds}` },
  })
  sessionStorage.setItem('medusa_token', data)
  const apiKey = decodeJwtPayload(data)?.apiKey
  if (apiKey) sessionStorage.setItem(API_KEY_STORAGE_KEY, apiKey)

  // Fire-and-forget — /login responds with a 302 that browsers auto-follow;
  // we only care about the Set-Cookie header on the way through.
  const form = new URLSearchParams({ username, password })
  axios.post('/login', form).catch((err) => {
    console.warn(
      'Legacy /login call failed — WebSocket live updates may not work',
      err,
    )
  })

  return data
}

export default api
