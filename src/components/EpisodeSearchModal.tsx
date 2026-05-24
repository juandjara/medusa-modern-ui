import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import axios from "axios";
import {
  Download,
  RefreshCw,
  Zap,
  Check,
  X as XIcon,
  TriangleAlert,
  ExternalLink,
} from "lucide-react";
import api from "../lib/api";
import { useWebSocket } from "../lib/websocket";
import { pushToast } from "../lib/toasts";
import { formatBytes, formatRelative } from "../lib/time";
import { LIVE_QUEUE_KEY } from "../lib/queryKeys";
import {
  qualityName,
  type CachedRelease,
  type LiveQueueItem,
  type ProviderSummary,
} from "../types/medusa";

interface Props {
  seriesSlug: string;
  season: number;
  episode?: number;
  open: boolean;
  onClose: () => void;
}

function resolveInfoUrl(
  release: CachedRelease,
  provider: ProviderSummary | undefined,
): { href: string; kind: "release" | "home" } | null {
  if (release.infoUrl) return { href: release.infoUrl, kind: "release" };
  if (provider?.url) return { href: provider.url, kind: "home" };
  return null;
}

function epSlug(season: number, episode: number): string {
  return `s${String(season).padStart(2, "0")}e${String(episode).padStart(2, "0")}`;
}

function seasonSlug(season: number): string {
  return `s${String(season).padStart(2, "0")}`;
}

export default function EpisodeSearchModal({
  seriesSlug,
  season,
  episode,
  open,
  onClose,
}: Props) {
  const isSeasonSearch = episode === undefined;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const queryClient = useQueryClient();

  // 1) Manual-search-capable providers; cache is long-lived.
  const providersQ = useQuery({
    queryKey: ["providers"],
    queryFn: ({ signal }) =>
      api.get<ProviderSummary[]>("/providers", { signal }).then((r) => r.data),
    staleTime: 5 * 60_000,
    enabled: open,
  });

  const manualProviders = useMemo(
    () =>
      (providersQ.data ?? []).filter(
        (p) => p.config.enabled && p.config.search.manual.enabled,
      ),
    [providersQ.data],
  );

  // Lookup map for resolveInfoUrl — cached releases only carry provider id /
  // name / image, not the subType or home URL we need to build the link.
  const providersById = useMemo(() => {
    const map = new Map<string, ProviderSummary>();
    for (const p of providersQ.data ?? []) map.set(p.id, p);
    return map;
  }, [providersQ.data]);

  // 2) Per-provider cached results — fanned out so one slow provider doesn't
  // block the others.
  const resultQueries = useQueries({
    queries: manualProviders.map((p) => ({
      queryKey: isSeasonSearch
        ? (["provider-results", p.id, seriesSlug, season] as const)
        : (["provider-results", p.id, seriesSlug, season, episode] as const),
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        try {
          const params: Record<string, unknown> = {
            showslug: seriesSlug,
            season,
            limit: 100,
          };
          if (!isSeasonSearch) params.episode = episode;
          const res = await api.get<CachedRelease[]>(
            `/providers/${p.id}/results`,
            { signal, params },
          );
          return res.data;
        } catch (err) {
          // 404 = no cache yet for this episode; not an error.
          if (axios.isAxiosError(err) && err.response?.status === 404)
            return [];
          throw err;
        }
      },
      enabled: open,
      staleTime: 30_000,
    })),
  });

  const results = useMemo(() => {
    const all: CachedRelease[] = [];
    for (const q of resultQueries) {
      if (q.data) all.push(...q.data);
    }
    return all.sort(
      (a, b) =>
        b.quality - a.quality ||
        Math.max(b.seeders, 0) - Math.max(a.seeders, 0),
    );
  }, [resultQueries]);

  const resultsLoading =
    providersQ.isLoading || resultQueries.some((q) => q.isLoading);
  const resultsFetching = resultQueries.some((q) => q.isFetching);

  // useCallback (not useEffectEvent) so button clicks can call it too.
  const refetchAllResults = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ["provider-results"],
      predicate: (q) => {
        const k = q.queryKey as unknown[];
        if (k[2] !== seriesSlug || k[3] !== season) return false;
        return isSeasonSearch ? k.length === 4 : k[4] === episode;
      },
    });
  }, [queryClient, seriesSlug, season, episode, isSeasonSearch]);

  // 3) Re-run mutation. Variable name `forceSearch` matches Medusa's
  // `forced_search_queue_scheduler`; UI label is "Re-run search". Completion
  // arrives via the QueueItemUpdate WS event, not the HTTP response.
  const forceSearch = useMutation({
    mutationFn: () =>
      api.put(
        "/search/manual",
        isSeasonSearch
          ? { showSlug: seriesSlug, season: [seasonSlug(season)] }
          : { showSlug: seriesSlug, episodes: [epSlug(season, episode!)] },
      ),
  });

  // 4) Snatch. Legacy `/home/pickManualSearch` is outside /api/v2 — uses
  // the SECURE_TOKEN cookie, not the JWT, so we hit it with raw axios.
  const snatch = useMutation({
    mutationFn: async (release: CachedRelease) => {
      const res = await axios.get<{ result?: string }>(
        "/home/pickManualSearch",
        {
          params: {
            provider: release.provider.id,
            identifier: release.identifier,
          },
        },
      );
      if (res.data?.result !== "success") {
        throw new Error("pickManualSearch did not return success");
      }
      return release;
    },
    onSuccess: (release) => {
      pushToast({
        title: "Snatched",
        body: release.release,
        type: "notice",
      });
    },
    onError: () => {
      pushToast({
        title: "Couldn't snatch the release",
        body: "Check the server logs.",
        type: "error",
      });
    },
  });

  // 5) Streamed results via `addManualSearchResult` (classes.py:253).
  // Medusa pushes one event per cached result as providers respond, so the
  // user sees rows appear as the search round runs instead of waiting for the
  // queue item to finish. The completion refetch (below) still runs as a
  // safety net for any dropped events.
  useWebSocket({
    addManualSearchResult: (raw) => {
      if (!open) return;
      const r = raw as Partial<CachedRelease>;
      if (!r.identifier || !r.provider) return;
      if (r.showSlug !== seriesSlug) return;
      if (r.season !== season) return;
      // An empty `episodes` list signals a season pack — keep those; otherwise
      // require an explicit match on the open episode.
      if (
        !isSeasonSearch &&
        r.episodes &&
        r.episodes.length > 0 &&
        !r.episodes.includes(episode!)
      ) {
        return;
      }
      const key = isSeasonSearch
        ? (["provider-results", r.provider.id, seriesSlug, season] as const)
        : ([
            "provider-results",
            r.provider.id,
            seriesSlug,
            season,
            episode,
          ] as const);
      queryClient.setQueryData<CachedRelease[]>(key, (prev = []) => {
        if (prev.some((p) => p.identifier === r.identifier)) return prev;
        // The WS payload doesn't carry `infoUrl` (computed at REST time from
        // the provider's info_url template). Default to null; the completion
        // refetch fills it in.
        return [...prev, { infoUrl: null, ...r } as CachedRelease];
      });
    },
  });

  // 6) WS completion via Layout's live-queue cache (read-only here).
  const { data: liveItems = [] } = useQuery<LiveQueueItem[]>({
    queryKey: LIVE_QUEUE_KEY,
    queryFn: () =>
      queryClient.getQueryData<LiveQueueItem[]>(LIVE_QUEUE_KEY) ?? [],
    staleTime: Infinity,
    enabled: open,
  });

  // Live queue items relevant to this search — manual search or snatch.
  const relevantItems = useMemo(
    () =>
      liveItems.filter(
        (i) =>
          (i.name.startsWith("MANUAL-") || i.name.startsWith("SNATCH-")) &&
          (i.segment?.some(
            (s) =>
              s.season === season && (isSeasonSearch || s.episode === episode),
          ) ??
            false),
      ),
    [liveItems, season, episode, isSeasonSearch],
  );

  const liveManualSearch = relevantItems.find((i) =>
    i.name.startsWith("MANUAL-"),
  );

  // "Active" = success still null. `inProgress` is unreliable — Medusa
  // keeps it true through a successful completion.
  const liveSearchActive =
    !!liveManualSearch && liveManualSearch.success == null;
  const searching = forceSearch.isPending || liveSearchActive;

  // Stable key from finished items so refetch fires once per completion,
  // not per WS upsert. MANUAL- refreshes on any outcome (failure leaves an
  // empty list + a log entry); SNATCH- only on success.
  const completionKey = useMemo(
    () =>
      relevantItems
        .filter((i) =>
          i.name.startsWith("MANUAL-") ? i.success != null : i.success === true,
        )
        .map((i) => i.identifier)
        .sort()
        .join(","),
    [relevantItems],
  );

  useEffect(() => {
    if (!completionKey) return;
    refetchAllResults();
  }, [completionKey, refetchAllResults]);

  // Wire the dialog element to the `open` prop.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      aria-labelledby="search-modal-title"
      onClose={onClose}
    >
      <div className="modal-box w-11/12 max-w-5xl">
        <header className="flex items-center justify-between gap-3 mb-3">
          <h3 id="search-modal-title" className="font-bold text-lg">
            {isSeasonSearch
              ? `Season search · Season ${season === 0 ? "Specials" : season}`
              : `Episode search · S${String(season).padStart(2, "0")}E${String(episode!).padStart(2, "0")}`}
          </h3>
          <form method="dialog">
            <button
              type="submit"
              className="btn btn-ghost btn-sm btn-square"
              aria-label="Close"
            >
              <XIcon size={16} />
            </button>
          </form>
        </header>

        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <button
            type="button"
            className="btn btn-sm gap-2"
            onClick={() => refetchAllResults()}
            disabled={resultsFetching}
          >
            <RefreshCw
              size={14}
              className={resultsFetching ? "animate-spin" : ""}
            />
            Refresh
          </button>
          <button
            type="button"
            className="btn btn-sm btn-soft gap-2"
            onClick={() => forceSearch.mutate()}
            disabled={searching}
            title="Re-run the manual search against every provider and refresh the cache. Usually unnecessary — the cache shown here is populated automatically."
          >
            <Zap size={14} />
            Re-run search
          </button>

          <div className="text-xs text-base-content/60 ml-auto">
            {results.length} cached release
            {results.length === 1 ? "" : "s"} from {manualProviders.length}{" "}
            provider{manualProviders.length === 1 ? "" : "s"}
          </div>
        </div>

        {searching && (
          <div className="alert alert-soft alert-info text-sm mb-3">
            <RefreshCw size={14} className="animate-spin" />
            Searching providers… results will appear as they arrive.
          </div>
        )}

        {forceSearch.isError && (
          <div className="alert alert-soft alert-error text-sm mb-3">
            <TriangleAlert size={14} />
            Failed to queue the search.
          </div>
        )}

        {!providersQ.isLoading && manualProviders.length === 0 && (
          <div className="alert alert-soft alert-warning text-sm mb-3">
            <TriangleAlert size={14} />
            No providers have manual search enabled. Configure one in Settings →
            Providers.
          </div>
        )}

        <div className="overflow-x-auto rounded-box border-2 border-base-300">
          <table className="table table-zebra table-sm">
            <thead>
              <tr>
                <th className="w-32">Provider</th>
                <th>Release</th>
                <th className="w-32">Quality</th>
                <th className="w-20">Size</th>
                <th className="w-16">Seeds</th>
                <th className="w-24">Age</th>
                <th className="w-16"></th>
              </tr>
            </thead>
            <tbody>
              {resultsLoading && (
                <tr>
                  <td colSpan={7} className="text-center py-8">
                    <span className="loading loading-spinner loading-md" />
                  </td>
                </tr>
              )}
              {!resultsLoading && results.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-8">
                    {searching ? (
                      <span className="text-base-content/50 italic">
                        Waiting for results…
                      </span>
                    ) : (
                      <div>
                        <p className="text-base-content/50 italic mb-3">
                          {isSeasonSearch
                            ? "No releases saved for this season."
                            : "No releases saved for this episode."}
                        </p>
                        <button
                          type="button"
                          className="btn btn-soft gap-2"
                          onClick={() => forceSearch.mutate()}
                          disabled={searching}
                        >
                          <Zap size={14} />
                          Search for releases
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )}
              {results.map((r) => {
                // Only the latest snatch shows a per-row indicator; earlier
                // rows fall back to idle.
                const isLatest = snatch.variables?.identifier === r.identifier;
                const pending = isLatest && snatch.isPending;
                const success = isLatest && snatch.isSuccess;
                const failed = isLatest && snatch.isError;
                return (
                  <tr key={`${r.provider.id}-${r.identifier}`}>
                    <td>
                      <div
                        className="inline-flex items-center gap-1.5 truncate"
                        title={r.provider.name}
                      >
                        <img
                          src={`/images/providers/${r.provider.imageName}`}
                          alt=""
                          aria-hidden="true"
                          className="h-4 w-4 object-contain"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                        <span className="text-xs truncate">
                          {r.provider.name}
                        </span>
                      </div>
                    </td>
                    <td className="max-w-md">
                      <ReleaseName
                        release={r}
                        provider={providersById.get(r.provider.id)}
                      />
                      {r.seasonPack && (
                        <span className="badge badge-xs badge-ghost ml-0.5">
                          season pack
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap">
                      <span className="badge badge-sm badge-soft">
                        {qualityName(r.quality)}
                      </span>
                    </td>
                    <td className="text-xs whitespace-nowrap">
                      {formatBytes(r.size)}
                    </td>
                    <td className="text-xs">
                      {r.seeders < 0 ? "—" : r.seeders}
                    </td>
                    <td
                      className="text-xs whitespace-nowrap"
                      title={r.pubdate ?? r.dateAdded}
                    >
                      {formatRelative(r.pubdate ?? r.dateAdded)}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-xs btn-square btn-ghost"
                        title={
                          failed
                            ? "Snatch failed — click to retry"
                            : "Snatch this release"
                        }
                        onClick={() => snatch.mutate(r)}
                        disabled={pending || success}
                      >
                        {pending && (
                          <span className="loading loading-spinner loading-xs" />
                        )}
                        {success && (
                          <Check size={14} className="text-success" />
                        )}
                        {failed && (
                          <TriangleAlert size={14} className="text-error" />
                        )}
                        {!pending && !success && !failed && (
                          <Download size={14} />
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <form method="dialog" className="modal-backdrop">
        <button aria-label="Close dialog">close</button>
      </form>
    </dialog>
  );
}

function ReleaseName({
  release,
  provider,
}: {
  release: CachedRelease;
  provider: ProviderSummary | undefined;
}) {
  const info = resolveInfoUrl(release, provider);
  const baseCls =
    "max-w-full text-xs font-mono truncate inline-flex items-center gap-1";
  if (!info) {
    return (
      <div className={baseCls} title={release.release}>
        {release.release}
      </div>
    );
  }
  const tooltip =
    info.kind === "release"
      ? `${release.release}\nOpens release page on ${provider?.name ?? "indexer"}`
      : `${release.release}\nOpens ${provider?.name ?? "tracker"} home — find the release manually`;
  return (
    <a
      href={info.href}
      target="_blank"
      rel="noreferrer"
      className={`${baseCls} hover:text-primary hover:underline`}
      title={tooltip}
    >
      <span className="truncate">{release.release}</span>
      <ExternalLink size={10} className="shrink-0 opacity-60" />
    </a>
  );
}
