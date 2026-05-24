import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  Inbox,
  Languages,
  Lightbulb,
  Play,
  TriangleAlert,
} from "lucide-react";
import api, { getAssetUrl } from "../../lib/api";
import ConfirmDialog from "../../components/ConfirmDialog";
import { pushToast } from "../../lib/toasts";
import type { ConfigSubtitles } from "../../types/config";

// -----------------------------------------------------------------------------
// Backend response from GET /api/v2/internal/getSubtitleMissed
// -----------------------------------------------------------------------------

interface MissingEpisode {
  episode: number;
  season: number;
  slug: string; // "s01e01"
  name: string;
  subtitles: string[]; // language codes already on disk
}

interface MissingShow {
  slug: string;
  name: string;
  episodes: MissingEpisode[];
}

// Backend keys responses by showSlug. We flatten to an array client-side.
type MissingResponse = Record<string, MissingShow>;

// "all" matches the backend sentinel for "any of the user's wanted languages"
// (internal.py:633). A 3-letter code (e.g. "eng") narrows to just that one.
const LANG_ALL = "all";

// -----------------------------------------------------------------------------
// Preview fixtures — rendered when `?preview=1` is on the URL. Lets us design
// and screenshot the page without a populated library. Mutations are gated
// to be no-ops in preview mode.
// -----------------------------------------------------------------------------

const PREVIEW_FIXTURES: MissingResponse = {
  tvdb81189: {
    slug: "tvdb81189",
    name: "Breaking Bad",
    episodes: [
      {
        episode: 1,
        season: 5,
        slug: "s05e01",
        name: "Live Free or Die",
        subtitles: ["eng"],
      },
      {
        episode: 2,
        season: 5,
        slug: "s05e02",
        name: "Madrigal",
        subtitles: [],
      },
    ],
  },
  tvdb121361: {
    slug: "tvdb121361",
    name: "Game of Thrones",
    episodes: [
      {
        episode: 7,
        season: 1,
        slug: "s01e07",
        name: "You Win or You Die",
        subtitles: ["eng"],
      },
      {
        episode: 8,
        season: 1,
        slug: "s01e08",
        name: "The Pointy End",
        subtitles: [],
      },
      {
        episode: 9,
        season: 1,
        slug: "s01e09",
        name: "Baelor",
        subtitles: ["spa"],
      },
    ],
  },
  tvdb73762: {
    slug: "tvdb73762",
    name: "The Wire",
    episodes: [
      {
        episode: 1,
        season: 4,
        slug: "s04e01",
        name: "Boys of Summer",
        subtitles: [],
      },
    ],
  },
};

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

export default function MissingSubtitles() {
  const [searchParams, setSearchParams] = useSearchParams();
  const preview = searchParams.get("preview") === "1";
  const language = searchParams.get("lang") ?? LANG_ALL;

  const setLanguage = (next: string) => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === LANG_ALL) p.delete("lang");
        else p.set("lang", next);
        return p;
      },
      { replace: true },
    );
  };

  // Wanted-languages dropdown + `enabled` toggle drive the page. We need this
  // even in preview mode so the dropdown has something to render.
  const subtitlesCfgQ = useQuery({
    queryKey: ["config", "subtitles"],
    queryFn: ({ signal }) =>
      api
        .get<ConfigSubtitles>("/config/subtitles", { signal })
        .then((r) => r.data),
    staleTime: 60_000,
  });
  const subtitlesEnabled = subtitlesCfgQ.data?.enabled ?? true;
  const wantedLanguages = subtitlesCfgQ.data?.wantedLanguages ?? [];

  const missingQ = useQuery({
    queryKey: ["missing-subtitles", language] as const,
    queryFn: ({ signal }) =>
      api
        .get<MissingResponse>("/internal/getSubtitleMissed", {
          signal,
          params: { language },
        })
        .then((r) => r.data),
    enabled: !preview && subtitlesEnabled,
    staleTime: 30_000,
  });

  // Flatten response to array + alphabetical sort. In preview mode swap the
  // server data for fixtures, but otherwise treat the path identically.
  const shows = useMemo(() => {
    const map = preview ? PREVIEW_FIXTURES : (missingQ.data ?? {});
    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  }, [preview, missingQ.data]);

  const totals = useMemo(
    () => ({
      shows: shows.length,
      episodes: shows.reduce((sum, s) => sum + s.episodes.length, 0),
    }),
    [shows],
  );

  // Library-wide search action — gated behind a confirm because hitting a few
  // hundred releases against multiple subtitle providers can be slow.
  const [confirmAll, setConfirmAll] = useState(false);
  const searchAll = useMutation({
    mutationFn: async () => {
      if (preview) return;
      const payload = {
        language,
        shows: shows.map((s) => ({
          slug: s.slug,
          episodes: s.episodes.map((e) => e.slug),
        })),
      };
      await api.post("/internal/searchMissingSubtitles", payload);
    },
    onSuccess: () => {
      setConfirmAll(false);
      pushToast({
        title: "Subtitle search queued for every missing episode",
        body: "Results land in History as they're downloaded.",
        type: "notice",
      });
    },
    onError: () => {
      pushToast({
        title: "Couldn't queue the search",
        body: "Check the server logs.",
        type: "error",
      });
    },
  });

  const langLabel = (code: string): string => {
    if (code === LANG_ALL) return "All wanted languages";
    return (
      wantedLanguages.find((l) => l.id === code)?.name ?? code.toUpperCase()
    );
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center gap-2">
        <Link to="/manage" className="btn btn-ghost btn-sm gap-1">
          <ChevronLeft size={16} /> Manage
        </Link>
      </div>

      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Missing subtitles</h1>
        <p className="text-sm text-base-content/60">
          Episodes that are downloaded, on disk and set to download subtitles
          but missing one or more of your configured subtitle languages. Run a
          search per show or library-wide; Medusa queries every enabled subtitle
          provider and drops matching subs alongside the video.
        </p>
      </header>

      {preview && (
        <div className="alert alert-soft alert-info text-xs py-2">
          <Lightbulb size={14} />
          <span>
            Preview mode: showing {totals.episodes} fake episodes across{" "}
            {totals.shows} shows. Drop <code>?preview=1</code> from the URL to
            load real data.
          </span>
        </div>
      )}

      {!preview && !subtitlesEnabled && (
        <div className="alert alert-soft alert-warning text-sm">
          <TriangleAlert size={14} />
          <span>
            Subtitles are turned off in{" "}
            <Link
              to="/settings/subtitles"
              className="link link-hover font-medium"
            >
              Subtitle settings
            </Link>
            . Enable them and pick at least one language to populate this page.
          </span>
        </div>
      )}

      <div className="flex items-end justify-between gap-3 flex-wrap">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-base-content/60">Language</span>
          <select
            className="select select-sm"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            disabled={!preview && !subtitlesEnabled}
          >
            <option value={LANG_ALL}>{langLabel(LANG_ALL)}</option>
            {wantedLanguages.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="btn btn-sm gap-1"
          onClick={() => setConfirmAll(true)}
          disabled={
            searchAll.isPending ||
            shows.length === 0 ||
            (!preview && !subtitlesEnabled)
          }
          title="Queue a subtitle search for every missing episode"
        >
          <Play size={14} />
          {searchAll.isPending ? "Queueing…" : "Search all missing"}
        </button>
      </div>

      {!preview && missingQ.isLoading && subtitlesEnabled && (
        <div className="flex justify-center py-16">
          <span className="loading loading-spinner loading-lg" />
        </div>
      )}

      {!preview && missingQ.isError && (
        <div className="alert alert-soft alert-error text-sm">
          <TriangleAlert size={14} />
          Couldn't load missing subtitles. Check the server logs.
        </div>
      )}

      {!missingQ.isLoading && subtitlesEnabled && totals.episodes > 0 && (
        <div className="text-sm text-base-content/60">
          <strong className="text-base-content">{totals.episodes}</strong>{" "}
          episode{totals.episodes === 1 ? "" : "s"} missing{" "}
          <strong className="text-base-content">
            {langLabel(language).toLowerCase()}
          </strong>{" "}
          across {totals.shows} show{totals.shows === 1 ? "" : "s"}
        </div>
      )}

      {!preview && subtitlesEnabled && missingQ.data && shows.length === 0 && (
        <div className="text-center py-16 text-base-content/50 space-y-2">
          <Inbox size={32} className="mx-auto opacity-40" />
          <div>Every downloaded episode has the subtitles it needs.</div>
        </div>
      )}

      {shows.map((show) => (
        <ShowSection
          key={show.slug}
          show={show}
          language={language}
          preview={preview}
        />
      ))}

      <ConfirmDialog
        open={confirmAll}
        title="Search subtitles for every show?"
        body={
          <>
            <p>
              This queues a subtitle search across{" "}
              <strong>{totals.episodes}</strong> episode
              {totals.episodes === 1 ? "" : "s"} for{" "}
              <strong>{langLabel(language).toLowerCase()}</strong>. Depending on
              how many providers you have enabled, it can take several minutes
              and burn through provider rate limits.
            </p>
            <p className="mt-2">
              The scheduled subtitle finder also runs on its own interval
              configured in{" "}
              <Link
                to="/settings/subtitles"
                className="link link-hover text-primary-content font-semibold"
              >
                Subtitle settings
              </Link>
              . Manual runs are useful after you add languages or fix a
              provider, but not as routine.
            </p>
          </>
        }
        confirmLabel="Search all missing"
        variant="normal"
        onConfirm={() => searchAll.mutate()}
        onClose={() => setConfirmAll(false)}
      />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Per-show section
// -----------------------------------------------------------------------------

function ShowSection({
  show,
  language,
  preview,
}: {
  show: MissingShow;
  language: string;
  preview: boolean;
}) {
  const searchShow = useMutation({
    mutationFn: async () => {
      if (preview) return;
      await api.post("/internal/searchMissingSubtitles", {
        language,
        shows: [
          {
            slug: show.slug,
            episodes: show.episodes.map((e) => e.slug),
          },
        ],
      });
    },
    onSuccess: () => {
      pushToast({
        title: `Subtitle search queued for ${show.name}`,
        body: `${show.episodes.length} episode${show.episodes.length === 1 ? "" : "s"} — results land in History as they're downloaded.`,
        type: "notice",
      });
    },
    onError: () => {
      pushToast({
        title: "Couldn't queue the search",
        body: "Check the server logs.",
        type: "error",
      });
    },
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
          <div className="text-xs text-base-content/60 mt-0.5">
            {show.episodes.length} missing
          </div>
        </div>
        <button
          type="button"
          className="btn btn-sm gap-1"
          onClick={() => searchShow.mutate()}
          disabled={searchShow.isPending}
          title="Search subtitles for every missing episode in this show"
        >
          <Languages size={14} />
          {searchShow.isPending ? "Queueing…" : "Search missing"}
        </button>
      </header>

      <ul className="divide-y divide-base-300/60">
        {show.episodes.map((ep) => (
          <li
            key={ep.slug}
            className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-base-200/40"
          >
            <span className="font-mono text-xs text-base-content/70 w-14 shrink-0">
              {ep.slug}
            </span>
            <span className="flex-1 truncate" title={ep.name}>
              {ep.name}
            </span>
            <div className="flex items-center gap-1 flex-wrap">
              {ep.subtitles.length > 0 ? (
                ep.subtitles.map((code) => (
                  <span key={code} className="badge badge-xs badge-ghost">
                    {code}
                  </span>
                ))
              ) : (
                <span className="badge badge-xs badge-warning">no subs</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
