# Medusa React Frontend — Build Guide

## Stack

| Layer | Choice |
|---|---|
| Build | Vite + React 19 + TypeScript |
| Routing | React Router v7 |
| Data fetching | TanStack Query v5 |
| Auth state | React Context (simple, no extra deps) |
| Styling | Tailwind CSS v4 + DaisyUI v5 |
| Icons | lucide-react |
| HTTP | Axios |
| WebSocket | Native WebSocket via React hook |

---

## Project Structure

```
medusa-ui/
├── index.html
├── vite.config.ts
├── tailwind.config.ts
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css                    # Tailwind + DaisyUI imports
│   ├── lib/
│   │   ├── api.ts                   # Axios instance + interceptors
│   │   ├── auth.ts                  # Auth context + provider
│   │   ├── websocket.ts             # WebSocket hook
│   │   └── utils.ts                 # misc helpers
│   ├── routes/
│   │   ├── index.tsx                # Router definition
│   │   └── ProtectedRoute.tsx
│   ├── pages/
│   │   ├── Login.tsx
│   │   ├── ShowList.tsx
│   │   ├── ShowDetail.tsx
│   │   ├── AddShow.tsx
│   │   ├── Schedule.tsx
│   │   ├── History.tsx
│   │   ├── Queue.tsx
│   │   └── Settings.tsx
│   ├── components/
│   │   ├── Layout.tsx               # Sidebar + top bar + main area
│   │   ├── ShowCard.tsx
│   │   ├── EpisodeTable.tsx
│   │   ├── SeasonAccordion.tsx
│   │   ├── SearchModal.tsx
│   │   ├── StatusBadge.tsx
│   │   └── ...
│   └── types/
│       └── medusa.ts                # All TS interfaces
```

---

## 1. Bootstrapping the Project

```bash
npm create vite@latest medusa-ui -- --template react-ts
cd medusa-ui
npm install react-router-dom @tanstack/react-query axios lucide-react react-error-boundary
npm install tailwindcss @tailwindcss/vite daisyui
```

**vite.config.ts**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:8081', changeOrigin: true },
      '/ws':  { target: 'ws://localhost:8081', ws: true },
    },
  },
})
```

**src/index.css**

```css
@import "tailwindcss";
@plugin "daisyui";
```

---

## 2. Type Definitions (`src/types/medusa.ts`)

Only the core types needed. The API returns a lot of fields — only model what you use.

```ts
// ── Series ──
export interface Series {
  id: number
  indexerId: number
  title: string
  network: string | null
  status: string
  quality: string
  seasonCount: number
  year: number
  nextAirDate: string | null
  language: string
  imdbId: string | null
  tvdbId: number | null
  tvrageId: number | null
  overview: string | null
  poster: string | null
  banner: string | null
  seasons: Season[]
}

export interface Season {
  index: number
  episodes: Episode[]
}

// ── Episode ──
export interface Episode {
  episode: number
  season: number
  name: string
  description: string | null
  airDate: string | null
  status: EpisodeStatus
  quality: string
  size: number
  sceneSeason: number | null
  sceneEpisode: number | null
  absoluteNumber: number | null
  subtitles: string[]
  subtitlesSearch: string[]
}

export type EpisodeStatus =
  | 'WANTED'
  | 'SNATCHED'
  | 'SNATCHED_PROPER'
  | 'DOWNLOADED'
  | 'ARCHIVED'
  | 'SKIPPED'
  | 'IGNORED'
  | 'UNAIRED'

// ── API responses ──
export interface SeriesListResponse {
  data: Series[]
  total: number
}

export interface SeriesDetailResponse {
  data: Series
}

export interface SearchResult {
  indexerId: number
  title: string
  year: number
  network: string | null
  overview: string | null
  poster: string | null
  tvdbId: number | null
}

export interface Release {
  provider: string
  title: string
  url: string
  size: number
  seeders: number
  leechers: number
  peers: number
  pubdate: string
  quality: string
  releaseGroup: string | null
}

export interface ScheduleEntry {
  season: number
  episode: number
  airDate: string | null
  name: string
  seriesTitle: string
  seriesId: number
}

export interface HistoryEntry {
  date: string
  episode: string
  series: string
  seriesId: number
  season: number
  episodeNumber: number
  quality: string
  provider: string
  score: number
  resource: string
  action: number
}

export interface QueueItem {
  name: string
  title: string
  progress: number
  size: number
  status: string
  estimatedRemaining: string
  seriesId: number | null
}
```

---

## 3. API Client (`src/lib/api.ts`)

Medusa uses JWT auth. The token is obtained from `/token` and sent as `x-auth: Bearer <token>` on all `/api/v2/*` requests.

The 401 handler dispatches a custom event rather than doing a full-page navigation — the `AuthProvider` listens for it and uses React Router to redirect, preserving SPA state and the Query cache.

```ts
import axios from 'axios'

export const AUTH_EXPIRED_EVENT = 'medusa:auth-expired'

const api = axios.create({
  baseURL: '/api/v2',
  timeout: 30000,
  headers: { Accept: 'application/json' },
})

// ── Request interceptor: attach JWT ──
api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('medusa_token')
  if (token) config.headers['x-auth'] = `Bearer ${token}`
  return config
})

// ── Response interceptor: notify on 401 ──
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      sessionStorage.removeItem('medusa_token')
      window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT))
    }
    return Promise.reject(err)
  },
)

// Logs in with Basic auth and stores the returned JWT.
export async function fetchToken(username: string, password: string): Promise<string> {
  const creds = btoa(`${username}:${password}`)
  const { data } = await axios.get<string>('/token', {
    headers: { Authorization: `Basic ${creds}` },
  })
  sessionStorage.setItem('medusa_token', data)
  return data
}

// Short-lived ticket used to authenticate the WebSocket handshake without
// sending the JWT in a query string. Backend must expose this endpoint.
export async function fetchWsTicket(): Promise<string> {
  const { data } = await api.get<{ ticket: string }>('/ws-ticket')
  return data.ticket
}

export default api
```

---

## 4. Authentication (`src/lib/auth.tsx`)

```tsx
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchToken, AUTH_EXPIRED_EVENT } from './api'

interface AuthContextValue {
  token: string | null
  isAuthenticated: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(
    () => sessionStorage.getItem('medusa_token'),
  )
  const navigate = useNavigate()

  // Listen for 401s dispatched by the Axios interceptor — soft navigation
  // keeps the SPA mounted and lets TanStack Query cache survive a re-login.
  useEffect(() => {
    const handler = () => {
      setToken(null)
      navigate('/login', { replace: true })
    }
    window.addEventListener(AUTH_EXPIRED_EVENT, handler)
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handler)
  }, [navigate])

  const login = async (username: string, password: string) => {
    const jwt = await fetchToken(username, password)
    setToken(jwt)
  }

  const logout = () => {
    sessionStorage.removeItem('medusa_token')
    setToken(null)
  }

  return (
    <AuthContext.Provider
      value={{ token, isAuthenticated: !!token, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
```

The login page sends Basic auth to `/token`, gets back a JWT string, stores it in `sessionStorage`, and all subsequent API calls carry it via the Axios interceptor.

`AuthProvider` must be rendered *inside* `<RouterProvider>` (or `<BrowserRouter>`) because it calls `useNavigate`. See section 8 for the composition.

---

## 5. WebSocket Hook (`src/lib/websocket.ts`)

Medusa pushes live updates over WebSocket (queue progress, post-processing events). The endpoint is at `/ws`.

Two non-obvious design choices here:

1. **Ticket-based auth.** The JWT is never sent over the wire as a query string (proxies log query strings) or as a post-open frame (race: server may receive user-action frames before processing `{type: 'auth'}`). Instead we exchange the JWT for a short-lived single-use ticket via `GET /api/v2/ws-ticket`, then open `wss://…/ws?ticket=…`. Backend must implement this endpoint.

2. **`useEffectEvent` for handler dispatch.** Callers pass `handlers` as an object literal that has a new identity every render. We want the socket setup to run **once** (per token change), but the `onmessage` callback to always see the latest handlers. `useEffectEvent` is exactly that primitive — it gives us a stable function that always reads the current closure when called.

```ts
import { useEffect, useRef, useCallback } from 'react'
// useEffectEvent is stable in React 19. If you're on a transition release that
// only exposes it as experimental, alias the experimental name:
//   import { experimental_useEffectEvent as useEffectEvent } from 'react'
import { useEffectEvent } from 'react'
import { useAuth } from './auth'
import { fetchWsTicket } from './api'

type MessageHandler = (data: unknown) => void

export function useWebSocket(handlers: Record<string, MessageHandler>) {
  const ws = useRef<WebSocket | null>(null)
  const { token } = useAuth()

  // Always reads the latest handlers map at dispatch time. Not listed in deps.
  const dispatch = useEffectEvent((type: string, data: unknown) => {
    handlers[type]?.(data)
  })

  useEffect(() => {
    if (!token) return
    let cancelled = false
    let socket: WebSocket | null = null

    void (async () => {
      const ticket = await fetchWsTicket()
      if (cancelled) return

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      socket = new WebSocket(
        `${protocol}//${window.location.host}/ws?ticket=${encodeURIComponent(ticket)}`,
      )
      ws.current = socket

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as { type: string; data: unknown }
          dispatch(msg.type, msg.data)
        } catch { /* ignore malformed */ }
      }
    })()

    return () => {
      cancelled = true
      socket?.close()
      ws.current = null
    }
  }, [token])

  const send = useCallback((data: unknown) => {
    ws.current?.send(JSON.stringify(data))
  }, [])

  return { send }
}
```

---

## 6. Routing (`src/routes/index.tsx`)

The router has a single root element (`Root`) that mounts `AuthProvider` inside the router context — required because `AuthProvider` calls `useNavigate` to handle the 401 event. Heavy routes (`ShowDetail`, `Settings`) are code-split with `React.lazy`; `Suspense` lives in `Layout` so the chrome stays painted while a route chunk loads.

```tsx
import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom'
import { AuthProvider } from '../lib/auth'
import ProtectedRoute from './ProtectedRoute'
import Layout from '../components/Layout'
import Login from '../pages/Login'
import ShowList from '../pages/ShowList'
import AddShow from '../pages/AddShow'
import Schedule from '../pages/Schedule'
import History from '../pages/History'
import Queue from '../pages/Queue'

const ShowDetail = lazy(() => import('../pages/ShowDetail'))
const Settings = lazy(() => import('../pages/Settings'))

function Root() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  )
}

export const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: '/login', element: <Login /> },
      {
        path: '/',
        element: <ProtectedRoute><Layout /></ProtectedRoute>,
        children: [
          { index: true, element: <ShowList /> },
          { path: 'show/:id', element: <ShowDetail /> },
          { path: 'add', element: <AddShow /> },
          { path: 'schedule', element: <Schedule /> },
          { path: 'history', element: <History /> },
          { path: 'queue', element: <Queue /> },
          { path: 'settings', element: <Settings /> },
          { path: '*', element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
])
```

`Layout` should wrap its `<Outlet />` in `<Suspense fallback={<span className="loading loading-spinner" />}>` so the lazy chunks have a fallback.

```tsx
// ProtectedRoute.tsx
import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}
```

---

## 7. Layout (`src/components/Layout.tsx`)

DaisyUI responsive layout with bottom navigation on mobile, sidebar on desktop.

```tsx
import { Outlet, NavLink } from 'react-router-dom'
import { Suspense, useState } from 'react'
import {
  Tv,
  Calendar,
  Clock,
  History,
  Download,
  Settings,
  LogOut,
  Search,
  Menu,
  X,
} from 'lucide-react'
import { useAuth } from '../lib/auth'

const navItems = [
  { to: '/',            label: 'Shows',    icon: Tv },
  { to: '/schedule',    label: 'Schedule', icon: Calendar },
  { to: '/history',     label: 'History',  icon: History },
  { to: '/queue',       label: 'Queue',    icon: Download },
  { to: '/settings',    label: 'Settings', icon: Settings },
]

export default function Layout() {
  const { logout } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="drawer lg:drawer-open">
      {/* Mobile toggle */}
      <input
        id="drawer"
        type="checkbox"
        className="drawer-toggle"
        checked={mobileOpen}
        onChange={(e) => setMobileOpen(e.target.checked)}
      />

      {/* Page content */}
      <div className="drawer-content flex flex-col">
        {/* Top bar — visible only on mobile */}
        <header className="navbar bg-base-200 lg:hidden shadow-sm">
          <div className="flex-none">
            <label htmlFor="drawer" className="btn btn-square btn-ghost">
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </label>
          </div>
          <div className="flex-1 font-bold">Medusa</div>
        </header>

        <main className="p-4 lg:p-6 max-w-7xl mx-auto w-full">
          <Suspense
            fallback={
              <div className="flex justify-center py-20">
                <span className="loading loading-spinner loading-lg" />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </main>
      </div>

      {/* Sidebar / drawer */}
      <div className="drawer-side z-40">
        <label htmlFor="drawer" className="drawer-overlay" />
        <aside className="menu bg-base-200 text-base-content min-h-full w-64 p-4 flex flex-col gap-4">
          {/* Logo */}
          <div className="text-xl font-bold tracking-tight px-2 pt-2 pb-4">
            🧬 Medusa
          </div>

          {/* Nav links */}
          <ul className="menu menu-sm gap-1">
            {navItems.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={to === '/'}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    isActive ? 'active font-semibold' : ''
                  }
                >
                  <Icon size={18} />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Logout */}
          <button onClick={logout} className="btn btn-ghost btn-sm justify-start gap-2">
            <LogOut size={18} /> Logout
          </button>
        </aside>
      </div>
    </div>
  )
}
```

DaisyUI's `drawer` handles responsive sidebar/mobile drawer natively. On `lg:` screens it pins open; below that it overlays with a backdrop. No custom CSS needed.

---

## 8. App Composition & Mount (`src/main.tsx`)

Provider order matters: `QueryClientProvider` wraps `ErrorBoundary` wraps `RouterProvider`. `AuthProvider` lives **inside** the router (see section 6) because it needs `useNavigate`.

Install one extra dep for the error boundary:

```bash
npm install react-error-boundary
```

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import { ErrorBoundary } from 'react-error-boundary'
import { router } from './routes'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,       // 30s before refetch
      gcTime: 5 * 60_000,      // keep in cache 5 min
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

function FallbackUI({ error, resetErrorBoundary }: {
  error: Error
  resetErrorBoundary: () => void
}) {
  return (
    <div role="alert" className="p-8 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
      <pre className="text-xs bg-base-200 p-3 rounded overflow-x-auto">
        {error.message}
      </pre>
      <button className="btn btn-primary btn-sm mt-4" onClick={resetErrorBoundary}>
        Try again
      </button>
    </div>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary FallbackComponent={FallbackUI}>
        <RouterProvider router={router} />
      </ErrorBoundary>
    </QueryClientProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

**Pattern for every page:**

Every `queryFn` receives a `signal` from TanStack Query's context. Forwarding it to Axios means the underlying HTTP request is aborted when the query unmounts, the key changes, or `queryClient.cancelQueries()` is called — no wasted bandwidth, no late responses overwriting newer state.

```ts
// Each page calls the API hook
export function useShowList() {
  return useQuery({
    queryKey: ['series'],
    queryFn: ({ signal }) => api.get('/series', { signal }).then(r => r.data.data as Series[]),
  })
}

// Mutations follow the same pattern
export function useUpdateEpisodeStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ seriesId, season, episode, status }: {
      seriesId: number; season: number; episode: number; status: string
    }) => api.put(`/series/${seriesId}/episodes`, { season, episode, status }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['series', variables.seriesId] })
    },
  })
}
```

---

## 9. Core Pages

### 9a. Show List (`/`)

Query + responsive grid with DaisyUI cards. Search-as-you-type filters client-side.

```tsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import type { Series } from '../types/medusa'
import { Search } from 'lucide-react'

function useSeries() {
  return useQuery({
    queryKey: ['series'],
    queryFn: ({ signal }) => api.get('/series', { signal }).then(r => r.data.data as Series[]),
  })
}

export default function ShowList() {
  const { data: shows, isLoading } = useSeries()
  const [search, setSearch] = useState('')

  const filtered = shows?.filter((s) =>
    s.title.toLowerCase().includes(search.toLowerCase()),
  )

  if (isLoading) return <div className="flex justify-center py-20"><span className="loading loading-spinner loading-lg" /></div>

  return (
    <div className="space-y-6">
      {/* Header + search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Shows</h1>
        <div className="join w-full sm:w-auto">
          <div className="join-item flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40" />
            <input
              className="input input-bordered input-sm w-full sm:w-64 pl-9"
              placeholder="Filter shows…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Link to="/add" className="btn btn-primary btn-sm join-item">
            Add Show
          </Link>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {filtered?.map((show) => (
          <Link
            key={show.id}
            to={`/show/${show.id}`}
            className="card card-compact bg-base-100 shadow-sm hover:shadow-md transition-shadow"
          >
            <figure className="aspect-[2/3] bg-base-300">
              {show.poster ? (
                <img src={show.poster} alt={show.title} className="object-cover h-full w-full" />
              ) : (
                <div className="flex items-center justify-center h-full text-base-content/30 text-sm px-2 text-center">
                  {show.title}
                </div>
              )}
            </figure>
            <div className="card-body p-3">
              <h3 className="card-title text-sm line-clamp-1">{show.title}</h3>
              <div className="flex flex-wrap gap-1">
                <span className="badge badge-xs">{show.status}</span>
                {show.network && <span className="badge badge-xs badge-ghost">{show.network}</span>}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {filtered?.length === 0 && (
        <div className="text-center py-16 text-base-content/50">
          {search ? 'No shows match your filter.' : 'No shows added yet.'}
        </div>
      )}
    </div>
  )
}
```

Responsive grid uses Tailwind's `grid-cols-*` breakpoints. Cards are compact on mobile.

---

### 9b. Show Detail (`/show/:id`)

The most complex page. Sections:
- **Header** — poster, title, network, status, quality
- **Season accordion** — each season is a DaisyUI collapse
- **Episode table** — per-season table with status badge + actions

**Component split:**

```
ShowDetail.tsx         — layout shell, fetches series + episodes
├── SeasonAccordion.tsx — DaisyUI collapse per season
│   └── EpisodeRow.tsx  — single episode row (status, quality, name, actions)
├── EpisodeSearchModal  — DaisyUI modal, search results from API, pick release to snatch
└── SeasonActionBar     — "Set all to Wanted" / "Archive Season" etc.
```

**Season accordion pattern** (using DaisyUI collapse):

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import type { Episode } from '../types/medusa'
import { ChevronDown } from 'lucide-react'

interface Props {
  seriesId: number
  season: number
  episodes: Episode[]
}

export default function SeasonAccordion({ seriesId, season, episodes }: Props) {
  const queryClient = useQueryClient()
  const aired = episodes.filter((e) => e.status !== 'UNAIRED')

  const setStatus = useMutation({
    mutationFn: (payload: { episodes: number[]; status: string }) =>
      api.put(`/series/${seriesId}/episodes`, {
        season,
        episodes: payload.episodes,
        status: payload.status,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['series', seriesId] })
    },
  })

  return (
    <div className="collapse collapse-arrow bg-base-100 border border-base-300 rounded-box">
      <input type="checkbox" className="peer" />
      <div className="collapse-title font-semibold text-lg flex items-center gap-3">
        Season {season === 0 ? 'Specials' : season}
        <span className="text-sm font-normal text-base-content/50">
          {episodes.length} episodes · {aired.filter((e) => e.status === 'DOWNLOADED' || e.status === 'ARCHIVED').length} downloaded
        </span>
      </div>
      <div className="collapse-content p-0">
        <div className="overflow-x-auto">
          <table className="table table-zebra table-xs">
            <thead>
              <tr>
                <th>#</th>
                <th>Title</th>
                <th>Air Date</th>
                <th>Quality</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {episodes.map((ep) => (
                <tr key={`${ep.season}-${ep.episode}`}>
                  <td>{ep.episode}</td>
                  <td className={ep.name ? '' : 'text-base-content/30 italic'}>
                    {ep.name || 'TBA'}
                  </td>
                  <td className="text-xs whitespace-nowrap">
                    {ep.airDate ?? '—'}
                  </td>
                  <td><span className="badge badge-xs">{ep.quality}</span></td>
                  <td><StatusBadge status={ep.status} /></td>
                  <td>
                    <div className="dropdown dropdown-end">
                      <button className="btn btn-ghost btn-xs">⋯</button>
                      <ul className="dropdown-content menu bg-base-100 rounded-box z-10 shadow-sm border border-base-300 p-2">
                        <li><button onClick={() => setStatus.mutate({ episodes: [ep.episode], status: 'WANTED' })}>Set Wanted</button></li>
                        <li><button onClick={() => setStatus.mutate({ episodes: [ep.episode], status: 'SKIPPED' })}>Skip</button></li>
                        <li><button onClick={() => setStatus.mutate({ episodes: [ep.episode], status: 'ARCHIVED' })}>Archive</button></li>
                      </ul>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    WANTED: 'badge-info',
    SNATCHED: 'badge-warning',
    DOWNLOADED: 'badge-success',
    ARCHIVED: 'badge-success',
    SKIPPED: 'badge-ghost',
    IGNORED: 'badge-error',
    UNAIRED: 'badge-ghost',
  }
  return <span className={`badge badge-xs ${map[status] ?? 'badge-ghost'}`}>{status}</span>
}
```

The table uses DaisyUI `table table-xs table-zebra` — compact, responsive overflow-x-auto for mobile.

---

### 9c. Episode Search & Snatch

DaisyUI modal triggered from episode rows. TanStack Query for available releases, mutation to snatch.

The `<dialog>` is driven imperatively via `showModal()` / `close()` rather than by toggling the `modal-open` CSS class. The native API gives us focus trap, ESC-to-close, inert backdrop, and the `close` event for free — accessibility we'd otherwise have to reimplement. Close buttons live inside `<form method="dialog">`, so clicking them dispatches a native close (single code path: every close fires the `close` event, which calls `onClose` to sync parent state).

```tsx
import { useEffect, useRef, useEffectEvent } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import api from '../lib/api'
import type { Release } from '../types/medusa'

interface Props {
  seriesId: number
  season: number
  episode: number
  open: boolean
  onClose: () => void
}

export default function EpisodeSearchModal({ seriesId, season, episode, open, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  const { data: results, isLoading } = useQuery({
    queryKey: ['search', seriesId, season, episode],
    queryFn: ({ signal }) =>
      api.get(`/series/${seriesId}/episodes/${season}/${episode}/search`, { signal })
        .then(r => r.data.data as Release[]),
    enabled: open,
    // Release lists go stale fast — drop the global 30s default so reopening
    // the modal triggers a fresh search rather than showing hours-old peers.
    staleTime: 0,
    gcTime: 60_000,
  })

  const snatch = useMutation({
    mutationFn: (url: string) =>
      api.post(`/series/${seriesId}/episodes/${season}/${episode}/snatch`, { url }),
    onSuccess: onClose,
  })

  // Drive the native <dialog> — open/close gates on the `open` prop.
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, [open])

  // ESC or backdrop submit fires the native `close` event. useEffectEvent
  // keeps the listener attached once while always reading the latest onClose.
  const handleNativeClose = useEffectEvent(() => onClose())
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const listener = () => handleNativeClose()
    dialog.addEventListener('close', listener)
    return () => dialog.removeEventListener('close', listener)
  }, [])

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      aria-labelledby="search-modal-title"
    >
      <div className="modal-box max-w-3xl">
        <h3 id="search-modal-title" className="font-bold text-lg mb-4">
          Search — S{season}E{episode}
        </h3>

        {isLoading && (
          <div className="flex justify-center py-8">
            <span className="loading loading-spinner" />
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="table table-zebra table-xs">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Release</th>
                <th>Quality</th>
                <th>Size</th>
                <th>S/L</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {results?.map((r, i) => (
                <tr key={i}>
                  <td className="text-xs">{r.provider}</td>
                  <td className="max-w-xs truncate text-xs" title={r.title}>{r.title}</td>
                  <td><span className="badge badge-xs">{r.quality}</span></td>
                  <td className="text-xs">{(r.size / 1_073_741_824).toFixed(1)} GB</td>
                  <td className="text-xs">{r.seeders}/{r.leechers}</td>
                  <td>
                    <button
                      className="btn btn-primary btn-xs"
                      onClick={() => snatch.mutate(r.url)}
                      disabled={snatch.isPending}
                    >
                      Snatch
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="modal-action">
          <form method="dialog">
            <button className="btn btn-sm">Close</button>
          </form>
        </div>
      </div>

      {/* Click-outside-to-close: submitting a form[method=dialog] closes the dialog */}
      <form method="dialog" className="modal-backdrop">
        <button aria-label="Close dialog">close</button>
      </form>
    </dialog>
  )
}
```

---

### 9d. Add Show

Two-step: search TMDB/indexers via API, pick result, configure options (quality, root dir, status).

```tsx
export default function AddShow() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<SearchResult | null>(null)
  const [options, setOptions] = useState({
    quality: 'HDTV',
    status: 'SKIPPED',
    rootDir: '',
  })

  const search = useQuery({
    queryKey: ['search-shows', query],
    queryFn: ({ signal }) =>
      api.get('/series/search', { params: { q: query }, signal })
        .then(r => r.data.data as SearchResult[]),
    enabled: query.length >= 3,
  })

  const addShow = useMutation({
    mutationFn: () =>
      api.post('/series', {
        indexerId: selected!.indexerId,
        tvdbId: selected!.tvdbId,
        quality: options.quality,
        status: options.status,
        rootDir: options.rootDir,
      }).then(r => r.data.data as { id: number }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['series'] })
      navigate(`/show/${data.id}`)
    },
  })

  // When search is idle, show the text field prominently on mobile
  if (!selected) {
    return (
      <div className="max-w-xl mx-auto space-y-6 pt-8">
        <h1 className="text-2xl font-bold">Add Show</h1>
        <label className="input input-bordered flex items-center gap-2">
          <Search size={18} />
          <input
            className="grow"
            placeholder="Search for a show…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>

        {search.isLoading && <span className="loading loading-spinner block mx-auto" />}

        <div className="grid gap-3">
          {search.data?.map((s) => (
            <button
              key={s.indexerId}
              className="card card-side bg-base-100 border border-base-300 p-3 text-left hover:border-primary transition-colors gap-4 items-start"
              onClick={() => setSelected(s)}
            >
              <div className="w-16 aspect-[2/3] bg-base-300 rounded shrink-0 overflow-hidden">
                {s.poster && <img src={s.poster} className="object-cover w-full h-full" />}
              </div>
              <div className="min-w-0">
                <div className="font-semibold">{s.title} <span className="text-sm text-base-content/50">({s.year})</span></div>
                {s.network && <div className="text-xs text-base-content/50">{s.network}</div>}
                <p className="text-xs line-clamp-2 mt-1">{s.overview}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // Step 2: configure + confirm
  return (
    <div className="max-w-lg mx-auto space-y-6 pt-8">
      <h1 className="text-2xl font-bold">Configure Show</h1>
      <div className="card bg-base-100 border border-base-300 p-4">
        <div className="font-semibold">{selected.title}</div>
        <div className="text-sm text-base-content/50">{selected.year}</div>
      </div>

      <label className="form-control w-full">
        <span className="label-text">Initial Status</span>
        <select className="select select-bordered" value={options.status} onChange={e => setOptions(s => ({ ...s, status: e.target.value }))}>
          <option>SKIPPED</option>
          <option>WANTED</option>
        </select>
      </label>

      <label className="form-control w-full">
        <span className="label-text">Quality Profile</span>
        <select className="select select-bordered" value={options.quality} onChange={e => setOptions(s => ({ ...s, quality: e.target.value }))}>
          <option>HDTV</option>
          <option>720p</option>
          <option>1080p</option>
          <option>2160p</option>
        </select>
      </label>

      {addShow.isError && (
        <div className="alert alert-error text-sm">Failed to add show.</div>
      )}

      <button
        type="button"
        className="btn btn-primary w-full"
        onClick={() => addShow.mutate()}
        disabled={addShow.isPending}
      >
        {addShow.isPending ? <span className="loading loading-spinner loading-sm" /> : 'Add Show'}
      </button>
    </div>
  )
}
```

Imports for this file include `useMutation`, `useQuery`, `useQueryClient` from `@tanstack/react-query` and `useNavigate` from `react-router-dom`.

---

### 9e. Queue (`/queue`)

Live progress comes over the WebSocket. The Query cache is the single source of truth — the WS handler writes into it via `setQueryData`, no local mirror state, no `useEffect` to sync.

```tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { useWebSocket } from '../lib/websocket'
import type { QueueItem } from '../types/medusa'
import { Download, XCircle } from 'lucide-react'

const QUEUE_KEY = ['queue'] as const

export default function Queue() {
  const queryClient = useQueryClient()

  const { data: items = [] } = useQuery({
    queryKey: QUEUE_KEY,
    queryFn: ({ signal }) => api.get('/queue', { signal }).then(r => r.data.data as QueueItem[]),
  })

  // WS handlers write into the cache directly; the component re-renders from
  // the same useQuery subscription that owns initial load.
  useWebSocket({
    queue_update: (data) => {
      queryClient.setQueryData<QueueItem[]>(QUEUE_KEY, data as QueueItem[])
    },
    queue_item_removed: () => {
      queryClient.invalidateQueries({ queryKey: QUEUE_KEY })
    },
  })

  const remove = useMutation({
    mutationFn: (name: string) => api.delete('/queue', { data: { name } }),
    onMutate: async (name) => {
      await queryClient.cancelQueries({ queryKey: QUEUE_KEY })
      const previous = queryClient.getQueryData<QueueItem[]>(QUEUE_KEY)
      queryClient.setQueryData<QueueItem[]>(
        QUEUE_KEY,
        (prev = []) => prev.filter((i) => i.name !== name),
      )
      return { previous }
    },
    onError: (_e, _name, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(QUEUE_KEY, ctx.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QUEUE_KEY })
    },
  })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Download Queue</h1>

      {items.length === 0 && (
        <div className="text-center py-16 text-base-content/50">Queue is empty.</div>
      )}

      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.name} className="card card-compact bg-base-100 border border-base-300 p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm truncate">{item.title}</div>
                <div className="text-xs text-base-content/50 flex gap-3 mt-1">
                  <span className="flex items-center gap-1">
                    <Download size={12} /> {(item.size / 1_073_741_824).toFixed(1)} GB
                  </span>
                  <span>{item.status}</span>
                </div>
              </div>

              <div className="w-32">
                <progress
                  className="progress progress-primary w-full"
                  value={item.progress}
                  max={100}
                />
              </div>

              <button
                className="btn btn-ghost btn-xs btn-square"
                onClick={() => remove.mutate(item.name)}
                disabled={remove.isPending}
              >
                <XCircle size={16} className="text-error" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

---

### 9f. Schedule (`/schedule`)

Episodes airing soon, grouped by date. Uses a simple flat list that works well on mobile.

```tsx
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import api from '../lib/api'
import type { ScheduleEntry } from '../types/medusa'

export default function Schedule() {
  const { data, isLoading } = useQuery({
    queryKey: ['schedule'],
    queryFn: ({ signal }) => api.get('/schedule', { signal }).then(r => r.data.data as ScheduleEntry[]),
  })

  const grouped = data?.reduce<Record<string, ScheduleEntry[]>>((acc, item) => {
    const date = item.airDate?.split('T')[0] ?? 'Unknown'
    ;(acc[date] ??= []).push(item)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Schedule</h1>
      {grouped && Object.entries(grouped).map(([date, entries]) => (
        <div key={date}>
          <h2 className="font-semibold text-base mb-2">{date}</h2>
          <div className="space-y-2">
            {entries.map((e, i) => (
              <Link
                key={i}
                to={`/show/${e.seriesId}`}
                className="card card-compact bg-base-100 border border-base-300 p-3 flex flex-row items-center gap-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm">{e.seriesTitle}</div>
                  <div className="text-xs text-base-content/50">
                    S{e.season}E{e.episode} — {e.name}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
```

---

### 9g. History (`/history`)

Flat table with status badges and filters. DaisyUI `table` with overflow-x-auto for horizontal scroll on mobile.

```tsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import type { HistoryEntry } from '../types/medusa'

export default function History() {
  const [filter, setFilter] = useState('')
  const { data, isLoading } = useQuery({
    queryKey: ['history'],
    queryFn: ({ signal }) => api.get('/history', { signal }).then(r => r.data.data as HistoryEntry[]),
  })

  const filtered = data?.filter(
    (h) => !filter || h.action === Number(filter),
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">History</h1>
        <select className="select select-bordered select-sm" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All</option>
          <option value="1">Downloaded</option>
          <option value="2">Snatched</option>
          <option value="3">Failed</option>
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="table table-zebra table-xs">
          <thead>
            <tr>
              <th>Date</th>
              <th>Show</th>
              <th>Episode</th>
              <th>Quality</th>
              <th>Provider</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered?.map((h, i) => (
              <tr key={i}>
                <td className="text-xs whitespace-nowrap">{h.date}</td>
                <td className="text-sm">{h.series}</td>
                <td>S{h.season}E{h.episodeNumber}</td>
                <td><span className="badge badge-xs">{h.quality}</span></td>
                <td className="text-xs">{h.provider}</td>
                <td><StatusBadge status={['', 'DOWNLOADED', 'SNATCHED', 'FAILED'][h.action] || ''} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

---

### 9h. Settings (`/settings`)

Essential settings only: providers, download client, general. Each section is a DaisyUI collapse accordion with forms.

Controlled inputs need a defined initial value. Since `config` arrives asynchronously, we render the form only once data is available — that way `useState` inside `<GeneralForm>` initializes from the loaded values rather than from `undefined`. (Using `defaultValue={config?.x}` is a footgun: the input never updates when `config` arrives, because `defaultValue` only applies on mount.)

```tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'

interface GeneralConfig {
  tvDownloadDir: string
  indexer: 'TVDB' | 'TMDB' | 'TVMaze'
}

export default function Settings() {
  const { data: config, isLoading } = useQuery<GeneralConfig>({
    queryKey: ['config', 'general'],
    queryFn: ({ signal }) => api.get('/config/general', { signal }).then(r => r.data.data),
  })

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Settings</h1>

      <div className="collapse collapse-arrow bg-base-100 border border-base-300 rounded-box">
        <input type="checkbox" defaultChecked className="peer" />
        <div className="collapse-title font-semibold">General</div>
        <div className="collapse-content">
          {isLoading || !config ? (
            <span className="loading loading-spinner" />
          ) : (
            <GeneralForm initial={config} />
          )}
        </div>
      </div>

      {/* Providers section — same pattern */}
      {/* Download Client section — same pattern */}
    </div>
  )
}

function GeneralForm({ initial }: { initial: GeneralConfig }) {
  const queryClient = useQueryClient()
  const [values, setValues] = useState<GeneralConfig>(initial)

  const save = useMutation({
    mutationFn: (next: GeneralConfig) => api.put('/config/general', next),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['config', 'general'] }),
  })

  return (
    <div className="space-y-4">
      <label className="form-control">
        <span className="label-text">Download Directory</span>
        <input
          className="input input-bordered input-sm"
          value={values.tvDownloadDir}
          onChange={(e) => setValues(v => ({ ...v, tvDownloadDir: e.target.value }))}
        />
      </label>
      <label className="form-control">
        <span className="label-text">Indexer</span>
        <select
          className="select select-bordered select-sm"
          value={values.indexer}
          onChange={(e) => setValues(v => ({ ...v, indexer: e.target.value as GeneralConfig['indexer'] }))}
        >
          <option>TVDB</option>
          <option>TMDB</option>
          <option>TVMaze</option>
        </select>
      </label>
      <button
        className="btn btn-primary btn-sm"
        onClick={() => save.mutate(values)}
        disabled={save.isPending}
      >
        {save.isPending ? <span className="loading loading-spinner loading-sm" /> : 'Save'}
      </button>
    </div>
  )
}
```

---

### 9i. Login (`/login`)

The only page outside the protected layout. Sends Basic auth to `/token` via `useAuth().login()`, redirects on success, surfaces server error on failure.

```tsx
import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'

export default function Login() {
  const { isAuthenticated, login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (isAuthenticated) return <Navigate to="/" replace />

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(username, password)
      navigate('/', { replace: true })
    } catch {
      setError('Invalid username or password')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-base-200">
      <form
        onSubmit={onSubmit}
        className="card bg-base-100 shadow-xl w-full max-w-sm p-6 space-y-4"
      >
        <h1 className="text-2xl font-bold text-center">🧬 Medusa</h1>

        <label className="form-control">
          <span className="label-text">Username</span>
          <input
            className="input input-bordered"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            required
          />
        </label>

        <label className="form-control">
          <span className="label-text">Password</span>
          <input
            type="password"
            className="input input-bordered"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        {error && (
          <div className="alert alert-error text-sm py-2">{error}</div>
        )}

        <button
          type="submit"
          className="btn btn-primary w-full"
          disabled={submitting}
        >
          {submitting ? <span className="loading loading-spinner loading-sm" /> : 'Log in'}
        </button>
      </form>
    </div>
  )
}
```

---

## 10. Responsive Patterns Summary

| Pattern | How |
|---|---|
| Navigation | DaisyUI `drawer` — sidebar on `lg:`, slide-out drawer on mobile |
| Show grid | `grid-cols-2` → `sm:3` → `md:4` → `lg:5` → `xl:6` |
| Tables | `overflow-x-auto` wrapper on all tables, DaisyUI `table-xs` |
| Cards | `card-compact` reduces padding on mobile |
| Modals | DaisyUI `modal` is full-screen on mobile by default (`.modal-bottom sm:modal-middle`) |
| Forms | `form-control` + `w-full` on inputs; `max-w-xl mx-auto` for centered pages |
| Top bar | Show `navbar` only below `lg:` breakpoint |
| Touch targets | All buttons use DaisyUI sizing (`btn-sm`, etc.) which respects touch |

---

## 11. TanStack Query Patterns

| Pattern | Code |
|---|---|
| Basic list | `useQuery({ queryKey: ['series'], queryFn: ... })` |
| Dependent query | `useQuery({ ..., enabled: !!selectedId })` |
| Pagination | `queryKey: ['history', page], queryFn: () => api.get('/history', { params: { page } })` |
| Optimistic mutation | `useMutation({ onMutate: ..., onError: rollback })` |
| Cache invalidation | `queryClient.invalidateQueries({ queryKey: ['series', id] })` |
| Refetch on WS event | Call `invalidateQueries` from the WS handler |
| Request cancellation | `queryFn: ({ signal }) => api.get('/x', { signal })` — aborts in-flight requests on unmount, key change, or `cancelQueries()` |
| Stale time | 30s default — frequent enough for queue/schedule, no unnecessary refetch for config |

---

## 12. What This Guide Covers vs. Full Medusa UI

**Covered (must-have):**
- Show list/browse/completed status
- Show detail with season accordion + episode table + status changes
- Episode search modal + snatch
- Add new show (search + configure)
- Schedule (upcoming episodes)
- History (with action filter)
- Download queue (live via WebSocket)
- Settings (essential: providers, download client, general)
- Auth (login, JWT, protected routes)
- Responsive mobile layout

**Skipped (can add later):**
- Anime-specific config (config-anime)
- Subtitles search/config
- Backup/restore UI
- IRC client
- News/changelog pages
- Recommended shows page
- Manual post-processing UI
- Rename preview
- Log viewer
- Scene alias management
- Mass episode update page
- Multiple theme support (DaisyUI handles the one theme)
