# Medusa Modern UI

A complete frontend rewrite of [Medusa](https://github.com/pymedusa/Medusa) — the automatic TV show library manager — replacing the legacy Vue 2 UI with React 19 + TypeScript. The Python/Tornado backend runs unchanged; this is a drop-in replacement for the frontend only.

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

Every major surface is implemented: Show list & detail, Add/Import shows, Schedule, History, Queue, Logs, Post-process, backlog management (Backlog overview, Episode statuses, Bulk shows, Failed releases, Missing subtitles), System panel (schedulers, disk space, maintenance), and all Settings pages (General, Search, Providers including Prowlarr, Download clients, Post-processing, Subtitles, Notifications, Backup & restore).

## How to run

You need a running [pymedusa](https://github.com/pymedusa/Medusa) instance to connect to. The default proxy target is `localhost:8081` — configure it in `vite.config.ts` if yours is elsewhere.

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

The frontend is published as `ghcr.io/juandjara/medusa-modern-ui:latest`. Pair it with a pymedusa container like this:

```yaml
services:
  pymedusa:
    build: /path/to/pymedusa
    container_name: pymedusa
    restart: unless-stopped
    ports:
      - 8081:8081
    volumes:
      - ./config:/config
    networks:
      - web

  pymedusa_ui:
    image: ghcr.io/juandjara/medusa-modern-ui:latest
    container_name: pymedusa_ui
    restart: unless-stopped
    networks:
      - web
```

Then run a reverse-proxy (e.g. Caddy) on the same network that routes:

- `/api/* /token /login /logout /images/* /cache/* /home/* /errorlogs/* /browser/* /config/* /ws/*` → `pymedusa:8081`
- Everything else → `pymedusa_ui:80`

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
