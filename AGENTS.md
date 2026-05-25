# AGENTS.md

This file provides guidance to AI agents when working with code in this repository.

## Repository layout

This workspace is a **two-process rewrite of Medusa**: the existing Python/Tornado backend (`pymedusa/`) is kept as-is and a new React UI (`medusa-ui/`) is being built against its HTTP/WebSocket API. The two are coupled but live in independent git repos with their own toolchains. Always confirm which side a request lives on before editing.

- `pymedusa/` — upstream Medusa fork. Python 3.9–3.13 + Tornado web server. Manages shows, providers, downloads, post-processing, scheduling, notifications. Serves the API the new UI talks to. Default port `8081`.
- `medusa-ui/` — the React rewrite. Vite + React 19 + TS + Tailwind v4 + DaisyUI v5 + TanStack Query + React Router 7. Replaces the legacy `themes-default/slim` Vue UI for everything in `src/pages/`.
- `medusa-frontend-guide.md` — the *original* design doc. Scope drifted wider than the guide's "skipped" list as the rewrite filled in (see "Rewrite scope" below). Keep it for historical context; trust this file + the code for what's actually shipped.
- `pymedusa/themes-default/slim/` and `pymedusa/themes/{dark,light}/` — the legacy Vue frontend. Still exercised by CI (`node-frontend.yml`) but **not** part of the rewrite. Don't change it unless explicitly asked.

### Rewrite scope (current state)

The React UI is feature-complete against the audit list. What's covered:

- **Show surfaces**: Show list, Show detail (season accordion + episode actions), Show settings (location with file-move warning, paused, quality, default ep status, behavior, release filters, scene aliases viewer/CRUD, change indexer), Add show, Import shows, Recommended (per-source refresh).
- **Cross-cutting pages**: Schedule, History (live via `historyUpdate`), Queue (live via `QueueItemUpdate`), Logs (Activity + Errors + Warnings tabs, Activity is default), System (schedulers + backlog pause + scene-exception per-source freshness + disk space + maintenance), Post-process.
- **Manage** (`/manage/*`): Backlog overview, Episode statuses, Bulk shows (merged Mass Edit + Mass Update), Failed releases (`?preview=1`), Missing subtitles (`?preview=1`).
- **Settings** (`/settings/*`): General, Search, Providers (Prowlarr + Custom Newznab/Torznab/RSS), Download clients, Post-processing, Subtitles, Notifications (Kodi, Plex, Emby/Jellyfin, Synology, Pushbullet, Pushover, Telegram, Discord, Slack, Email, Trakt with device-code OAuth), Backup & restore.

Explicitly skipped (legacy parity, low value or genuinely out of scope): IRC, News, Changelog, Test rename, Anime config, multi-theme, Manage Searches (its gaps were folded into the System page), per-show "advanced search templates" CRUD.

Niche legacy notifiers not ported: Boxcar2, Pushalot, Growl, Prowl, libnotify, PyTivo.

## Commands

### Backend (`pymedusa/`)

Uses `uv` for dependency management; `setup.py test` (legacy) wraps pytest.

```bash
# Install deps (first time / after pyproject changes)
uv sync                                # or: uv add -r requirements.txt -r test_requirements.txt

# Run the server (data dir, port, etc. via flags; see medusa/__main__.py)
uv run python start.py                 # serves on http://localhost:8081 by default
uv run python start.py --port 8888 --nolaunch --datadir ./data

# Tests (matches CI in .github/workflows/python-backend.yml)
uv run python setup.py test -a "tests -vv --cov=medusa --cov-report=xml"
uv run pytest tests/test_helpers.py    # single file
uv run pytest tests/test_helpers.py::test_specific_thing   # single test
uv run pytest -k "scene_exceptions"    # by keyword

# Lint (flake8 with project rules in setup.cfg)
uv run python setup.py test -a "medusa --flake8"

# Tornado API contract tests (Dredd, against a running server on :8081)
yarn install && yarn test-api          # uses dredd/dredd.yml
```

### Frontend (`medusa-ui/`)

Package manager is **pnpm** (pinned via `packageManager` in `package.json`; Corepack picks it up automatically). `.npmrc` enforces `minimum-release-age=10080` (7d) for supply-chain hardening and `engine-strict=true` for version pinning. Don't shell out to `npm`/`yarn`.

```bash
cd medusa-ui
pnpm install
pnpm dev           # Vite dev server (proxies /api, /ws, /login, /logout, /token, /home, /errorlogs, /browser, /images, /config/* to localhost:8081 — see vite.config.ts)
pnpm build         # tsc -b && vite build → dist/
pnpm lint          # eslint with typescript-eslint + react-hooks/react-refresh
pnpm preview       # serve built dist/
```

For day-to-day work both must run together: backend on `:8081`, frontend on Vite's default `:5173`. If the backend listens on a different host/port, edit `SERVER_URL` in `medusa-ui/vite.config.ts`.

## Architecture you have to know to be productive

### The API surface

The frontend talks to **three different surfaces on the same backend**, and changes to any of them must respect all three:

1. **`/api/v2/*` — modern JSON API** (`pymedusa/medusa/server/api/v2/`). Each resource has a `*Handler` registered in `medusa/server/core.py` (`get_apiv2_handlers`). All handlers extend `BaseRequestHandler` (`v2/base.py`) which runs each request on a `ThreadPoolExecutor` and enforces JWT auth (`x-auth: Bearer <jwt>`). New UI features should go here.
2. **Legacy proxied endpoints** — `/login`, `/logout`, `/token`, `/home`, `/errorlogs`, `/browser`, `/config/general`, `/config/postProcessing`, `/images`. These are old Cheetah/Tornado handlers under `medusa/server/web/`. The UI still depends on them: `/login` sets the `SECURE_TOKEN` cookie that the WebSocket needs; `/token` is the JWT silent-refresh endpoint; `/images` serves cached art. Removing one will break the UI even if the v2 API looks fine.
3. **WebSocket `/ws/ui`** — `medusa/ws/handler.py` (`WebSocketUIHandler`). Uses `@authenticated` against the `SECURE_TOKEN` cookie, **not** the JWT. Messages are pushed via `ws.Message(event, data).push()` and arrive as `{ event, data }` JSON envelopes — the key is `event`, not `type`. The frontend hook `medusa-ui/src/lib/websocket.ts` is a module-singleton (one socket per tab, fan-out to N subscribers) with 5s reconnect while a JWT is in storage.

### WebSocket event names

Every event the backend can push, where it's emitted, and what the new UI currently does with it. When adding a feature that needs live updates, check this list first — most server-driven state changes already fire something, so reach for an existing event before inventing a new one.

| Event | Pushed from | Payload | UI subscribers |
|---|---|---|---|
| `QueueItemShow` | `queues/show_queue.py` (~15 sites) | show-queue item state — `{ identifier, name, step[], success, inProgress, show, oldShow?, newShow?, … }` | `Layout.tsx`, `lib/series-actions.ts`, `pages/Queue.tsx`, `pages/show/AddShow.tsx` |
| `QueueItemUpdate` | `process_tv.py`, `generic_update_queue.py`, `search/queue.py`, `subtitles.py` | generic queue item — `{ identifier, name, success, … }`. `name === 'Post Process'` filters to PP; the rest is search/snatch/subtitle/generic updates | `Layout.tsx` (drives the live-queue cache), `pages/Queue.tsx`, `pages/PostProcess.tsx` |
| `showAdded` | `queues/show_queue.py` (Add / ChangeIndexer paths) | `series.to_json(detailed=False)` | `Layout.tsx`, `pages/show/AddShow.tsx` |
| `showRemoved` | `queues/show_queue.py` | `old_show.to_json(detailed=False)` | `Layout.tsx` |
| `showUpdated` | `server/api/v2/series.py` | `series.to_json(detailed=False)` | *(none — `QueueItemShow` completion already invalidates `["series", slug]`)* |
| `episodeUpdated` | `tv/episode.py` | `episode.to_json()` | *(none — `QueueItemShow` completion already invalidates episode queries)* |
| `historyUpdate` | `history.py` (after each history-row insert) | one history row via `create_history_item` | `pages/History.tsx` (invalidates `["history"]` family on each push) |
| `notification` | `ui.py` | `Notification.data` (title/message/type/hash) | `Layout.tsx` → `lib/toasts.ts` (sonner, hash-deduped) |
| `configUpdated` | `server/api/v2/config.py` | `{ section, config }` diff after a PATCH | *(none — settings pages invalidate their own queries in the mutation's `onSuccess`)* |
| `addManualSearchResult` | `classes.py` (`SearchResult.to_json`) | one provider result; streamed during a manual episode search | `components/EpisodeSearchModal.tsx` (pushes into `["provider-results", …]` cache; completion REST refetch is the safety net) |

Notes:
- Event names are **case-sensitive** and **not consistent** (`QueueItemShow` vs `showAdded` vs `historyUpdate`). Match the existing casing exactly when pushing or subscribing — the dispatcher silently drops misspellings.
- The dispatcher is a flat key match (`handlers[event]?.(data)` in `websocket.ts:115`). There's no wildcard, no pattern, no namespace.
- If you push a brand-new event from the backend, the WS handler also buffers messages while no clients are connected — see the `backlogged_msgs` list in `ws/handler.py`. The buffer is currently disabled (`@TODO` in `ws/__init__.py:55`), so events emitted before the first client connects are dropped.

### Frontend dual-auth, dual-storage

`medusa-ui/src/lib/api.ts` is the only place that owns auth state. Important invariants when changing it:

- Tokens live in **either** `localStorage` (Remember me) **or** `sessionStorage` (default), never both. `writeToken` enforces this; reads prefer `localStorage`.
- Initial sign-in hits **both** `/api/v2/authenticate` (JWT in JSON body, controls `exp`) and the legacy `/login` (sets `SECURE_TOKEN` cookie for `/ws/ui` + legacy handlers). Dropping the legacy call breaks live updates.
- Silent refresh uses `GET /token`, gated by a module-level `refreshInFlight` promise so parallel 401s don't stampede. A `loggingOut` flag prevents in-flight requests from re-issuing a JWT after the user clicked Logout.
- `<img src>` can't send `Authorization`, so asset endpoints fall back to `?api_key=…` decoded from the JWT's `apiKey` claim (`getAssetUrl`). The api_key is cached in `sessionStorage`.
- All terminal 401s dispatch `AUTH_EXPIRED_EVENT`; `AuthProvider` listens and redirects to `/signin`.

### Frontend data layer

- **TanStack Query** is the only state for server data. The `QueryClient` in `main.tsx` sets `staleTime: 30s`, `gcTime: 5m`, `retry: 1`, `refetchOnWindowFocus: false` — don't paper over those defaults with per-query overrides unless there's a reason.
- **Don't add polling for settings/admin panels.** The user has been explicit: these views aren't kept open long enough to benefit. Use fetch-on-mount + a manual refresh button. Background sync, if needed, lives on the backend. (Same lens applies to dashboards.)
- Routes are declared once in `src/routes/index.tsx`; lazy-load anything that isn't the show list or first-paint surface (existing routes already do this).
- Component conventions: forms reuse the helpers in `src/components/forms/` (`Field`, `Section`, `SaveBar`, `Toggle`, `TagInput`, `SecretInput`, `FolderPicker`). Don't reinvent these.
- Settings pages use `useDraftConfig<T>({ section })` from `lib/useDraftConfig.ts` — it wraps the GET + PATCH + dirty/saved/error state and renders cleanly under `<SaveBar>`. Don't roll a separate form state manager for a new settings page; extend the hook if needed.
- Cross-file query-key constants live in `lib/queryKeys.ts` (`LIVE_QUEUE_KEY` is the canonical example). Local single-file keys stay co-located.
- Config section queries use `["config", <section>]` as their query key (e.g. `["config", "search"]` is shared by System.tsx for backlogDays and BacklogOverview.tsx for the backlog N-day limit display). The `useDraftConfig` hook also uses this convention internally.

### UI patterns that solidified

These are the conventions the rewrite settled on; deviating from them needs a reason.

- **Toasts via `lib/toasts.ts`** (`pushToast`) — a thin wrapper over [sonner](https://sonner.emilkowal.ski/). Mounted as `<Toaster>` in `Layout.tsx`. The `notification` WS event is its primary feed; in-app callers use it for fire-and-forget mutations whose success isn't otherwise visible (mass-update actions, snatch, season status flips, scene-alias add/delete, Trakt connect). Don't add toasts on settings saves — `<SaveBar>` already surfaces those inline.
- **`ConfirmDialog`** (`components/ConfirmDialog.tsx`) for any destructive op — Remove/Delete show, mark-as-failed, library-wide backlog search, restore from zip, change indexer, bulk shows Remove/Delete. Use `variant="danger"` for irreversible writes.
- **`?preview=1`** as a URL-driven fixture mode on pages that need a populated library to look right (`FailedReleases`, `MissingSubtitles`). Same render path as live data; mutations gate to no-ops; a top-of-page `alert-info` makes the mode obvious.
- **Filter `setSearchParams` always uses `{ replace: true }`** so filter flips don't pollute browser back history (Logs, History, AddShow, BacklogOverview, EpisodeStatuses, MissingSubtitles, BulkShows). Page-change navigations are the only ones that push.
- **Section cards** use `border-2 border-base-300 rounded-box` consistently. `border` (single-width) is reserved for one-off contexts like `ErrorFallback`.
- **Daisy v5 form layout** — no `form-control` (removed in v5). Use `flex flex-col gap-1 text-sm` + a `<span className="text-xs text-base-content/60">` label wrapping the input. Daisy v5 also renamed `tabs-boxed` → `tabs-box`.
- **Dialog wiring** — `<dialog ref={ref}>` controlled imperatively by a single `useEffect` syncing `open` ↔ `dialog.showModal()/close()`, and `onClose={onClose}` JSX prop for native close (ESC, backdrop). Don't add `addEventListener('close', …)` effects; the JSX prop is the simpler path.
- **External stores** subscribe via `useSyncExternalStore` (see `useWebSocketStatus` in `lib/websocket.ts`). Don't roll your own `useEffect` + `setState` subscription pattern — the React lint rule will reject it.
- **Match destructive action labels** in bulk surfaces to the per-show ones — `Remove from Medusa` / `Delete show & files` appear identically in `ShowActionsMenu`, BulkShows' Run-job dropdown, and confirmation dialogs.

### Backend things easy to get wrong

- **Three SQLite DBs**: `main.db` (shows/episodes/config), `cache.db`, `failed.db`. Schemas in `medusa/databases/{main_db,cache_db,failed_db,recommended_db}.py`. `DBConnection` (`medusa/db.py`) is a hand-rolled wrapper around `sqlite3` with per-file locks; don't reach for SQLAlchemy.
- **Provider system**: every torrent/NZB provider inherits `medusa/providers/generic_provider.py`. Prowlarr (`providers/prowlarr.py`) is the meta-provider that proxies to a user-configured Prowlarr instance. See the Prowlarr scope note below.
- **Naming/post-processing/search** are largely heuristic and rely on `guessit` (vendored in `lib/guessit/`). When changing parser behavior, run `tests/test_postprocessor_parse_info.py` and `tests/test_guessit.py`.
- **Backlog search N-day limit**: The "Backlog search all shows" button (`PUT /search/backlog {}`) is limited by `BACKLOG_DAYS` (default 7, configurable in Search settings). Per-show "Backlog search" (`PUT /search/backlog {showSlug}`) runs a full historical scan. The scheduler's normal cycle also runs full scans, but `BacklogSearcher.forced` is never reset to `False` after a forced run (see `medusa/search/backlog.py` — bug since `e252daad4`), so one forced run leaks into all subsequent scheduled cycles until server restart.
- **Parser `series_name` priority**: `series_name = guess.get('title') or guess.get('alias')` in `name_parser/parser.py:515`. `title` is guessit's canonical name (without year/country); `alias` includes disambiguation (e.g. "Show Name US"). Scene exceptions still work regardless because they're matched via the name cache (Tier 1) and `get_scene_exception_by_name()` fallback (Tier 3) in `helpers.get_show()`.
- A lot of Python files have **per-file flake8 suppressions** in `setup.cfg`'s `flake8-ignore`. Don't strip these without understanding why — many are working around docstring/naming rules in vendored or legacy modules.

### Prowlarr integration scope (project-specific constraint)

The Prowlarr settings panel in `medusa-ui` consumes **only `GET /api/v1/indexer`** (indexers the user has already configured in Prowlarr). Do **not** call `GET /api/v1/indexer/schema` and do **not** surface Prowlarr's full catalog (~600 definitions) anywhere. Configuring a brand-new indexer in Prowlarr requires per-indexer credentials/captchas and belongs in Prowlarr's own UI — Medusa acts purely as a consumer. The "Available" tab means "configured in Prowlarr, not yet imported to Medusa." Nothing else.

## Conventions

- **Python**: project follows flake8 with `flake8-import-order` (cryptography style), `flake8-quotes` (single inline, double docstrings), `flake8-docstrings`. Max line length 160. Don't change the import ordering scheme casually — pre-existing files rely on it.
- **TypeScript**: ESLint config is `typescript-eslint` recommended + `react-hooks` + `react-refresh/vite`. The codebase already uses React 19 features (`useEffectEvent` in `websocket.ts`) — assume React 19 idioms, not 18.
- **Commit/branch model on the backend**: `develop` is the base branch for upstream Medusa; `master` is release-only. PRs go off topic branches based on `develop`. The frontend repo is independent.
- **The legacy Vue UI in `themes-default/slim/` is still wired into CI** (`node-frontend.yml`). Don't accidentally break it; if you do touch it, run `yarn lint && yarn lint-css && yarn test` in that directory.
