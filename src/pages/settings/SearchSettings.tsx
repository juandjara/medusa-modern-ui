import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import useDraftConfig from "../../lib/useDraftConfig";
import Field from "../../components/forms/Field";
import Toggle from "../../components/forms/Toggle";
import SaveBar from "../../components/forms/SaveBar";
import TagInput from "../../components/forms/TagInput";
import TagList from "../../components/forms/TagList";
import Section from "../../components/forms/Section";
import type { ConfigSearch } from "../../types/config";

const PROPERS_INTERVAL_OPTIONS = [
  { value: "15m", label: "Every 15 min" },
  { value: "45m", label: "Every 45 min" },
  { value: "90m", label: "Every 90 min" },
  { value: "4h", label: "Every 4 hours" },
  { value: "daily", label: "Every 24 hours" },
];

export default function SearchSettings() {
  const { saved, isLoading, get, set, dirty, save } =
    useDraftConfig<ConfigSearch>({ section: "search" });

  if (isLoading || !saved) {
    return (
      <div className="flex justify-center py-20">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-2">
        <Link to="/settings" className="btn btn-ghost btn-sm gap-1">
          <ChevronLeft size={16} /> Settings
        </Link>
      </div>

      <header>
        <h1 className="text-2xl font-bold">Search settings</h1>
        <p className="text-sm text-base-content/60 mt-1">
          When Medusa searches, how often it runs, what release names it
          accepts, and what to do with failures. Provider-specific config lives
          in{" "}
          <Link
            to="/settings/providers"
            className="link link-hover text-primary"
          >
            Search providers
          </Link>
          .
        </p>
      </header>

      <SaveBar
        dirty={dirty}
        pending={save.isPending}
        success={save.isSuccess}
        error={save.isError}
        onSave={() => save.mutate()}
      />

      <ScheduleSection
        get={get}
        set={set}
        minBacklog={saved.general.minBacklogFrequency}
        minDaily={saved.general.minDailySearchFrequency}
      />
      <PropersSection get={get} set={set} />
      <CacheSection get={get} set={set} />
      <BehaviorSection get={get} set={set} />
      <FailedSection get={get} set={set} />
      <FiltersSection get={get} set={set} />
      <SubtitleFiltersSection get={get} set={set} />
      <TrackersSection get={get} set={set} />
    </div>
  );
}

type Getter = <T>(path: string) => T;
type Setter = (path: string, value: unknown) => void;

function ScheduleSection({
  get,
  set,
  minBacklog,
  minDaily,
}: {
  get: Getter;
  set: Setter;
  minBacklog: number;
  minDaily: number;
}) {
  return (
    <Section
      title="Search schedule"
      hint="How often the scheduled searchers wake up and how far back they look."
    >
      <Field
        label={`Daily-search frequency (minutes, ≥ ${minDaily})`}
        hint="How often Medusa scans providers for newly-aired episodes."
      >
        <input
          type="number"
          min={minDaily}
          className="input input-sm w-32"
          value={get<number>("general.dailySearchFrequency") ?? minDaily}
          onChange={(e) =>
            set("general.dailySearchFrequency", Number(e.target.value))
          }
        />
      </Field>
      <Field
        label={`Backlog frequency (minutes, ≥ ${minBacklog})`}
        hint="How often the backlog scheduler scans for missing episodes that aren't covered by the daily search."
      >
        <input
          type="number"
          min={minBacklog}
          className="input input-sm w-32"
          value={get<number>("general.backlogFrequency") ?? minBacklog}
          onChange={(e) =>
            set("general.backlogFrequency", Number(e.target.value))
          }
        />
      </Field>
      <Field
        label="Backlog look-back (days)"
        hint="When the backlog scheduler runs, search for episodes that aired within this many days into the past."
      >
        <input
          type="number"
          min={0}
          className="input input-sm w-32"
          value={get<number>("general.backlogDays") ?? 7}
          onChange={(e) => set("general.backlogDays", Number(e.target.value))}
        />
      </Field>
      <Field
        label="Usenet retention (days)"
        hint="Don't consider NZB results older than this — providers can't retrieve them anyway. Default 500."
      >
        <input
          type="number"
          min={1}
          className="input input-sm w-32"
          value={get<number>("general.usenetRetention") ?? 500}
          onChange={(e) =>
            set("general.usenetRetention", Number(e.target.value))
          }
        />
      </Field>
    </Section>
  );
}

function PropersSection({ get, set }: { get: Getter; set: Setter }) {
  const enabled = !!get<boolean>("general.downloadPropers");
  return (
    <Section
      title="Propers"
      hint="A 'proper' / 'repack' is a re-release that fixes the original release. Medusa can scan for these separately and replace an existing snatch."
    >
      <Toggle
        label="Download propers / repacks"
        hint="Look for proper/repack releases of episodes you already have and upgrade if found."
        checked={enabled}
        onChange={(v) => set("general.downloadPropers", v)}
      />

      {enabled && (
        <>
          <Field
            label="Check interval"
            hint="How often the proper-finder scheduler runs."
          >
            <select
              className="select select-sm w-40"
              value={get<string>("general.checkPropersInterval") ?? "daily"}
              onChange={(e) =>
                set("general.checkPropersInterval", e.target.value)
              }
            >
              {PROPERS_INTERVAL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Look-back window (days)"
            hint="Only consider propers for episodes that aired within this many days. 0 = no limit."
          >
            <input
              type="number"
              min={0}
              className="input input-sm w-32"
              value={get<number>("general.propersSearchDays") ?? 2}
              onChange={(e) =>
                set("general.propersSearchDays", Number(e.target.value))
              }
            />
          </Field>
        </>
      )}
    </Section>
  );
}

function CacheSection({ get, set }: { get: Getter; set: Setter }) {
  const trim = !!get<boolean>("general.cacheTrimming");
  return (
    <Section
      title="Provider result cache"
      hint="Medusa caches each provider's release listings between searches so it doesn't refetch unchanged results."
    >
      <Toggle
        label="Trim provider cache"
        hint="Periodically delete cache entries older than the max age below. Keeps the cache.db file small."
        checked={trim}
        onChange={(v) => set("general.cacheTrimming", v)}
      />
      {trim && (
        <Field
          label="Max cache age (days)"
          hint="Cache entries older than this are dropped during trim. Default 30."
        >
          <input
            type="number"
            min={1}
            className="input input-sm w-32"
            value={get<number>("general.maxCacheAge") ?? 30}
            onChange={(e) => set("general.maxCacheAge", Number(e.target.value))}
          />
        </Field>
      )}
    </Section>
  );
}

function BehaviorSection({ get, set }: { get: Getter; set: Setter }) {
  return (
    <Section title="Search behavior">
      <Toggle
        label="Randomize provider order"
        hint="On each search, shuffle the provider list instead of always going in the configured order. Avoids one provider always seeing the request first."
        checked={!!get<boolean>("general.randomizeProviders")}
        onChange={(v) => set("general.randomizeProviders", v)}
      />
      <Toggle
        label="Allow high-priority snatches"
        hint="Manual-search snatches and proper snatches are flagged 'high priority' to the download client, so they jump the queue."
        checked={!!get<boolean>("general.allowHighPriority")}
        onChange={(v) => set("general.allowHighPriority", v)}
      />
      <Toggle
        label="Remove from client after post-processing"
        hint="Once a snatched torrent / NZB has been post-processed (and, for torrents, the seed action has fired), remove the entry from the download client."
        checked={!!get<boolean>("general.removeFromClient")}
        onChange={(v) => set("general.removeFromClient", v)}
      />
    </Section>
  );
}

function FailedSection({ get, set }: { get: Getter; set: Setter }) {
  const enabled = !!get<boolean>("general.failedDownloads.enabled");
  return (
    <Section
      title="Failed downloads"
      hint="When a snatch fails to post-process (e.g. corrupt file, wrong release), Medusa can record it and try a different one."
    >
      <Toggle
        label="Track failed downloads"
        hint="Log failed releases to failed.db. Once enabled, Medusa avoids re-snatching the same release and immediately searches for a different one."
        checked={enabled}
        onChange={(v) => set("general.failedDownloads.enabled", v)}
      />
      {enabled && (
        <Toggle
          label="Delete files of failed downloads"
          hint="When a release is marked failed, also delete its files from the post-process folder. Recommended unless you want to inspect what went wrong."
          checked={!!get<boolean>("general.failedDownloads.deleteFailed")}
          onChange={(v) => set("general.failedDownloads.deleteFailed", v)}
        />
      )}
    </Section>
  );
}

function FiltersSection({ get, set }: { get: Getter; set: Setter }) {
  return (
    <Section
      title="Release filters"
      hint="Word lists applied to every release name across every provider. Case-insensitive substring match. Per-show overrides live on the show settings page."
    >
      <Field
        label="Required words"
        hint="If set, only releases whose name contains at least one of these words will be considered."
      >
        <TagInput
          value={get<string[]>("filters.required") ?? []}
          onChange={(v) => set("filters.required", v)}
          placeholder="e.g. proper, repack, …"
        />
      </Field>
      <Field
        label="Preferred words"
        hint="Soft preference: releases matching one of these win quality ties. Doesn't filter — just nudges."
      >
        <TagInput
          value={get<string[]>("filters.preferred") ?? []}
          onChange={(v) => set("filters.preferred", v)}
          placeholder="e.g. RLSGROUP, internal, …"
        />
      </Field>
      <Field
        label="Undesired words"
        hint="Soft penalty: releases matching one of these lose quality ties. Still eligible, just last-resort."
      >
        <TagInput
          value={get<string[]>("filters.undesired") ?? []}
          onChange={(v) => set("filters.undesired", v)}
          placeholder="e.g. x265, hdr, …"
        />
      </Field>
      <Field
        label="Ignored words"
        hint="Hard filter: releases matching any of these words are rejected outright."
      >
        <TagInput
          value={get<string[]>("filters.ignored") ?? []}
          onChange={(v) => set("filters.ignored", v)}
          placeholder="e.g. xvid, cam, korean, …"
        />
      </Field>
    </Section>
  );
}

function SubtitleFiltersSection({ get, set }: { get: Getter; set: Setter }) {
  return (
    <Section
      title="Subtitle release filters"
      hint="Used by both the snatch decision and the subtitle finder. Marks releases as having embedded foreign subs you don't want."
    >
      <Field
        label="Ignored embedded-subtitle languages"
        hint="If a release name implies these subtitle languages are embedded, treat it as undesired. Two-letter codes or English names."
      >
        <TagInput
          value={get<string[]>("filters.ignoredSubsList") ?? []}
          onChange={(v) => set("filters.ignoredSubsList", v)}
          placeholder="e.g. de, fr, spanish, …"
        />
      </Field>
      <Toggle
        label="Ignore releases with unknown subtitle languages"
        hint="If a release advertises 'subs' or 'subbed' without specifying a language, treat it as if it carries an unwanted embedded sub."
        checked={!!get<boolean>("filters.ignoreUnknownSubs")}
        onChange={(v) => set("filters.ignoreUnknownSubs", v)}
      />
    </Section>
  );
}

function TrackersSection({ get, set }: { get: Getter; set: Setter }) {
  return (
    <Section
      title="Tracker URLs"
      hint="Extra trackers appended to torrent magnet URIs when building them from cache results."
    >
      <Field label="Default trackers list">
        <TagList
          value={get<string[]>("general.trackersList") ?? []}
          onChange={(v) => set("general.trackersList", v)}
          type="url"
          placeholder="udp://tracker.opentrackr.org:1337/announce"
        />
      </Field>
    </Section>
  );
}
