# Medusa Modern UI

A complete frontend rewrite of [Medusa](https://github.com/pymedusa/Medusa) — the automatic TV show library manager — replacing the legacy Vue 2 UI with React 19 + TypeScript. The Python/Tornado backend runs unchanged; this is a drop-in replacement for the frontend only.

> **Project status: beta.** The author has been running it daily as his primary Medusa UI since late May 2026, but it has not yet had wide community testing. It runs *alongside* the legacy UI, not instead of it — the backend keeps serving the old frontend on its own port, so you can [switch back](#reverting-to-the-legacy-ui) at any time. See [Compatibility](#compatibility) for the exact backend commit it was developed against.

## What's different from the original Medusa?

| Area       | Legacy (Vue)                     | Modern UI                                      |
| ---------- | -------------------------------- | ---------------------------------------------- |
| Stack      | Vue 2, jQuery, Cheetah templates | React 19, TypeScript, Tailwind v4 + DaisyUI v5 |
| Data layer | Page reloads, polling            | TanStack Query + live WebSocket updates        |
| Routing    | Server-rendered (multi-page app) | Client-side SPA via React Router 7             |
| Auth       | Session cookie only              | JWT-based with silent refresh                  |
| Dialogs    | Bootstrap modals                 | Native `<dialog>` elements                     |
| Forms      | jQuery-heavy                     | Type-safe drafts via `useDraftConfig`          |

### The biggest advantage: live updates

The UI uses **persistent WebSocket push** instead of polling. When a download completes, a search finishes, or the queue changes, the UI updates instantly — no page refresh needed. Everything from the history feed to search results to the notification badge is driven by real-time server events.

### What's covered

The UI covers all major day-to-day Medusa workflows: Show list & detail, Add/Import shows, Schedule, History, Queue, Logs, Post-process, backlog management (Backlog overview, Episode statuses, Bulk shows, Failed releases, Missing subtitles), System panel (schedulers, disk space, maintenance), and all Settings pages (General, Search, Providers including Prowlarr, Download clients, Post-processing, Subtitles, Notifications, Backup & restore).

### Known limitations

Some legacy surfaces were intentionally left out, either because they are rarely used or genuinely out of scope for a frontend rewrite:

- **Anime-specific configuration** pages
- **IRC client**, **News** and **Changelog** pages
- **Multi-theme support** — no theme picker; there is a single design that follows your OS light/dark preference
- **Test rename** page
- **Manage Searches** page — its useful parts (scheduler status, backlog pause, forced searches) were folded into the System page
- Per-show **advanced search templates** CRUD
- Niche notifiers: Boxcar2, Pushalot, Growl, Prowl, libnotify, PyTivo — the mainstream ones (Kodi, Plex, Emby/Jellyfin, Synology, Pushbullet, Pushover, Telegram, Discord, Slack, Email, Trakt) *are* implemented
- The UI must be served at the domain root — Medusa's `web_root` prefix option is not supported

If one of these is a blocker for you, the [legacy UI remains available](#reverting-to-the-legacy-ui) — both frontends can be used against the same backend at the same time.

## Compatibility

| Backend | Status |
| --- | --- |
| `pymedusa/Medusa` `develop` @ [`ecc1a23`](https://github.com/pymedusa/Medusa/commit/ecc1a2392c744a18f763f0eff0b7baed006977d0) (2026-05-17, internal version 1.0.25) | Developed and daily-driven against this commit |
| `develop` commits after `ecc1a23` | Expected to work (the apiv2 surface changes rarely) but not yet tested |
| `master` releases | Not tested |

One optional feature degrades on a stock backend: release **info links** in the manual episode search results come from a small backend patch (adding `infoUrl` to Newznab/Torznab results) that has not been upstreamed yet. On an unpatched backend those links simply don't render — everything else uses stock apiv2 and legacy endpoints.

## How to run

You need a running [pymedusa](https://github.com/pymedusa/Medusa) instance to connect to. The dev-server proxy target is the `SERVER_URL` constant in `vite.config.ts` — point it at your backend (Medusa's default listen address is `localhost:8081`).

### Development

```bash
pnpm install
pnpm dev
```

Opens on `http://localhost:5173`. The Vite dev server proxies routes `/api/* /token /login /logout /images/* /cache/* /home/* /errorlogs/* /browser/* /config/* /ws/*` to the backend automatically.

### Production build

```bash
pnpm install
pnpm build          # tsc -b && vite build → dist/
pnpm preview        # serve built files on :4173
```

Ship `dist/` behind any reverse-proxy, routing API/WebSocket paths to the running backend.

### Docker Compose

See the `deploy/` folder for an example on how to deploy this project with Docker Compose and Caddy:

- `deploy/docker-compose.yml` — wires up pymedusa + medusa-modern-ui on a shared `web` network (requires an external reverse-proxy like Caddy).
- `deploy/Caddyfile` — example Caddy v2 config that routes API/WebSocket paths to pymedusa and everything else to the frontend.

### Reverting to the legacy UI

This project is purely additive: it never modifies the backend, and the backend keeps serving the legacy Vue UI on its own port the whole time. All state (shows, history, settings) lives in the backend database, so there is nothing to migrate in either direction — you can even use both UIs simultaneously.

- **Dev / preview setup**: just browse to the backend port (default `http://<host>:8081`) instead of the Vite/preview port.
- **Reverse-proxy setup** (like the Caddy example): point *all* paths at the backend instead of splitting them between backend and frontend, or simply expose the backend port and browse to it directly.

## Troubleshooting

The most common deployment issues are reverse-proxy routing and WebSocket problems. The golden rule: the frontend and the backend API **must be served from the same origin** (scheme + host + port), with these paths routed to the Medusa backend and everything else to the frontend's static files:

```
/api/*  /token  /login  /logout  /images/*  /cache/*
/home/*  /errorlogs/*  /browser/*  /config/*  /ws/*
```

Symptoms and causes:

- **Everything loads, but nothing updates live (no toasts, history/queue frozen until refresh).** The WebSocket at `/ws/ui` isn't working. Two usual causes:
  1. Your proxy doesn't forward WebSocket upgrades on `/ws/*`. Caddy's `reverse_proxy` handles this automatically; nginx needs explicit `proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";` on that location.
  2. The `SECURE_TOKEN` cookie isn't reaching the backend. The WebSocket authenticates with a cookie set by the legacy `/login` endpoint (not the JWT), which is why same-origin matters — if the UI and the API are on different domains, REST calls work but the cookie never flows to `/ws/ui`.
- **Bounced to the sign-in page once a day (or once a month with "Remember me").** When the JWT expires the UI silently re-issues one via `GET /token` — if that path isn't routed to the backend, the refresh fails and you're signed out instead.
- **Posters, banners or network logos missing.** `/images/*` (show art) or `/cache/*` (recommended-shows art) aren't routed to the backend.
- **404 on hard refresh or deep links (e.g. `/settings/search`).** Your static file server lacks an SPA fallback to `index.html`. See `nginx.conf` in this repo for a working example (`try_files $uri $uri/ /index.html`).
- **Blank page under a path prefix.** The UI assumes it is served at the domain root; Medusa's `web_root` option and sub-path deployments (`example.com/medusa/`) are not supported. Use a dedicated (sub)domain.

## Tech stack

- **Framework**: React 19 with TypeScript
- **Build**: Vite
- **Styling**: Tailwind CSS v4 + DaisyUI v5
- **Data**: TanStack Query (server state), WebSocket (live push)
- **Routing**: React Router 7 (lazy-loaded routes)
- **Auth**: JWT with silent refresh + legacy cookie for WebSocket
- **Linting**: typescript-eslint, react-hooks, react-refresh

## Project conventions

- Package manager is **pnpm** (pinned via `packageManager`; Corepack picks it up)
- `.npmrc` enforces `minimum-release-age=10080` and `engine-strict=true`
- Settings pages use `useDraftConfig<T>({ section })` from `lib/useDraftConfig.ts`
- Destructive actions use `ConfirmDialog` with `variant="danger"`
- Toasts use `lib/toasts.ts` (sonner wrapper)
- External stores subscribe via `useSyncExternalStore`
- Filter `setSearchParams` always uses `{ replace: true }`

## Related

- Backend: https://github.com/pymedusa/Medusa
