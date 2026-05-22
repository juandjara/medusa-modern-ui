import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronLeft,
  ExternalLink,
  GripVertical,
  TriangleAlert,
  X as XIcon,
} from "lucide-react";
import useDraftConfig from "../../lib/useDraftConfig";
import Field from "../../components/forms/Field";
import Toggle from "../../components/forms/Toggle";
import SaveBar from "../../components/forms/SaveBar";
import SecretInput from "../../components/forms/SecretInput";
import Section from "../../components/forms/Section";
import TagInput from "../../components/forms/TagInput";
import type { ConfigSubtitles, SubtitleService } from "../../types/config";

export default function SubtitlesSettings() {
  const { saved, isLoading, get, set, dirty, save } =
    useDraftConfig<ConfigSubtitles>({ section: "subtitles" });

  if (isLoading || !saved) {
    return (
      <div className="flex justify-center py-20">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  const enabled = !!get<boolean>("enabled");

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-2">
        <Link to="/settings" className="btn btn-ghost btn-sm gap-1">
          <ChevronLeft size={16} /> Settings
        </Link>
      </div>

      <header>
        <h1 className="text-2xl font-bold">Subtitles</h1>
        <p className="text-sm text-base-content/60 mt-1">
          Fetch subtitles from public providers (subliminal under the hood),
          pick languages, and tune the post-download behavior. Per-show subtitle
          toggles live on each show's own settings page.
        </p>
      </header>

      <SaveBar
        dirty={dirty}
        pending={save.isPending}
        success={save.isSuccess}
        error={save.isError}
        onSave={() => save.mutate()}
      />

      <Section title="Subtitle searching">
        <Toggle
          label="Enable subtitle search"
          hint="Master switch. When off, none of the schedule, provider, or behavior settings below apply."
          checked={enabled}
          onChange={(v) => set("enabled", v)}
        />

        {enabled && (
          <>
            <Toggle
              label="Stop searching at first match"
              hint="As soon as one provider returns a usable subtitle, stop querying the rest. Faster; trades best-quality for speed."
              checked={!!get<boolean>("stopAtFirst")}
              onChange={(v) => set("stopAtFirst", v)}
            />

            <Toggle
              label="Require a perfect release match"
              hint="Only accept subtitles whose release name exactly matches the episode file. Strict; useful with high-quality libraries, restrictive otherwise."
              checked={!!get<boolean>("perfectMatch")}
              onChange={(v) => set("perfectMatch", v)}
            />

            <Toggle
              label="Hearing-impaired subtitles allowed"
              hint="Accept HI/SDH variants when they're all that's available."
              checked={!!get<boolean>("hearingImpaired")}
              onChange={(v) => set("hearingImpaired", v)}
            />

            <Toggle
              label="Multi-language file naming"
              hint='Append the language code to the subtitle filename (e.g. "S01E01.en.srt"). Required if you fetch more than one language for the same episode.'
              checked={!!get<boolean>("multiLanguage")}
              onChange={(v) => set("multiLanguage", v)}
            />

            <Toggle
              label="Keep only wanted languages"
              hint="When subtitle files of other languages exist next to the video, delete them after each subtitle search. Aggressive; only use if you really mean it."
              checked={!!get<boolean>("keepOnlyWanted")}
              onChange={(v) => set("keepOnlyWanted", v)}
            />

            <Toggle
              label="Log subtitle history"
              hint="Write each subtitle-download attempt to the History page."
              checked={!!get<boolean>("logHistory")}
              onChange={(v) => set("logHistory", v)}
            />
          </>
        )}
      </Section>

      {enabled && <LanguageSection saved={saved} get={get} set={set} />}
      {enabled && <ProvidersSection saved={saved} set={set} />}
      {enabled && <EmbeddedSection get={get} set={set} />}
      {enabled && <ScheduleSection get={get} set={set} />}
      {enabled && <ScriptsSection get={get} set={set} />}
    </div>
  );
}

type Getter = <T>(path: string) => T;
type Setter = (path: string, value: unknown) => void;

// -----------------------------------------------------------------------------
// Languages
// -----------------------------------------------------------------------------

function LanguageSection({
  saved,
  get,
  set,
}: {
  saved: ConfigSubtitles;
  get: Getter;
  set: Setter;
}) {
  const codeFilter = saved.codeFilter;
  // Memoise the empty-array fallback to keep `codes` reference-stable so the
  // dependent useMemos don't recompute every render.
  const codes = useMemo(() => get<string[]>("languages") ?? [], [get]);

  const byId = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of codeFilter) m.set(l.id, l.name);
    return m;
  }, [codeFilter]);

  const remaining = useMemo(
    () => codeFilter.filter((l) => !codes.includes(l.id)),
    [codeFilter, codes],
  );

  const removeCode = (code: string) =>
    set(
      "languages",
      codes.filter((c) => c !== code),
    );

  const addCode = (code: string) => {
    if (!code || codes.includes(code)) return;
    set("languages", [...codes, code]);
  };

  return (
    <Section
      title="Languages"
      hint="What languages to fetch for each episode. Search order is determined by the provider list below, not the language order."
    >
      {codes.length === 0 ? (
        <p className="text-sm text-base-content/60">
          No languages selected yet. Pick one or more below.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {codes.map((code) => (
            <li key={code} className="badge badge-neutral gap-1 pl-2 pr-1 py-3">
              <span>{byId.get(code) ?? code}</span>
              <span className="opacity-50 text-xs">({code})</span>
              <button
                type="button"
                className="hover:text-error"
                onClick={() => removeCode(code)}
                aria-label={`Remove ${byId.get(code) ?? code}`}
              >
                <XIcon size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Field label="Add language">
        <select
          className="select select-sm w-full max-w-sm"
          value=""
          onChange={(e) => {
            addCode(e.target.value);
            // Reset so the same language can be picked again after removal.
            e.target.value = "";
          }}
        >
          <option value="" disabled>
            {remaining.length === 0
              ? "All available languages already added"
              : "Pick a language…"}
          </option>
          {remaining.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name} ({l.id})
            </option>
          ))}
        </select>
      </Field>
    </Section>
  );
}

// -----------------------------------------------------------------------------
// Providers — sortable list with per-provider credentials.
// -----------------------------------------------------------------------------

const CREDENTIALED_PROVIDERS = new Set([
  "addic7ed",
  "legendastv",
  "opensubtitles",
]);

function ProvidersSection({
  saved,
  set,
}: {
  saved: ConfigSubtitles;
  set: Setter;
}) {
  // Mirror the server's ordered list locally so drag/drop + toggle can mutate
  // it without round-tripping. On save we PATCH the whole array.
  const [list, setList] = useState<SubtitleService[] | null>(null);
  const ordered = list ?? saved.services;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const oldIdx = ordered.findIndex((p) => p.name === e.active.id);
    const newIdx = ordered.findIndex((p) => p.name === e.over!.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const next = arrayMove(ordered, oldIdx, newIdx);
    setList(next);
    set("services", next);
  };

  const setEnabled = (name: string, enabled: boolean) => {
    const next = ordered.map((p) => (p.name === name ? { ...p, enabled } : p));
    setList(next);
    set("services", next);
  };

  return (
    <Section
      title="Providers"
      hint="Drag to set the order subliminal tries them in. Top-most enabled provider is queried first."
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={ordered.map((p) => p.name)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="space-y-2">
            {ordered.map((p) => (
              <SortableProviderRow
                key={p.name}
                provider={p}
                onEnabledChange={(v) => setEnabled(p.name, v)}
                credentials={
                  CREDENTIALED_PROVIDERS.has(p.name)
                    ? (saved.providerLogins[
                        p.name as keyof ConfigSubtitles["providerLogins"]
                      ] ?? null)
                    : null
                }
                onCredChange={(field, value) =>
                  set(`providerLogins.${p.name}.${field}`, value)
                }
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </Section>
  );
}

function SortableProviderRow({
  provider,
  onEnabledChange,
  credentials,
  onCredChange,
}: {
  provider: SubtitleService;
  onEnabledChange: (v: boolean) => void;
  credentials: { user: string; pass: string } | null;
  onCredChange: (field: "user" | "pass", value: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: provider.name });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const showCreds = provider.enabled && credentials !== null;

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="rounded-box border bg-base-100 border-base-300"
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          className="btn btn-ghost btn-xs cursor-grab touch-none"
          {...attributes}
          {...listeners}
          title="Drag to reorder"
        >
          <GripVertical size={14} />
        </button>
        <input
          type="checkbox"
          className="checkbox checkbox-sm"
          checked={provider.enabled}
          onChange={(e) => onEnabledChange(e.target.checked)}
          aria-label={`Enable ${provider.name}`}
        />
        <img
          src={`/images/subtitles/${provider.image}`}
          alt=""
          className="w-4 h-4"
          onError={(e) => {
            e.currentTarget.style.visibility = "hidden";
          }}
        />
        <span className="font-medium flex-1 truncate">{provider.name}</span>
        <a
          href={provider.url}
          target="_blank"
          rel="noreferrer"
          className="text-base-content/40 hover:text-primary"
          aria-label={`Open ${provider.name} site`}
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink size={12} />
        </a>
      </div>
      {showCreds && credentials && (
        <div className="border-t border-base-300 px-3 py-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Username">
            <input
              className="input input-sm w-full"
              value={credentials.user}
              onChange={(e) => onCredChange("user", e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          <Field label="Password">
            <SecretInput
              value={credentials.pass}
              onChange={(v) => onCredChange("pass", v)}
            />
          </Field>
        </div>
      )}
    </li>
  );
}

// -----------------------------------------------------------------------------
// Embedded subs
// -----------------------------------------------------------------------------

function EmbeddedSection({ get, set }: { get: Getter; set: Setter }) {
  const ignore = !!get<boolean>("ignoreEmbeddedSubs");
  return (
    <Section
      title="Embedded subtitles"
      hint="How Medusa treats subtitle streams already inside the video container."
    >
      <Toggle
        label="Ignore embedded subtitles"
        hint="Pretend the file has no embedded subs, so a wanted language fetch fires even if the same language is already embedded in the file."
        checked={ignore}
        onChange={(v) => set("ignoreEmbeddedSubs", v)}
      />
      {!ignore && (
        <Toggle
          label="Accept unknown embedded subtitles"
          hint="When an embedded stream has no language tag, treat it as a match for any wanted language. Aggressive; saves a download when the embedded sub turns out to be the language you wanted, but can also skip needed subs entirely if the unknown stream is actually another language."
          checked={!!get<boolean>("acceptUnknownEmbeddedSubs")}
          onChange={(v) => set("acceptUnknownEmbeddedSubs", v)}
        />
      )}
    </Section>
  );
}

// -----------------------------------------------------------------------------
// Schedule + paths
// -----------------------------------------------------------------------------

function ScheduleSection({ get, set }: { get: Getter; set: Setter }) {
  return (
    <Section
      title="Schedule &amp; paths"
      hint="Where subtitles go and how often Medusa looks for missing ones."
    >
      <Field
        label="Subtitle drop directory"
        hint="Override the destination. Empty = save the subtitle next to the video file (recommended)."
      >
        <input
          className="input input-sm w-full"
          value={get<string>("location") ?? ""}
          onChange={(e) => set("location", e.target.value)}
          spellCheck={false}
          placeholder="(alongside the video file)"
        />
      </Field>

      <Field
        label="Search frequency (minutes)"
        hint="How often the background subtitle finder runs. The lower bound the backend accepts is 10 minutes."
      >
        <input
          type="number"
          min={10}
          className="input input-sm w-32"
          value={get<number>("finderFrequency") ?? 60}
          onChange={(e) => set("finderFrequency", Number(e.target.value))}
        />
      </Field>

      <Toggle
        label="Erase subtitle cache on next search"
        hint="Clears subliminal's per-provider disk cache. Useful when a provider's response format has changed or stale data is causing wrong matches."
        checked={!!get<boolean>("eraseCache")}
        onChange={(v) => set("eraseCache", v)}
      />
    </Section>
  );
}

// -----------------------------------------------------------------------------
// Scripts
// -----------------------------------------------------------------------------

function ScriptsSection({ get, set }: { get: Getter; set: Setter }) {
  const pre = get<string[]>("preScripts") ?? [];
  const post = get<string[]>("extraScripts") ?? [];
  return (
    <Section
      title="Custom scripts"
      hint="Absolute paths to scripts the subtitle searcher runs around each episode. Each script receives the subtitle path on its argv."
    >
      <Field
        label="Pre-search scripts"
        hint="Run before subliminal tries to download. Useful for prepping working directories or normalising the video file before matching."
      >
        <TagInput
          value={pre}
          onChange={(next) => set("preScripts", next)}
          placeholder="/usr/local/bin/pre-sub.sh"
        />
      </Field>

      <Field
        label="Post-download scripts"
        hint="Run after a subtitle lands on disk. Useful for converting formats or syncing the file elsewhere."
      >
        <TagInput
          value={post}
          onChange={(next) => set("extraScripts", next)}
          placeholder="/usr/local/bin/post-sub.sh"
        />
      </Field>

      {(pre.length > 0 || post.length > 0) && (
        <div className="alert alert-soft alert-warning text-xs">
          <TriangleAlert size={12} />
          Scripts run with the same OS user Medusa runs as. Make sure they're
          executable and don't block — the search worker waits on them.
        </div>
      )}
    </Section>
  );
}
