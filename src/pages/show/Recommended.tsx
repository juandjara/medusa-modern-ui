import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ExternalLink,
  RefreshCw,
  Sparkles,
  Star,
  TriangleAlert,
} from "lucide-react";
import api from "../../lib/api";
import {
  RECOMMENDED_SOURCES,
  type RecommendedCategories,
  type RecommendedShow,
} from "../../types/medusa";
import type { ConfigNotifiers } from "../../types/config";

// Generous page size because category filtering happens client-side; smaller
// pages can produce nearly-empty grids for niche subcategories. The backend
// reads from a local SQLite cache so serving 100 rows is no slower than 24.
const PAGE_SIZE = 100;

// Order matters — TVDB has the best metadata for most Western shows; TMDB is
// the strongest multilingual backup; TVmaze keeps live airing data; IMDb is
// last because its ids need string-prefix handling.
const ADD_INDEXER_PREFERENCE = ["tvdb", "tmdb", "tvmaze", "imdb"] as const;

// Resolve numeric source ids by slug from the canonical list.
// Keeps the EXTERNAL_* numbers in one place (types/medusa.ts).
const SOURCE_ID = Object.fromEntries(
  RECOMMENDED_SOURCES.map((s) => [s.slug, s.id]),
) as Record<SourceSlug, number>;

// Picks the best indexer+id we can deep-link AddShow with,
// using the same logic the slim UI applies in recommended-poster.vue.
// Returns null when no usable external is available;
// the caller falls back to a title-based search in that case.
function pickAddTarget(
  show: RecommendedShow,
): { slug: string; showId: number } | null {
  for (const slug of ADD_INDEXER_PREFERENCE) {
    const raw = show.externals?.[`${slug}_id`];
    if (raw == null) {
      continue;
    }

    const id =
      typeof raw === "string" ? parseInt(raw.replace(/^tt/, ""), 10) : raw;

    if (Number.isFinite(id) && id > 0) {
      return { slug, showId: id };
    }
  }
  // IMDb-source recommendations always carry their imdb id as the series id
  // even when externals don't repeat it.
  if (show.source === SOURCE_ID.imdb && show.seriesId > 0) {
    return { slug: "imdb", showId: show.seriesId };
  }
  return null;
}

type SourceSlug = (typeof RECOMMENDED_SOURCES)[number]["slug"];

export default function Recommended() {
  const [activeSource, setActiveSource] = useState<SourceSlug>("trakt");

  const categoriesQ = useQuery({
    queryKey: ["recommended", "categories"],
    queryFn: ({ signal }) =>
      api
        .get<RecommendedCategories>("/recommended/categories", { signal })
        .then((r) => r.data),
    staleTime: 5 * 60_000,
  });

  // Trakt's backend refresh worker silently no-ops when USE_TRAKT is off
  // (medusa/generic_update_queue.py:163), so we surface the gate to the user
  // instead of letting them keep clicking Refresh into the void. Same query
  // key as NotificationsSettings so the two share the cache.
  const notifiersQ = useQuery({
    queryKey: ["config", "notifiers"],
    queryFn: ({ signal }) =>
      api
        .get<ConfigNotifiers>("/config/notifiers", { signal })
        .then((r) => r.data),
    staleTime: 60_000,
  });
  const traktEnabled = !!notifiersQ.data?.trakt?.enabled;

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center gap-2">
        <Link to="/" className="btn btn-ghost btn-sm gap-1">
          <ChevronLeft size={16} /> Shows
        </Link>
      </div>

      <header className="space-y-1">
        <h1 className="text-2xl font-bold inline-flex items-center gap-2">
          <Sparkles size={22} /> Recommended shows
        </h1>
        <p className="text-sm text-base-content/60">
          Browse popular, trending, and anticipated shows from external sources
          and add them to your library.
        </p>
      </header>

      <SourceTabs active={activeSource} onChange={setActiveSource} />

      <SourceSection
        source={activeSource}
        categories={categoriesQ.data}
        categoriesLoading={categoriesQ.isLoading}
        traktEnabled={traktEnabled}
      />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Source tabs
// -----------------------------------------------------------------------------

function SourceTabs({
  active,
  onChange,
}: {
  active: SourceSlug;
  onChange: (s: SourceSlug) => void;
}) {
  return (
    <div role="tablist" className="tabs tabs-border">
      {RECOMMENDED_SOURCES.map((s) => (
        <button
          key={s.slug}
          type="button"
          role="tab"
          aria-selected={active === s.slug}
          className={`tab ${active === s.slug ? "tab-active" : ""}`}
          onClick={() => onChange(s.slug)}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

// -----------------------------------------------------------------------------
// One source's grid + controls
// -----------------------------------------------------------------------------

function SourceSection({
  source,
  categories,
  categoriesLoading,
  traktEnabled,
}: {
  source: SourceSlug;
  categories: RecommendedCategories | undefined;
  categoriesLoading: boolean;
  traktEnabled: boolean;
}) {
  // Trakt's refresh worker is gated on USE_TRAKT
  // surface that here so the user isn't left clicking Refresh into the void.
  const traktBlocked = source === "trakt" && !traktEnabled;
  const queryClient = useQueryClient();

  // Categories endpoint keys by stringified numeric source id;
  // look up via RECOMMENDED_SOURCES to map slug → id.
  const sourceId = RECOMMENDED_SOURCES.find((s) => s.slug === source)?.id;
  const availableCats = useMemo(() => {
    if (!categories || !sourceId) return [];
    return categories[String(sourceId)] ?? [];
  }, [categories, sourceId]);

  // Active sub-category. Default to the first available.
  const [category, setCategory] = useState<string | null>(null);
  const effectiveCategory = category ?? availableCats[0] ?? null;

  // Reset category when source changes (otherwise we'd hold a value that
  // doesn't belong to the new source).
  if (category && !availableCats.includes(category)) {
    setCategory(null);
  }

  const [page, setPage] = useState(1);

  // When source or category changes, restart pagination.
  const pageKey = `${source}:${effectiveCategory ?? ""}`;
  const [lastKey, setLastKey] = useState(pageKey);
  if (lastKey !== pageKey) {
    setLastKey(pageKey);
    setPage(1);
  }

  // GET /recommended/{source} returns *all* subcategories for the source.
  // There's no server-side `subcat` filter.
  // Pagination metadata lives on response headers (`X-Pagination-Total`, `X-Pagination-Count`)
  // so we capture both the items and the header-derived totals here
  // see medusa/server/api/v2/base.py:_paginate
  const showsQ = useQuery({
    queryKey: ["recommended", source, page] as const,
    queryFn: ({ signal }) =>
      api
        .get<RecommendedShow[]>(`/recommended/${source}`, {
          signal,
          params: { page, limit: PAGE_SIZE },
        })
        .then((r) => ({
          items: r.data,
          totalPages: Number(r.headers["x-pagination-total"]) || 1,
          totalItems: Number(r.headers["x-pagination-count"]) || r.data.length,
        })),
    // Recommended catalogues only change when the user explicitly refreshes
    // (POST below). Keep them around generously.
    staleTime: 60 * 60_000,
    // The backend can take a while when the cache is empty.
    // Trust the user's refresh button rather than aggressive retries.
    retry: false,
  });

  // POST /recommended/{source} kicks off a backend refresh of the source's catalogue.
  // It returns immediately; the new data is committed to the DB by a queue worker
  // and surfaces on the next GET. We invalidate aggressively
  // after a short delay rather than streaming progress.
  const refresh = useMutation({
    mutationFn: () => api.post(`/recommended/${source}`),
    onSuccess: () => {
      // Give the queue worker a moment to populate before refetching.
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["recommended", source] });
      }, 2_000);
    },
  });

  const shows = useMemo(() => {
    const items = showsQ.data?.items ?? [];
    if (!effectiveCategory) {
      return items;
    }
    return items.filter((s) => s.subcat === effectiveCategory);
  }, [showsQ.data, effectiveCategory]);

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        {availableCats.length > 0 && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-base-content/60">Category</span>
            <select
              className="select select-sm"
              value={effectiveCategory ?? ""}
              onChange={(e) => setCategory(e.target.value || null)}
            >
              {availableCats.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        )}

        <button
          type="button"
          className="btn btn-ghost btn-sm gap-1 ml-auto"
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending || traktBlocked}
          title={
            traktBlocked
              ? "Trakt is not configured — the refresh would be a no-op"
              : "Ask the backend to fetch a fresh copy of this source's catalogue"
          }
        >
          <RefreshCw
            size={14}
            className={refresh.isPending ? "animate-spin" : ""}
          />
          Refresh source
        </button>
      </div>

      {traktBlocked && (
        <div className="alert alert-soft alert-warning text-sm py-2">
          <TriangleAlert size={14} />
          <span>
            Trakt isn't enabled in your Notifications settings. The backend's
            refresh worker silently no-ops without it. Enable Trakt in the
            legacy UI (Notifications → Trakt) and come back — the React UI's
            Trakt section is on the way.
          </span>
        </div>
      )}

      {refresh.isSuccess && !traktBlocked && (
        <div className="alert alert-soft alert-info text-sm py-2">
          Refresh queued. Results will update once the backend finishes
          fetching.
        </div>
      )}

      {(categoriesLoading || showsQ.isLoading) && (
        <div className="flex justify-center py-16">
          <span className="loading loading-spinner loading-lg" />
        </div>
      )}

      {showsQ.isError && (
        <div className="alert alert-soft alert-error text-sm">
          <TriangleAlert size={14} />
          Couldn't load recommendations from {source}. Try the refresh button,
          or check the backend logs.
        </div>
      )}

      {!showsQ.isLoading && !showsQ.isError && shows.length === 0 && (
        <div className="text-center py-16 text-base-content/50 space-y-3">
          <Sparkles className="mx-auto" size={32} />
          <div>
            <div>No recommendations cached for {source} yet.</div>
            <div className="text-xs">
              {traktBlocked
                ? "Enable Trakt in your Notifications settings before the refresh worker can populate this list."
                : 'Click "Refresh source" above to pull a fresh copy from upstream.'}
            </div>
          </div>
        </div>
      )}

      {shows.length > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {shows.map((show) => (
              <RecommendedCard
                key={`${show.source}-${show.seriesId}`}
                show={show}
              />
            ))}
          </div>
          <Paginator
            page={page}
            onPage={setPage}
            totalPages={showsQ.data?.totalPages ?? 1}
          />
        </>
      )}
    </section>
  );
}

// -----------------------------------------------------------------------------
// One poster card
// -----------------------------------------------------------------------------

function RecommendedCard({ show }: { show: RecommendedShow }) {
  const navigate = useNavigate();

  // Hand off to AddShow via URL params rather than location state. AddShow
  // runs its own search and (if `indexer`/`id` are present) auto-selects the
  // matching result — that way all fields on the resulting SearchResult
  // (including the `View on X` link) come from the canonical search endpoint
  // instead of being fabricated from the recommended payload.
  const target = pickAddTarget(show);
  const canAdd = !show.showInLibrary && !!show.title;

  const goAdd = () => {
    if (show.showInLibrary) return;
    const params = new URLSearchParams({ q: show.title });
    if (target) {
      params.set("indexer", target.slug);
      params.set("id", String(target.showId));
    }
    navigate(`/add?${params.toString()}`);
  };

  return (
    <div className="card card-sm bg-base-100 border-2 border-base-300 hover:border-accent transition-colors overflow-hidden">
      <figure className="aspect-2/3 bg-base-300 relative">
        {/* The backend serves cached posters under /cache/images/<source>/<file>.
            imageSrc is already a relative path like "cache/images/imdb/x.jpg" */}
        <img
          src={`/${show.imageSrc}`}
          alt={show.title}
          loading="lazy"
          className="object-cover h-full w-full"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
        {show.showInLibrary && (
          <span className="absolute top-1 right-1 badge badge-xs badge-success">
            In library
          </span>
        )}
      </figure>
      <div className="card-body p-3 space-y-1">
        <h3 className="card-title text-sm line-clamp-1" title={show.title}>
          {show.title}
        </h3>
        <div className="text-xs text-base-content/60 flex items-center gap-2 flex-wrap">
          {show.rating && (
            <span className="inline-flex items-center gap-0.5">
              <Star size={10} className="text-warning" /> {show.rating}
              {show.votes > 0 && (
                <span className="opacity-50">({formatVotes(show.votes)})</span>
              )}
            </span>
          )}
          {show.isAnime && (
            <span className="badge badge-xs badge-ghost">anime</span>
          )}
        </div>
        <div className="flex items-center gap-1 pt-1">
          {canAdd ? (
            <button
              type="button"
              className="btn btn-primary btn-xs flex-1"
              onClick={goAdd}
              title={
                target
                  ? `Add via ${target.slug.toUpperCase()} (#${target.showId})`
                  : "Search by name and pick from results"
              }
            >
              {target ? "Add" : "Search"}
            </button>
          ) : (
            <span
              className="btn btn-disabled btn-xs flex-1"
              title="Already in your library"
            >
              In library
            </span>
          )}
          <a
            href={show.imageHref}
            target="_blank"
            rel="noreferrer"
            className="btn btn-ghost btn-xs"
            title="Open on source site"
            aria-label={`Open ${show.title} on source site`}
          >
            <ExternalLink size={12} />
          </a>
        </div>
      </div>
    </div>
  );
}

function formatVotes(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(v);
}

// -----------------------------------------------------------------------------
// Pagination — backend reports total pages via the X-Pagination-Total header
// (captured in showsQ). Hides itself when there's only one page.
// -----------------------------------------------------------------------------

function Paginator({
  page,
  onPage,
  totalPages,
}: {
  page: number;
  onPage: (p: number) => void;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-2 pt-2">
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => onPage(page - 1)}
        disabled={page <= 1}
      >
        Previous
      </button>
      <span className="text-sm text-base-content/60 px-2">
        Page {page} of {totalPages}
      </span>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => onPage(page + 1)}
        disabled={page >= totalPages}
      >
        Next
      </button>
    </div>
  );
}
