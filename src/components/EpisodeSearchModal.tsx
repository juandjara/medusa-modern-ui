import { useCallback, useEffect, useMemo, useRef, useEffectEvent } from "react";
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
} from "lucide-react";
import api from "../lib/api";
import { formatBytes, formatRelative } from "../lib/time";
import {
  qualityName,
  type CachedRelease,
  type LiveQueueItem,
  type ProviderSummary,
} from "../types/medusa";

interface Props {
  seriesSlug: string;
  season: number;
  episode: number;
  open: boolean;
  onClose: () => void;
}

const LIVE_QUEUE_KEY = ["live-queue"] as const;

function epSlug(season: number, episode: number): string {
  return `s${String(season).padStart(2, "0")}e${String(episode).padStart(2, "0")}`;
}

export default function EpisodeSearchModal({
  seriesSlug,
  season,
  episode,
  open,
  onClose,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const queryClient = useQueryClient();

  // 1) Discover providers usable for manual search. Long-lived cache — the
  // provider list rarely changes during a session.
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

  // 2) Per-provider cached results. Fanned out via useQueries so each
  // provider has its own cache key and request lifecycle — one slow provider
  // doesn't block the others.
  const resultQueries = useQueries({
    queries: manualProviders.map((p) => ({
      queryKey: [
        "provider-results",
        p.id,
        seriesSlug,
        season,
        episode,
      ] as const,
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        try {
          const res = await api.get<CachedRelease[]>(
            `/providers/${p.id}/results`,
            {
              signal,
              params: {
                showslug: seriesSlug,
                season,
                episode,
                limit: 100,
              },
            },
          );
          return res.data;
        } catch (err) {
          // 404 = "Provider cache results not found" per providers.py. That's
          // a fine, expected state for an episode no one has searched yet.
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

  // Refetch every per-provider results query for this specific episode.
  // useCallback (not useEffectEvent) so it's safe to invoke from button
  // clicks as well as from effects below.
  const refetchAllResults = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ["provider-results"],
      predicate: (q) => {
        const k = q.queryKey as unknown[];
        return k[2] === seriesSlug && k[3] === season && k[4] === episode;
      },
    });
  }, [queryClient, seriesSlug, season, episode]);

  // 3) Re-run mutation. Kicks a fresh manual search via PUT /search/manual;
  // backend just queues the work and completion arrives over WS as a
  // QueueItemUpdate. The internal name stays `forceSearch` to match
  // PyMedusa's `forced_search_queue_scheduler` term.
  const forceSearch = useMutation({
    mutationFn: () =>
      api.put("/search/manual", {
        showSlug: seriesSlug,
        episodes: [epSlug(season, episode)],
      }),
  });

  // 4) Snatch mutation. The legacy `/home/pickManualSearch` route lives
  // outside /api/v2 — auth is the SECURE_TOKEN cookie set during login,
  // not the JWT — so we call it with a raw axios.get.
  //
  // Per-row status (pending / success / error) is derived from the
  // mutation's own state below — a single useMutation only remembers its
  // most recent call, so indicators on previously-snatched rows clear
  // when the user snatches another. The cached results refetch (via the
  // WS `completionKey` effect) eventually updates each row's release data
  // with the snatched outcome, so the visible state isn't lost.
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
  });

  // 5) WS-driven completion signals. We don't subscribe directly — Layout's
  // global handler upserts QueueItemUpdate items into the LIVE_QUEUE_KEY
  // cache. Reading the cache via useQuery gives us reactive completion.
  const { data: liveItems = [] } = useQuery<LiveQueueItem[]>({
    queryKey: LIVE_QUEUE_KEY,
    queryFn: () =>
      queryClient.getQueryData<LiveQueueItem[]>(LIVE_QUEUE_KEY) ?? [],
    staleTime: Infinity,
    enabled: open,
  });

  // Live queue items relevant to this episode — manual search or snatch.
  const relevantItems = useMemo(
    () =>
      liveItems.filter(
        (i) =>
          (i.name.startsWith("MANUAL-") || i.name.startsWith("SNATCH-")) &&
          (i.segment?.some(
            (s) => s.season === season && s.episode === episode,
          ) ??
            false),
      ),
    [liveItems, season, episode],
  );

  const liveManualSearch = relevantItems.find((i) =>
    i.name.startsWith("MANUAL-"),
  );

  // A live MANUAL- queue item is "active" until `success` flips from null
  // to a boolean. `inProgress` isn't a reliable signal here — PyMedusa
  // keeps it true through a successful completion in practice.
  const liveSearchActive =
    !!liveManualSearch && liveManualSearch.success == null;
  const searching = forceSearch.isPending || liveSearchActive;

  // Build a stable key from items that have completed in a way that means
  // our cached results should be refreshed. PyMedusa flips `success` from
  // null to a boolean when the queue item finishes, but doesn't reliably
  // flip `inProgress` back to false on successful completion — so we gate
  // on `success` only.
  //
  // For MANUAL- we refresh on any outcome (success or failure, so the user
  // sees an empty list and the error log). For SNATCH- we only refresh on
  // success — a failed snatch doesn't change the cached release data.
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

  // Auto-run the manual search when every provider's cache came back
  // empty. Matches upstream Vue: opening the modal on an episode no one
  // has searched yet shouldn't require the user to click "Re-run search".
  // Fires at most once per modal open — the ref resets on unmount because
  // SeasonAccordion conditionally renders the modal.
  const forceSearchMutate = forceSearch.mutate;
  const autoSearchedRef = useRef(false);
  useEffect(() => {
    if (autoSearchedRef.current) return;
    if (resultsLoading) return;
    if (manualProviders.length === 0) return;
    if (results.length > 0) return;
    if (liveSearchActive) return;
    autoSearchedRef.current = true;
    forceSearchMutate();
  }, [
    resultsLoading,
    manualProviders.length,
    results.length,
    liveSearchActive,
    forceSearchMutate,
  ]);

  // Wire the dialog element to the `open` prop.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  const handleNativeClose = useEffectEvent(() => onClose());
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const listener = () => handleNativeClose();
    dialog.addEventListener("close", listener);
    return () => dialog.removeEventListener("close", listener);
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      aria-labelledby="search-modal-title"
    >
      <div className="modal-box w-11/12 max-w-5xl">
        <header className="flex items-center justify-between gap-3 mb-3">
          <h3 id="search-modal-title" className="font-bold text-lg">
            Manual search · S{String(season).padStart(2, "0")}E
            {String(episode).padStart(2, "0")}
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
                  <td
                    colSpan={7}
                    className="text-center py-8 text-base-content/50 italic"
                  >
                    {searching
                      ? "Waiting for results…"
                      : "No cached results. Try Re-run search."}
                  </td>
                </tr>
              )}
              {results.map((r) => {
                // Per-row state derived from the snatch mutation's variables.
                // Only the most recent snatch shows a state; earlier rows
                // fall back to "idle" once another row is snatched.
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
                      <div
                        className="text-xs font-mono truncate"
                        title={r.release}
                      >
                        {r.release}
                      </div>
                      {r.seasonPack && (
                        <span className="badge badge-xs badge-ghost mt-0.5">
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
