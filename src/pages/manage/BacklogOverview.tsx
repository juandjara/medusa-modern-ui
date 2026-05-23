import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowUpCircle,
  ChevronLeft,
  Inbox,
  Lightbulb,
  Play,
  Search,
  TriangleAlert,
} from "lucide-react";
import api, { getAssetUrl } from "../../lib/api";
import EpisodeSearchModal from "../../components/EpisodeSearchModal";
import ConfirmDialog from "../../components/ConfirmDialog";
import type {
  EpisodeStatus,
  EpisodeStatusCode,
  QualityCode,
  QualityName,
} from "../../types/medusa";

// -----------------------------------------------------------------------------
// Backend response from GET /api/v2/internal/getEpisodeBacklog
// -----------------------------------------------------------------------------

// Category strings from medusa/common.py:Overview.overviewStrings —
// "wanted" = missing episode, "allowed" = downloaded but at a quality lower
// than the show's preferred list (a.k.a. "upgrade candidate").
type BacklogCategory = "wanted" | "allowed";

interface BacklogEpisode {
  status: EpisodeStatusCode;
  quality: QualityCode;
  season: number;
  episode: number;
  name: string;
  airdate: string; // ISO datetime, or empty string when unknown
  statusString: EpisodeStatus;
  qualityString: QualityName;
  manuallySearched: boolean;
  slug: string; // "s01e01" — used in PUT /search/backlog
}

interface BacklogShow {
  slug: string;
  name: string;
  // `quality` on a show is the allowed-quality bitmask, which can be OR-d
  // combinations of QualityCode values — so the literal type doesn't fit;
  // keep it as a plain number.
  quality: number;
  episodeCount: {
    wanted: number;
    allowed: number;
  };
  // Per-episode category lookup, keyed by episode.slug.
  category: Record<string, BacklogCategory>;
  episodes: BacklogEpisode[];
}

// -----------------------------------------------------------------------------
// Filter shape
// -----------------------------------------------------------------------------

const STATUS_OPTIONS = [
  { value: "all", label: "All (wanted + upgrades)" },
  { value: "wanted", label: "Wanted only" },
  { value: "quality", label: "Upgrade candidates only" },
] as const;
type StatusFilter = (typeof STATUS_OPTIONS)[number]["value"];

const PERIOD_OPTIONS = [
  { value: "all", label: "All time" },
  { value: "one_day", label: "Aired in last 24h" },
  { value: "three_days", label: "Aired in last 3 days" },
  { value: "one_week", label: "Aired in last 7 days" },
  { value: "one_month", label: "Aired in last 30 days" },
] as const;
type PeriodFilter = (typeof PERIOD_OPTIONS)[number]["value"];

function parseStatus(raw: string | null): StatusFilter {
  return STATUS_OPTIONS.some((o) => o.value === raw)
    ? (raw as StatusFilter)
    : "all";
}
function parsePeriod(raw: string | null): PeriodFilter {
  return PERIOD_OPTIONS.some((o) => o.value === raw)
    ? (raw as PeriodFilter)
    : "all";
}

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

export default function BacklogOverview() {
  const [searchParams, setSearchParams] = useSearchParams();
  const status = parseStatus(searchParams.get("status"));
  const period = parsePeriod(searchParams.get("period"));

  const setStatus = (next: StatusFilter) => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === "all") p.delete("status");
        else p.set("status", next);
        return p;
      },
      { replace: true },
    );
  };
  const setPeriod = (next: PeriodFilter) => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === "all") p.delete("period");
        else p.set("period", next);
        return p;
      },
      { replace: true },
    );
  };

  const backlogQ = useQuery({
    queryKey: ["backlog", status, period] as const,
    queryFn: ({ signal }) =>
      api
        .get<BacklogShow[]>("/internal/getEpisodeBacklog", {
          signal,
          params: { status, period },
        })
        .then((r) => r.data),
    staleTime: 30_000,
  });

  // Cross-show totals for the summary callout.
  const totals = useMemo(() => {
    const shows = backlogQ.data ?? [];
    let wantedEps = 0;
    let upgradeEps = 0;
    let wantedShows = 0;
    let upgradeShows = 0;
    for (const s of shows) {
      if (s.episodeCount.wanted > 0) wantedShows++;
      if (s.episodeCount.allowed > 0) upgradeShows++;
      wantedEps += s.episodeCount.wanted;
      upgradeEps += s.episodeCount.allowed;
    }
    return { wantedEps, upgradeEps, wantedShows, upgradeShows };
  }, [backlogQ.data]);

  // Sort shows by the most recently-aired episode in their backlog
  // (descending), so the shows most likely to have a new release worth
  // grabbing surface first. Episodes with empty airdate fall to the end.
  const sortedShows = useMemo(() => {
    const shows = backlogQ.data ?? [];
    const lastAired = (show: BacklogShow): number => {
      let max = Number.NEGATIVE_INFINITY;
      for (const ep of show.episodes) {
        if (!ep.airdate) continue;
        const t = Date.parse(ep.airdate);
        if (Number.isFinite(t) && t > max) max = t;
      }
      return max;
    };
    return [...shows].sort((a, b) => lastAired(b) - lastAired(a));
  }, [backlogQ.data]);

  // Per-row Manual search target (passed into EpisodeSearchModal).
  const [searchTarget, setSearchTarget] = useState<{
    seriesSlug: string;
    season: number;
    episode: number;
  } | null>(null);

  // Library-wide backlog action — gated behind a confirm because it can churn
  // for many minutes against every indexer.
  const [confirmAll, setConfirmAll] = useState(false);
  const runAllBacklog = useMutation({
    mutationFn: () => api.put("/search/backlog", {}),
    onSuccess: () => setConfirmAll(false),
  });

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center gap-2">
        <Link to="/manage" className="btn btn-ghost btn-sm gap-1">
          <ChevronLeft size={16} /> Manage
        </Link>
      </div>

      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Backlog overview</h1>
        <p className="text-sm text-base-content/60">
          A <strong>backlog search</strong> asks your search providers for
          episodes you should have but don't, episodes that are either missing
          entirely (wanted) or downloaded at a lower quality than what you have
          in your show settings (upgrade candidates). This page lists every
          backlog candidate across your library, and lets you trigger searches
          per show or library-wide. The case where you search for an upgraded
          quality is the one you can't easily see anywhere else.
        </p>
      </header>

      <div className="flex items-end justify-between gap-3 flex-wrap">
        <FilterBar
          status={status}
          period={period}
          onStatusChange={setStatus}
          onPeriodChange={setPeriod}
        />
        <button
          type="button"
          className="btn btn-sm gap-1"
          onClick={() => setConfirmAll(true)}
          disabled={runAllBacklog.isPending}
          title="Queue a backlog search across every non-paused show"
        >
          <Play size={14} />
          {runAllBacklog.isPending ? "Queueing…" : "Run backlog for all shows"}
        </button>
      </div>

      {runAllBacklog.isSuccess && (
        <div className="alert alert-soft alert-success text-sm py-2">
          Backlog search queued for every show. It will run in the background;
          new snatches will land on the History page as they're processed. See{" "}
          <Link to="/logs?tab=activity" className="link link-hover font-medium">
            activity logs
          </Link>{" "}
          for live progress.
        </div>
      )}

      <div className="alert alert-soft alert-info text-xs py-2">
        <Lightbulb size={14} />
        <span>
          <strong>Run backlog search</strong> queues one search per season, not
          per episode.<br></br> Each provider tries the season pack first when
          its <em>backlog search mode</em> is set to "Season packs only" in{" "}
          <Link
            to="/settings/providers"
            className="link link-hover font-semibold"
          >
            Search providers
          </Link>
          .
        </span>
      </div>

      {backlogQ.isLoading && (
        <div className="flex justify-center py-16">
          <span className="loading loading-spinner loading-lg" />
        </div>
      )}

      {backlogQ.isError && (
        <div className="alert alert-soft alert-error text-sm">
          <TriangleAlert size={14} />
          Couldn't load backlog. Check the server logs.
        </div>
      )}

      {!backlogQ.isLoading &&
        (totals.wantedEps > 0 || totals.upgradeEps > 0) && (
          <div className="text-sm text-base-content/60 flex flex-wrap items-center gap-x-4 gap-y-1">
            {totals.wantedEps > 0 && (
              <span>
                <strong className="text-base-content">
                  {totals.wantedEps}
                </strong>{" "}
                missing episode{totals.wantedEps === 1 ? "" : "s"} across{" "}
                {totals.wantedShows} show
                {totals.wantedShows === 1 ? "" : "s"}
              </span>
            )}
            {totals.upgradeEps > 0 && (
              <span className="inline-flex items-center gap-1">
                <ArrowUpCircle size={14} className="text-info" />
                <strong className="text-base-content">
                  {totals.upgradeEps}
                </strong>{" "}
                upgrade candidate{totals.upgradeEps === 1 ? "" : "s"} across{" "}
                {totals.upgradeShows} show
                {totals.upgradeShows === 1 ? "" : "s"}
              </span>
            )}
          </div>
        )}

      {backlogQ.data && backlogQ.data.length === 0 && (
        <div className="text-center py-16 text-base-content/50 space-y-2">
          <Inbox size={32} className="mx-auto opacity-40" />
          <div>Nothing in the backlog with these filters.</div>
          <div className="text-xs">Your library is up to date.</div>
        </div>
      )}

      {sortedShows.map((show) => (
        <ShowSection
          key={show.slug}
          show={show}
          onManualSearch={(season, episode) =>
            setSearchTarget({
              seriesSlug: show.slug,
              season,
              episode,
            })
          }
        />
      ))}

      {searchTarget && (
        <EpisodeSearchModal
          seriesSlug={searchTarget.seriesSlug}
          season={searchTarget.season}
          episode={searchTarget.episode}
          open={true}
          onClose={() => setSearchTarget(null)}
        />
      )}

      <ConfirmDialog
        open={confirmAll}
        title="Run backlog search for every show?"
        body={
          <>
            <p>
              This queues a backlog search across{" "}
              <strong>every non-paused show</strong> in your library. Depending
              on size, it can run for a long time and use a fair chunk of your
              indexer rate-limit budget and your machine resources.
            </p>
            <p className="mt-2">
              The scheduled backlog runs automatically on the interval
              configured in{" "}
              <Link
                to="/settings/search"
                className="link link-hover text-primary-content font-semibold"
              >
                Search settings
              </Link>
              . Manual runs are useful after tweaking quality profiles or adding
              several shows at once, but not as routine.
            </p>
          </>
        }
        confirmLabel="Run backlog for all shows"
        variant="normal"
        onConfirm={() => runAllBacklog.mutate()}
        onClose={() => setConfirmAll(false)}
      />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Filter bar
// -----------------------------------------------------------------------------

function FilterBar({
  status,
  period,
  onStatusChange,
  onPeriodChange,
}: {
  status: StatusFilter;
  period: PeriodFilter;
  onStatusChange: (s: StatusFilter) => void;
  onPeriodChange: (p: PeriodFilter) => void;
}) {
  return (
    <div className="flex flex-wrap gap-3 items-end">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs text-base-content/60">Status</span>
        <select
          className="select select-sm"
          value={status}
          onChange={(e) => onStatusChange(e.target.value as StatusFilter)}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs text-base-content/60">Period</span>
        <select
          className="select select-sm"
          value={period}
          onChange={(e) => onPeriodChange(e.target.value as PeriodFilter)}
        >
          {PERIOD_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Per-show section
// -----------------------------------------------------------------------------

function ShowSection({
  show,
  onManualSearch,
}: {
  show: BacklogShow;
  onManualSearch: (season: number, episode: number) => void;
}) {
  const forceBacklog = useMutation({
    mutationFn: () => api.put("/search/backlog", { showSlug: show.slug }),
  });

  return (
    <section className="card bg-base-100 border-2 border-base-300 rounded-box overflow-hidden">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-base-300">
        <img
          src={getAssetUrl(show.slug, "posterThumb")}
          alt=""
          className="w-8 h-12 object-cover rounded shrink-0 bg-base-300"
          onError={(e) => {
            e.currentTarget.style.visibility = "hidden";
          }}
        />
        <div className="flex-1 min-w-0">
          <Link
            to={`/show/${show.slug}`}
            className="font-semibold text-base hover:underline truncate block"
            title={show.name}
          >
            {show.name}
          </Link>
          <div className="text-xs text-base-content/60 inline-flex items-center gap-2 mt-0.5 flex-wrap">
            {show.episodeCount.wanted > 0 && (
              <span className="badge badge-xs badge-warning">
                {show.episodeCount.wanted} wanted
              </span>
            )}
            {show.episodeCount.allowed > 0 && (
              <span className="badge badge-xs badge-info gap-1">
                <ArrowUpCircle size={10} />
                {show.episodeCount.allowed} upgrade
                {show.episodeCount.allowed === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          className="btn btn-sm gap-1"
          onClick={() => forceBacklog.mutate()}
          disabled={forceBacklog.isPending}
          title="Queue a backlog search for this whole show"
        >
          <Play size={14} />
          {forceBacklog.isPending ? "Queueing…" : "Run backlog search"}
        </button>
      </header>

      {forceBacklog.isSuccess && (
        <div className="px-4 py-2 text-xs text-success bg-success/10">
          Backlog search queued for this show. See{" "}
          <Link to="/logs?tab=activity" className="link link-hover font-medium">
            activity logs
          </Link>{" "}
          for live progress.
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="table table-sm">
          <thead>
            <tr>
              <th className="whitespace-nowrap">Episode</th>
              <th>Title</th>
              <th className="whitespace-nowrap">Aired</th>
              <th>Quality</th>
              <th>Status</th>
              <th className="w-12"></th>
            </tr>
          </thead>
          <tbody>
            {show.episodes.map((ep) => (
              <EpisodeRow
                key={ep.slug}
                episode={ep}
                category={show.category[ep.slug]}
                onManualSearch={() => onManualSearch(ep.season, ep.episode)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// -----------------------------------------------------------------------------
// Per-episode row
// -----------------------------------------------------------------------------

function EpisodeRow({
  episode,
  category,
  onManualSearch,
}: {
  episode: BacklogEpisode;
  category: BacklogCategory | undefined;
  onManualSearch: () => void;
}) {
  const isUpgrade = category === "allowed";
  const airDate = episode.airdate
    ? new Date(episode.airdate).toLocaleDateString()
    : "—";

  return (
    <tr className={isUpgrade ? "bg-info/5" : ""}>
      <td className="whitespace-nowrap font-mono text-xs">
        S{String(episode.season).padStart(2, "0")}E
        {String(episode.episode).padStart(2, "0")}
      </td>
      <td className="text-sm max-w-md truncate" title={episode.name}>
        {episode.name || "—"}
      </td>
      <td className="whitespace-nowrap text-xs">{airDate}</td>
      <td className="whitespace-nowrap">
        <span
          className={`badge badge-xs ${
            isUpgrade ? "badge-info" : "badge-ghost"
          }`}
        >
          {episode.qualityString}
        </span>
        {isUpgrade && (
          <ArrowUpCircle
            size={12}
            className="inline-block ml-1 text-info"
            aria-label="Upgrade candidate"
          />
        )}
      </td>
      <td className="whitespace-nowrap">
        <span
          className={`badge badge-xs ${
            isUpgrade ? "badge-soft" : "badge-warning"
          }`}
          title={
            isUpgrade
              ? "Downloaded, but at a quality below what your show settings allow"
              : "Search will look for this on its next run"
          }
        >
          {isUpgrade ? "Upgrade" : episode.statusString}
        </span>
      </td>
      <td>
        <button
          type="button"
          className="btn btn-ghost btn-xs btn-square"
          onClick={onManualSearch}
          title="Manual search — pick a specific release"
        >
          <Search size={14} />
        </button>
      </td>
    </tr>
  );
}
