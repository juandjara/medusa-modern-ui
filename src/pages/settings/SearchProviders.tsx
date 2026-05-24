import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  ChevronDown,
  ChevronUp,
  GripVertical,
  Lock,
  Unlock,
  TriangleAlert,
  Check,
  TestTube2,
} from "lucide-react";
import api from "../../lib/api";
import type { ProviderSummary, ProviderConfig } from "../../types/medusa";
import type { ConfigMain, ConfigClients } from "../../types/config";
import { CategoryEditor } from "./CustomProviders";
import Field from "../../components/forms/Field";
import Toggle from "../../components/forms/Toggle";
import SecretInput from "../../components/forms/SecretInput";
import SaveBar from "../../components/forms/SaveBar";

const EMPTY_ARRAY = [] as never[];

export default function SearchProviders() {
  const queryClient = useQueryClient();

  const providersQ = useQuery({
    queryKey: ["providers"],
    queryFn: ({ signal }) =>
      api.get<ProviderSummary[]>("/providers", { signal }).then((r) => r.data),
  });

  const mainQ = useQuery({
    queryKey: ["config", "main"],
    queryFn: ({ signal }) =>
      api.get<ConfigMain>("/config/main", { signal }).then((r) => r.data),
  });

  const clientsQ = useQuery({
    queryKey: ["config", "clients"],
    queryFn: ({ signal }) =>
      api.get<ConfigClients>("/config/clients", { signal }).then((r) => r.data),
  });

  const broken = mainQ.data?.brokenProviders ?? [];
  const nzbEnabled = clientsQ.data?.nzb?.enabled ?? true;
  const torrentEnabled = clientsQ.data?.torrents?.enabled ?? true;

  // Local copy of the server's provider list — drag/drop and toggle mutate
  // this; saving roundtrips through POST /providers.
  const [list, setList] = useState<ProviderSummary[] | null>(null);
  const ordered = list ?? providersQ.data ?? EMPTY_ARRAY;

  // Only providers whose section (nzb / torrent) is enabled in download
  // clients. Disabling a section in download clients should hide its
  // providers here — matches the old UI's filter.
  const visible = useMemo(
    () =>
      ordered.filter(
        (p) =>
          (p.type === "nzb" && nzbEnabled) ||
          (p.type === "torrent" && torrentEnabled),
      ),
    [ordered, nzbEnabled, torrentEnabled],
  );

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const dirty =
    list !== null &&
    providersQ.data !== undefined &&
    !sameOrderAndEnabled(list, providersQ.data);

  const saveOrder = useMutation({
    mutationFn: () =>
      api.post("/providers", {
        providers: ordered.map((p) => ({ id: p.id, config: p.config })),
      }),
    onSuccess: () => {
      setList(null);
      queryClient.invalidateQueries({ queryKey: ["providers"] });
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const oldIdx = ordered.findIndex((p) => p.id === e.active.id);
    const newIdx = ordered.findIndex((p) => p.id === e.over!.id);
    if (oldIdx < 0 || newIdx < 0) return;
    setList(arrayMove(ordered, oldIdx, newIdx));
  };

  const setEnabled = (id: string, enabled: boolean) => {
    setList(
      ordered.map((p) =>
        p.id === id ? { ...p, config: { ...p.config, enabled } } : p,
      ),
    );
  };

  if (providersQ.isLoading) {
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
        <h1 className="text-2xl font-bold">Search providers</h1>
        <p className="text-sm text-base-content/60 mt-1">
          Drag to set search order, toggle to enable, click a provider to edit
          its options. NZB/torrent toggles in{" "}
          <Link
            to="/settings/download-clients"
            className="link link-hover text-primary"
          >
            Download clients
          </Link>{" "}
          determine which categories show up here.
        </p>
      </header>

      <SaveBar
        dirty={dirty}
        pending={saveOrder.isPending}
        success={saveOrder.isSuccess}
        error={saveOrder.isError}
        onSave={() => saveOrder.mutate()}
        label="Save order"
        dirtyLabel="Unsaved order / enabled changes"
      />

      {visible.length === 0 ? (
        <div className="text-center py-16 text-base-content/50">
          No providers visible. Enable NZB and/or Torrent search in Download
          clients.
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={visible.map((p) => p.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="space-y-2">
              {visible.map((p) => (
                <SortableRow
                  key={p.id}
                  provider={p}
                  broken={broken.includes(p.id)}
                  expanded={expandedId === p.id}
                  onToggleExpand={() =>
                    setExpandedId((id) => (id === p.id ? null : p.id))
                  }
                  onEnabledChange={(v) => setEnabled(p.id, v)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <p className="text-xs text-base-content/50">
        <span className="text-error font-semibold">*</span> Provider doesn't
        support backlog searches.{" "}
        <span className="text-error font-semibold">!</span> Provider is marked
        broken upstream.
      </p>
    </div>
  );
}

function sameOrderAndEnabled(a: ProviderSummary[], b: ProviderSummary[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id) return false;
    if (a[i].config.enabled !== b[i].config.enabled) return false;
  }
  return true;
}

function SortableRow({
  provider,
  broken,
  expanded,
  onToggleExpand,
  onEnabledChange,
}: {
  provider: ProviderSummary;
  broken: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onEnabledChange: (v: boolean) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: provider.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const cfg = provider.config;
  const supportsBacklog = provider.supportsBacklog !== false;

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`rounded-box border bg-base-100 ${
        provider.type === "torrent" ? "border-info/30" : "border-warning/30"
      }`}
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
          checked={cfg.enabled}
          onChange={(e) => onEnabledChange(e.target.checked)}
          disabled={broken}
          title={broken ? "Marked broken upstream" : ""}
        />
        <img
          src={`/images/providers/${provider.imageName}`}
          alt=""
          className="w-4 h-4"
          onError={(e) => {
            e.currentTarget.style.visibility = "hidden";
          }}
        />
        <button
          type="button"
          className="font-medium flex-1 text-left hover:underline truncate"
          onClick={onToggleExpand}
        >
          {provider.name}
          {!supportsBacklog && (
            <span
              className="text-error ml-1"
              title="Doesn't support backlog searches"
            >
              *
            </span>
          )}
          {broken && (
            <span className="text-error ml-1" title="Broken upstream">
              !
            </span>
          )}
        </button>

        <div className="flex items-center gap-1 text-xs">
          <Badge active={cfg.search.daily.enabled} label="daily" />
          <Badge active={cfg.search.backlog.enabled} label="backlog" />
          <Badge active={cfg.search.manual.enabled} label="manual" />
        </div>

        <span
          className="text-base-content/40"
          title={provider.public ? "Public tracker" : "Private tracker"}
        >
          {provider.public ? <Unlock size={12} /> : <Lock size={12} />}
        </span>
        <span
          className={`badge badge-xs ${
            provider.type === "torrent" ? "badge-info" : "badge-warning"
          }`}
        >
          {provider.type}
        </span>

        <button
          type="button"
          className="btn btn-ghost btn-xs"
          onClick={onToggleExpand}
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-base-300 px-3 py-3">
          <ProviderOptions provider={provider} />
        </div>
      )}
    </li>
  );
}

function Badge({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={`badge badge-xs ${active ? "badge-success" : "badge-ghost opacity-40"}`}
      title={`${label}: ${active ? "on" : "off"}`}
    >
      {label}
    </span>
  );
}

function ProviderOptions({ provider }: { provider: ProviderSummary }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Partial<ProviderConfig>>({});

  const effective: ProviderConfig = useMemo(
    () => mergeConfig(provider.config, draft),
    [provider.config, draft],
  );

  const setField = <K extends keyof ProviderConfig>(
    key: K,
    value: ProviderConfig[K],
  ) => setDraft((d) => ({ ...d, [key]: value }));

  const setSearch = <K extends keyof ProviderConfig["search"]>(
    key: K,
    value: ProviderConfig["search"][K],
  ) =>
    setDraft((d) => ({
      ...d,
      search: { ...effective.search, ...d.search, [key]: value },
    }));

  const dirty = Object.keys(draft).length > 0;

  const save = useMutation({
    mutationFn: () => api.patch(`/providers/${provider.id}`, effective),
    onSuccess: () => {
      setDraft({});
      queryClient.invalidateQueries({ queryKey: ["providers"] });
    },
  });

  const test = useMutation({
    mutationFn: () =>
      api
        .post<
          { message?: string } | string
        >("/providers/internal/operation", { type: "TESTPROVIDER", providerId: provider.id })
        .then((r) => r.data),
  });

  const isTorrent = provider.type === "torrent";
  const isNewznabLike =
    provider.subType === "newznab" || provider.subType === "torznab";

  return (
    <div className="space-y-6">
      {/* Search modes */}
      <Field
        size="sm"
        label="Backlog search mode"
        hint="When backlog-searching you can either ask for season packs only, or build a season from individual episodes."
      >
        <select
          className="select select-sm w-full max-w-xs"
          value={effective.search.mode ?? "eponly"}
          onChange={(e) => setSearch("mode", e.target.value)}
        >
          <option value="eponly">Episodes only</option>
          <option value="sponly">Season packs only</option>
        </select>
      </Field>

      <Toggle
        label="Enable fallback"
        hint="If a season search returns nothing, retry using the opposite mode (season ↔ episodes)."
        checked={!!effective.search.fallback}
        onChange={(v) => setSearch("fallback", v)}
      />

      <div className="flex flex-wrap items-start gap-6">
        <Toggle
          label="Enable daily searches"
          hint="Lets this provider participate in scheduled daily searches."
          checked={effective.search.daily.enabled}
          onChange={(v) =>
            setSearch("daily", { ...effective.search.daily, enabled: v })
          }
        />
        <Toggle
          label="Enable backlog searches"
          hint="Lets this provider participate in backlog searches."
          checked={effective.search.backlog.enabled}
          onChange={(v) => setSearch("backlog", { enabled: v })}
          disabled={provider.supportsBacklog === false}
          disabledHint="Provider doesn't support backlog."
        />
        <Toggle
          label="Enable manual searches"
          hint="Lets this provider appear in the Manual Search modal."
          checked={effective.search.manual.enabled}
          onChange={(v) => setSearch("manual", { enabled: v })}
        />
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <Toggle
          label="Enable search delay"
          hint={
            <>
              <p>
                Wait N hours after the first result for an episode before
                actually snatching from this provider. Lets higher-priority
                providers win when they show up shortly after.
              </p>
              <p className="mt-1">
                Negative values let daily search accept results before the
                scheduled air date. Proper and backlog searches ignore the
                delay.
              </p>
            </>
          }
          checked={effective.search.delay.enabled}
          onChange={(v) =>
            setSearch("delay", { ...effective.search.delay, enabled: v })
          }
        />
        {effective.search.delay.enabled && (
          <Field
            size="sm"
            label="Delay (hours)"
            hint="Hours to wait, compared to the first result for the episode."
          >
            <input
              type="number"
              step={0.5}
              className="input input-sm w-28"
              // Duration is stored in minutes on the backend; show hours.
              value={Number((effective.search.delay.duration / 60).toFixed(2))}
              onChange={(e) =>
                setSearch("delay", {
                  ...effective.search.delay,
                  duration: Number(e.target.value) * 60,
                })
              }
            />
          </Field>
        )}
      </div>

      {/* Auth & URL */}
      {(isNewznabLike || provider.config.customUrl !== undefined) && (
        <Field
          size="sm"
          label={isNewznabLike ? "URL" : "Custom URL"}
          hint={
            isNewznabLike
              ? undefined
              : "Override the provider's default URL. Include the protocol (and port if applicable), e.g. http://192.168.1.4/ or http://localhost:3000/"
          }
        >
          <input
            type="url"
            className="input input-sm w-full"
            value={effective.customUrl ?? effective.url ?? ""}
            onChange={(e) =>
              isNewznabLike
                ? setField("url", e.target.value)
                : setField("customUrl", e.target.value)
            }
            placeholder="Leave blank to use the default URL."
            spellCheck={false}
          />
        </Field>
      )}

      {provider.config.username !== undefined && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field size="sm" label="Username">
            <input
              className="input input-sm w-full"
              value={effective.username ?? ""}
              onChange={(e) => setField("username", e.target.value)}
              autoComplete="off"
            />
          </Field>
          <Field size="sm" label="Password">
            <input
              type="password"
              className="input input-sm w-full"
              value={effective.password ?? ""}
              onChange={(e) => setField("password", e.target.value)}
              autoComplete="new-password"
            />
          </Field>
        </div>
      )}

      {provider.config.apikey !== undefined && (
        <Field size="sm" label="API key">
          <SecretInput
            value={effective.apikey ?? ""}
            onChange={(v) => setField("apikey", v)}
          />
        </Field>
      )}

      {isNewznabLike && (
        <CategoryEditor
          provider={provider}
          catIds={effective.catIds ?? []}
          onChange={(next) => setField("catIds", next)}
        />
      )}

      {/* Torrent-specific */}
      {isTorrent && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-base-300/60">
          {provider.config.minseed !== undefined && (
            <Field size="sm" label="Min seeders">
              <input
                type="number"
                min={0}
                className="input input-sm w-full"
                value={effective.minseed ?? 0}
                onChange={(e) => setField("minseed", Number(e.target.value))}
              />
            </Field>
          )}
          {provider.config.minleech !== undefined && (
            <Field size="sm" label="Min leechers">
              <input
                type="number"
                min={0}
                className="input input-sm w-full"
                value={effective.minleech ?? 0}
                onChange={(e) => setField("minleech", Number(e.target.value))}
              />
            </Field>
          )}
          {provider.config.ratio !== undefined && (
            <Field
              size="sm"
              label="Seed ratio"
              className="col-span-2"
              hint={
                <>
                  Used by the automated download handler.
                  <br />
                  -1 — disabled (fall back to the global ratio in
                  Post-Processing).
                  <br />0 — no ratio target; handler doesn't wait for seeding.
                  <br />
                  Otherwise — desired ratio.
                </>
              }
            >
              <input
                type="number"
                step="0.1"
                className="input input-sm w-full"
                value={
                  typeof effective.ratio === "number"
                    ? effective.ratio
                    : Number(effective.ratio ?? -1)
                }
                onChange={(e) => setField("ratio", Number(e.target.value))}
              />
            </Field>
          )}
          {provider.config.confirmed !== undefined && (
            <Toggle
              label="Confirmed downloads"
              hint="Only download torrents from trusted / verified uploaders."
              checked={!!effective.confirmed}
              onChange={(v) => setField("confirmed", v)}
            />
          )}
          {provider.config.ranked !== undefined && (
            <Toggle
              label="Ranked torrents"
              hint="Only download ranked (trusted) releases."
              checked={!!effective.ranked}
              onChange={(v) => setField("ranked", v)}
            />
          )}
          {provider.config.sorting !== undefined && (
            <Field size="sm" label="Sort results by">
              <select
                className="select select-sm w-full"
                value={effective.sorting ?? "last"}
                onChange={(e) => setField("sorting", e.target.value)}
              >
                <option value="last">Last</option>
                <option value="seeders">Seeders</option>
                <option value="leechers">Leechers</option>
              </select>
            </Field>
          )}
        </div>
      )}

      {/* Auth tokens (per-provider): only render the fields the provider exposes */}
      {(provider.config.passkey !== undefined ||
        provider.config.digest !== undefined ||
        provider.config.hash !== undefined ||
        provider.config.pin !== undefined ||
        provider.config.pid !== undefined) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-base-300/60">
          {provider.config.passkey !== undefined && (
            <Field size="sm" label="Passkey">
              <input
                type="password"
                className="input input-sm w-full"
                value={effective.passkey ?? ""}
                onChange={(e) => setField("passkey", e.target.value)}
                autoComplete="off"
              />
            </Field>
          )}
          {provider.config.digest !== undefined && (
            <Field size="sm" label="Digest">
              <input
                className="input input-sm w-full"
                value={effective.digest ?? ""}
                onChange={(e) => setField("digest", e.target.value)}
              />
            </Field>
          )}
          {provider.config.hash !== undefined && (
            <Field size="sm" label="Hash">
              <input
                className="input input-sm w-full"
                value={effective.hash ?? ""}
                onChange={(e) => setField("hash", e.target.value)}
              />
            </Field>
          )}
          {provider.config.pin !== undefined && (
            <Field size="sm" label="PIN">
              <input
                className="input input-sm w-full"
                value={effective.pin ?? ""}
                onChange={(e) => setField("pin", e.target.value)}
              />
            </Field>
          )}
          {provider.config.pid !== undefined && (
            <Field size="sm" label="PID">
              <input
                className="input input-sm w-full"
                value={effective.pid ?? ""}
                onChange={(e) => setField("pid", e.target.value)}
              />
            </Field>
          )}
        </div>
      )}

      {/* Cookies */}
      {provider.config.cookies?.required &&
        provider.config.cookies.required.length > 0 && (
          <Field
            size="sm"
            label="Cookies"
            hint={
              <>
                <p>
                  Required keys:{" "}
                  <code>{provider.config.cookies.required.join(", ")}</code>
                </p>
                <p className="mt-1">
                  Format:{" "}
                  <code>
                    {provider.config.cookies.required
                      .map((c) => `${c}=xx`)
                      .join("; ")}
                  </code>
                </p>
                <p className="mt-1">
                  Captcha-protected providers:{" "}
                  <a
                    href="https://github.com/Medusa/Medusa/wiki/Configure-Providers-with-captcha-protection"
                    target="_blank"
                    rel="noreferrer"
                    className="link link-hover text-primary"
                  >
                    step-by-step wiki guide
                  </a>
                  .
                </p>
              </>
            }
          >
            <input
              className="input input-sm w-full"
              value={effective.cookies?.values ?? ""}
              onChange={(e) =>
                setField("cookies", {
                  ...effective.cookies,
                  values: e.target.value,
                })
              }
              spellCheck={false}
              autoComplete="off"
            />
          </Field>
        )}

      <div className="flex items-center gap-2 pt-2">
        <button
          type="button"
          className="btn btn-sm btn-primary"
          onClick={() => save.mutate()}
          disabled={!dirty || save.isPending}
        >
          {save.isPending ? (
            <span className="loading loading-spinner loading-xs" />
          ) : (
            "Save provider"
          )}
        </button>
        <button
          type="button"
          className="btn btn-sm gap-1"
          onClick={() => test.mutate()}
          disabled={test.isPending}
        >
          <TestTube2 size={14} />
          {test.isPending ? "Testing…" : "Test"}
        </button>
        {test.isSuccess && (
          <span className="text-xs text-success inline-flex items-center gap-1">
            <Check size={12} />
            {typeof test.data === "string"
              ? test.data
              : (test.data?.message ?? "OK")}
          </span>
        )}
        {test.isError && (
          <span className="text-xs text-error inline-flex items-center gap-1">
            <TriangleAlert size={12} /> {extractErrorMessage(test.error)}
          </span>
        )}
        {save.isError && (
          <span className="text-xs text-error inline-flex items-center gap-1">
            <TriangleAlert size={12} /> Save failed
          </span>
        )}
      </div>
    </div>
  );
}

function mergeConfig(
  base: ProviderConfig,
  draft: Partial<ProviderConfig>,
): ProviderConfig {
  return {
    ...base,
    ...draft,
    search: { ...base.search, ...(draft.search ?? {}) },
    cookies: { ...base.cookies, ...(draft.cookies ?? {}) },
  };
}

function extractErrorMessage(err: unknown): string {
  if (typeof err === "object" && err && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}
