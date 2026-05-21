import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { ChevronLeft } from "lucide-react";
import api from "../../lib/api";
import Field from "../../components/forms/Field";
import Toggle from "../../components/forms/Toggle";
import SecretInput from "../../components/forms/SecretInput";
import TestRow from "../../components/forms/TestRow";
import SaveBar from "../../components/forms/SaveBar";
import FolderPicker from "../../components/forms/FolderPicker";
import type { ConfigClients } from "../../types/config";

const NZB_METHODS: { value: string; label: string }[] = [
  { value: "blackhole", label: "Black hole" },
  { value: "sabnzbd", label: "SABnzbd" },
  { value: "nzbget", label: "NZBget" },
];

// Mirrors themes-default/slim/src/components/config-search.vue clientsConfig.
// Each client only honors a subset of the torrent.* fields — showing the rest
// would let users save values the client silently ignores.
interface TorrentClientCaps {
  title: string;
  hint?: string;
  username?: boolean; // default true
  path?: boolean;
  label?: boolean;
  seedLocation?: boolean;
  seedTime?: boolean;
  paused?: boolean;
  verifySSL?: boolean;
  highBandwidth?: boolean;
  rpcUrl?: boolean;
  seedTimeLabel?: string;
}

const TORRENT_CLIENTS: Record<string, TorrentClientCaps> = {
  blackhole: { title: "Black hole" },
  qbittorrent: {
    title: "qBittorrent",
    hint: "URL to your qBittorrent client (e.g. http://localhost:8080)",
    path: true,
    label: true,
    paused: true,
    verifySSL: true,
  },
  transmission: {
    title: "Transmission",
    hint: "URL to your Transmission client (e.g. http://localhost:9091)",
    path: true,
    seedLocation: true,
    seedTime: true,
    seedTimeLabel: "Stop seeding when inactive for",
    paused: true,
    rpcUrl: true,
    highBandwidth: true,
  },
  deluge: {
    title: "Deluge (Web UI)",
    hint: "URL to your Deluge client (e.g. http://localhost:8112)",
    // Deluge WebUI authenticates with password only.
    username: false,
    path: true,
    label: true,
    seedLocation: true,
    paused: true,
    verifySSL: true,
  },
  deluged: {
    title: "Deluge (Daemon)",
    hint: "Daemon address (e.g. scgi://localhost:58846)",
    path: true,
    label: true,
    seedLocation: true,
    paused: true,
    verifySSL: true,
  },
  utorrent: {
    title: "uTorrent",
    hint: "URL to your uTorrent client (e.g. http://localhost:8000)",
    label: true,
    seedTime: true,
    paused: true,
  },
  rtorrent: {
    title: "rTorrent",
    hint: "scgi://… (XML-RPC) or https://…/rutorrent/plugins/httprpc/action.php",
    path: true,
    label: true,
    verifySSL: true,
  },
  downloadstation: {
    title: "Synology Download Station",
    hint: "URL to your Synology DS (e.g. http://localhost:5000)",
    path: true,
  },
  mlnet: {
    title: "MLDonkey",
    hint: "URL to your MLDonkey (e.g. http://localhost:4080)",
    verifySSL: true,
  },
};

const HTTP_AUTH_TYPES = [
  { value: "none", label: "None" },
  { value: "basic", label: "Basic" },
  { value: "digest", label: "Digest" },
];

function labelHint(method: string): string | undefined {
  if (method === "utorrent")
    return "Global label. %N expands to the show name.";
  if (method === "deluge" || method === "deluged")
    return "No spaces allowed. Requires the Label plugin in Deluge.";
  if (method === "qbittorrent") return "No spaces allowed. qBittorrent 3.3.1+.";
  return undefined;
}

function pathHint(method: string): string {
  const base = "Where downloads land. Blank for the client's default.";
  if (method === "downloadstation")
    return `${base} For Synology DS, this must be a shared folder.`;
  if (method === "qbittorrent") return `${base} qBittorrent 3.2.0+.`;
  return base;
}

const NZBGET_PRIORITY_OPTIONS = [
  { value: -100, label: "Very low" },
  { value: -50, label: "Low" },
  { value: 0, label: "Normal" },
  { value: 50, label: "High" },
  { value: 100, label: "Very high" },
  { value: 900, label: "Force" },
];

type DraftMap = Record<string, unknown>;

function getByPath(obj: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (o, k) => (o == null ? o : (o as Record<string, unknown>)[k]),
      obj,
    );
}

function setByPath(obj: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split(".");
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (!(k in cur) || typeof cur[k] !== "object" || cur[k] === null) {
      cur[k] = {};
    }
    cur = cur[k] as Record<string, unknown>;
  }
  cur[keys[keys.length - 1]] = value;
}

export default function DownloadClients() {
  const queryClient = useQueryClient();

  const configQ = useQuery({
    queryKey: ["config", "clients"],
    queryFn: ({ signal }) =>
      api.get<ConfigClients>("/config/clients", { signal }).then((r) => r.data),
  });

  const saved = configQ.data;

  // Single draft keyed by dot path (relative to ClientsConfig root). Avoids
  // 30+ useState calls. Save dispatches the union as a nested PATCH payload.
  const [draft, setDraft] = useState<DraftMap>({});

  const get = useMemo(
    () =>
      <T,>(path: string): T => {
        if (path in draft) return draft[path] as T;
        return getByPath(saved, path) as T;
      },
    [draft, saved],
  );
  const set = (path: string, value: unknown) =>
    setDraft((d) => ({ ...d, [path]: value }));

  const dirty = Object.keys(draft).some(
    (k) => draft[k] !== getByPath(saved, k),
  );

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = { clients: {} };
      for (const [path, value] of Object.entries(draft)) {
        setByPath(payload.clients as Record<string, unknown>, path, value);
      }
      return api.patch("/config/main", payload);
    },
    onSuccess: () => {
      setDraft({});
      queryClient.invalidateQueries({ queryKey: ["config", "clients"] });
    },
  });

  if (configQ.isLoading || !saved) {
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
        <h1 className="text-2xl font-bold">Download clients</h1>
        <p className="text-sm text-base-content/60 mt-1">
          Where Medusa sends NZB and Torrent results once snatched. Test the
          connection before saving — the test endpoints take the form values
          directly, so you can verify a setting without committing it.
        </p>
      </header>

      <SaveBar
        dirty={dirty}
        pending={saveMutation.isPending}
        success={saveMutation.isSuccess}
        error={saveMutation.isError}
        onSave={() => saveMutation.mutate()}
      />

      <NzbSection get={get} set={set} />
      <TorrentSection get={get} set={set} />
    </div>
  );
}

type Getter = <T>(path: string) => T;
type Setter = (path: string, value: unknown) => void;

function NzbSection({ get, set }: { get: Getter; set: Setter }) {
  const enabled = get<boolean>("nzb.enabled");
  const method = get<string>("nzb.method") || "blackhole";

  return (
    <section className="card bg-base-100 border border-base-300 rounded-box">
      <div className="card-body p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">NZB</h2>
          <label className="label cursor-pointer gap-2">
            <span className="label-text text-sm">Enable NZB search</span>
            <input
              type="checkbox"
              className="toggle toggle-sm"
              checked={!!enabled}
              onChange={(e) => set("nzb.enabled", e.target.checked)}
            />
          </label>
        </div>

        {enabled && (
          <>
            <Field label="Method">
              <select
                className="select select-sm"
                value={method}
                onChange={(e) => set("nzb.method", e.target.value)}
              >
                {NZB_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>

            {method === "blackhole" && (
              <Field
                label="Folder location"
                hint=".nzb files are written here for an external tool to find and use."
              >
                <FolderPicker
                  value={get<string>("nzb.dir") ?? ""}
                  onChange={(v) => set("nzb.dir", v)}
                />
              </Field>
            )}

            {method === "sabnzbd" && <SabnzbdFields get={get} set={set} />}
            {method === "nzbget" && <NzbgetFields get={get} set={set} />}
          </>
        )}
      </div>
    </section>
  );
}

function SabnzbdFields({ get, set }: { get: Getter; set: Setter }) {
  const host = get<string>("nzb.sabnzbd.host") ?? "";
  const username = get<string>("nzb.sabnzbd.username") ?? "";
  const password = get<string>("nzb.sabnzbd.password") ?? "";
  const apiKey = get<string>("nzb.sabnzbd.apiKey") ?? "";

  const test = useMutation({
    mutationFn: () =>
      axios
        .get<string>("/home/testSABnzbd", {
          params: { host, username, password, apikey: apiKey },
          responseType: "text",
          // Endpoint returns plain text on any outcome; we surface it as-is.
          validateStatus: (s) => s < 500,
        })
        .then((r) => r.data),
  });

  const ok =
    test.isSuccess &&
    typeof test.data === "string" &&
    test.data.toLowerCase().startsWith("success");

  return (
    <>
      <Field label="SABnzbd URL" hint="e.g. http://sabnzbd:8080/">
        <input
          type="url"
          className="input input-sm w-full"
          value={host}
          onChange={(e) => set("nzb.sabnzbd.host", e.target.value)}
          spellCheck={false}
        />
      </Field>
      <Field label="Username" hint="Blank for none.">
        <input
          className="input input-sm w-full"
          value={username}
          onChange={(e) => set("nzb.sabnzbd.username", e.target.value)}
          autoComplete="off"
        />
      </Field>
      <Field label="Password" hint="Blank for none.">
        <input
          type="password"
          className="input input-sm w-full"
          value={password}
          onChange={(e) => set("nzb.sabnzbd.password", e.target.value)}
          autoComplete="new-password"
        />
      </Field>
      <Field label="API key" hint="SABnzbd → Config → General → API Key">
        <SecretInput
          value={apiKey}
          onChange={(v) => set("nzb.sabnzbd.apiKey", v)}
        />
      </Field>

      <CategoryFields prefix="nzb.sabnzbd" get={get} set={set} />

      <div className="pt-1">
        <Toggle
          label="Use forced priority"
          hint="Bumps priority from HIGH to FORCED in SABnzbd's queue."
          checked={!!get<boolean>("nzb.sabnzbd.forced")}
          onChange={(v) => set("nzb.sabnzbd.forced", v)}
        />
      </div>

      <TestRow
        result={test.data ?? null}
        ok={ok}
        pending={test.isPending}
        onClick={() => test.mutate()}
      />
    </>
  );
}

function NzbgetFields({ get, set }: { get: Getter; set: Setter }) {
  const host = get<string>("nzb.nzbget.host") ?? "";
  const username = get<string>("nzb.nzbget.username") ?? "";
  const password = get<string>("nzb.nzbget.password") ?? "";
  const useHttps = !!get<boolean>("nzb.nzbget.useHttps");

  const test = useMutation({
    mutationFn: () =>
      axios
        .get<string>("/home/testNZBget", {
          params: {
            host,
            username,
            password,
            use_https: useHttps ? 1 : 0,
          },
          responseType: "text",
          validateStatus: (s) => s < 500,
        })
        .then((r) => r.data),
  });
  const ok =
    test.isSuccess &&
    typeof test.data === "string" &&
    test.data.toLowerCase().startsWith("success");

  return (
    <>
      <Toggle
        label="Connect over HTTPS"
        hint="Enable Secure control in NZBget and use the Secure Port."
        checked={useHttps}
        onChange={(v) => set("nzb.nzbget.useHttps", v)}
      />
      <Field label="NZBget host:port" hint="e.g. nzbget:6789">
        <input
          className="input input-sm w-full"
          value={host}
          onChange={(e) => set("nzb.nzbget.host", e.target.value)}
          spellCheck={false}
        />
      </Field>
      <Field label="Username" hint="From nzbget.conf — default: nzbget">
        <input
          className="input input-sm w-full"
          value={username}
          onChange={(e) => set("nzb.nzbget.username", e.target.value)}
          autoComplete="off"
        />
      </Field>
      <Field label="Password" hint="From nzbget.conf — default: tegbzn6789">
        <input
          type="password"
          className="input input-sm w-full"
          value={password}
          onChange={(e) => set("nzb.nzbget.password", e.target.value)}
          autoComplete="new-password"
        />
      </Field>
      <Field
        label="Priority"
        hint="Used for daily snatches; backlog items always use Normal."
      >
        <select
          className="select select-sm"
          value={get<number>("nzb.nzbget.priority") ?? 0}
          onChange={(e) => set("nzb.nzbget.priority", Number(e.target.value))}
        >
          {NZBGET_PRIORITY_OPTIONS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </Field>

      <CategoryFields prefix="nzb.nzbget" get={get} set={set} />

      <TestRow
        result={test.data ?? null}
        ok={ok}
        pending={test.isPending}
        onClick={() => test.mutate()}
      />
    </>
  );
}

function CategoryFields({
  prefix,
  get,
  set,
}: {
  prefix: string;
  get: Getter;
  set: Setter;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-base-content/60 mb-1">
        Tag snatched downloads so the client can route them to the right folder
        or post-processor.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Category" hint="Daily downloads, e.g. TV">
          <input
            className="input input-sm w-full"
            value={get<string>(`${prefix}.category`) ?? ""}
            onChange={(e) => set(`${prefix}.category`, e.target.value)}
          />
        </Field>
        <Field label="Category (backlog)" hint="Older / backlog episodes">
          <input
            className="input input-sm w-full"
            value={get<string>(`${prefix}.categoryBacklog`) ?? ""}
            onChange={(e) => set(`${prefix}.categoryBacklog`, e.target.value)}
          />
        </Field>
        <Field label="Anime category" hint="Daily anime, e.g. anime">
          <input
            className="input input-sm w-full"
            value={get<string>(`${prefix}.categoryAnime`) ?? ""}
            onChange={(e) => set(`${prefix}.categoryAnime`, e.target.value)}
          />
        </Field>
        <Field
          label="Anime category (backlog)"
          hint="Older / backlog anime episodes"
        >
          <input
            className="input input-sm w-full"
            value={get<string>(`${prefix}.categoryAnimeBacklog`) ?? ""}
            onChange={(e) =>
              set(`${prefix}.categoryAnimeBacklog`, e.target.value)
            }
          />
        </Field>
      </div>
    </div>
  );
}

function TorrentSection({ get, set }: { get: Getter; set: Setter }) {
  const enabled = get<boolean>("torrents.enabled");
  const method = get<string>("torrents.method") || "blackhole";
  const caps = TORRENT_CLIENTS[method] ?? TORRENT_CLIENTS.blackhole;

  const host = get<string>("torrents.host") ?? "";
  const username = get<string>("torrents.username") ?? "";
  const password = get<string>("torrents.password") ?? "";

  // rTorrent over scgi:// uses XML-RPC creds embedded in the URL, so the
  // HTTP-level username/password/auth-type selector goes away. Over HTTP it
  // needs the HTTP auth selector that no other client exposes.
  const isRtorrentScgi =
    method === "rtorrent" && host.trim().toLowerCase().startsWith("scgi://");
  const showUsername =
    caps.username !== false && !isRtorrentScgi && method !== "blackhole";
  const showPassword = !isRtorrentScgi && method !== "blackhole";
  const showAuthType = method === "rtorrent" && !isRtorrentScgi;

  const test = useMutation({
    mutationFn: () =>
      axios
        .get<string>("/home/testTorrent", {
          params: {
            torrent_method: method,
            host,
            username,
            password,
          },
          responseType: "text",
          validateStatus: (s) => s < 500,
        })
        .then((r) => r.data),
  });

  const ok =
    test.isSuccess &&
    typeof test.data === "string" &&
    /success|^test successful|connected/i.test(test.data);

  return (
    <section className="card bg-base-100 border border-base-300 rounded-box">
      <div className="card-body p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Torrent</h2>
          <label className="label cursor-pointer gap-2">
            <span className="label-text text-sm">Enable torrent search</span>
            <input
              type="checkbox"
              className="toggle toggle-sm"
              checked={!!enabled}
              onChange={(e) => set("torrents.enabled", e.target.checked)}
            />
          </label>
        </div>

        {enabled && (
          <>
            <Field label="Method">
              <select
                className="select select-sm"
                value={method}
                onChange={(e) => set("torrents.method", e.target.value)}
              >
                {Object.entries(TORRENT_CLIENTS).map(([value, c]) => (
                  <option key={value} value={value}>
                    {c.title}
                  </option>
                ))}
              </select>
            </Field>

            {method === "blackhole" ? (
              <>
                <Field
                  label="Folder location"
                  hint=".torrent files are written here for an external tool to find and use."
                >
                  <FolderPicker
                    value={get<string>("torrents.dir") ?? ""}
                    onChange={(v) => set("torrents.dir", v)}
                  />
                </Field>
                <Toggle
                  label="Save magnet to .magnet file"
                  hint="If the result is a magnet URI and no .torrent could be fetched from a magnet registry, write the URI to a .magnet file instead."
                  checked={!!get<boolean>("torrents.saveMagnetFile")}
                  onChange={(v) => set("torrents.saveMagnetFile", v)}
                />
              </>
            ) : (
              <>
                <Field label="Host" hint={caps.hint}>
                  <input
                    className="input input-sm w-full"
                    value={host}
                    onChange={(e) => set("torrents.host", e.target.value)}
                    spellCheck={false}
                  />
                </Field>

                {caps.rpcUrl && (
                  <Field
                    label="RPC URL"
                    hint="Path without leading/trailing slashes (e.g. transmission)"
                  >
                    <input
                      className="input input-sm w-full"
                      value={get<string>("torrents.rpcUrl") ?? ""}
                      onChange={(e) => set("torrents.rpcUrl", e.target.value)}
                    />
                  </Field>
                )}

                {showAuthType && (
                  <Field label="HTTP authentication">
                    <select
                      className="select select-sm"
                      value={get<string>("torrents.authType") || "none"}
                      onChange={(e) => set("torrents.authType", e.target.value)}
                    >
                      {HTTP_AUTH_TYPES.map((a) => (
                        <option key={a.value} value={a.value}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}

                {showUsername && (
                  <Field label="Username" hint="Blank for none.">
                    <input
                      className="input input-sm w-full"
                      value={username}
                      onChange={(e) => set("torrents.username", e.target.value)}
                      autoComplete="off"
                    />
                  </Field>
                )}
                {showPassword && (
                  <Field label="Password" hint="Blank for none.">
                    <input
                      type="password"
                      className="input input-sm w-full"
                      value={password}
                      onChange={(e) => set("torrents.password", e.target.value)}
                      autoComplete="new-password"
                    />
                  </Field>
                )}

                {(caps.label ||
                  caps.path ||
                  caps.seedLocation ||
                  caps.seedTime) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {caps.label && (
                      <>
                        <Field label="Label" hint={labelHint(method)}>
                          <input
                            className="input input-sm w-full"
                            value={get<string>("torrents.label") ?? ""}
                            onChange={(e) =>
                              set("torrents.label", e.target.value)
                            }
                          />
                        </Field>
                        <Field label="Anime label" hint={labelHint(method)}>
                          <input
                            className="input input-sm w-full"
                            value={get<string>("torrents.labelAnime") ?? ""}
                            onChange={(e) =>
                              set("torrents.labelAnime", e.target.value)
                            }
                          />
                        </Field>
                      </>
                    )}
                    {caps.path && (
                      <Field label="Download path" hint={pathHint(method)}>
                        <FolderPicker
                          value={get<string>("torrents.path") ?? ""}
                          onChange={(v) => set("torrents.path", v)}
                        />
                      </Field>
                    )}
                    {caps.seedLocation && (
                      <Field
                        label="Post-import seed location"
                        hint={
                          <span>
                            Optional. After Medusa places the library copy, it
                            asks {caps.title} to relocate the torrent's data
                            files here (the client equivalent of "Set Torrent
                            location" / "Move Torrent"). Two reasons to set it:
                            <ul className="list-disc list-inside mt-1">
                              <li>
                                <strong>Tiering</strong> — move long-tail seeded
                                torrents to a cheaper or quieter drive separate
                                from the download folder.
                              </li>
                              <li>
                                <strong>Scanner-loop guard</strong> — only
                                relevant with <em>scheduled-scan</em> trigger +{" "}
                                <em>hardlink</em> processing: point this outside
                                the Download directory so the scanner can't keep
                                re-finding the seeded file.
                              </li>
                            </ul>
                            Leave blank if your downloads and seeded torrents
                            live on the same drive and you use the download
                            handler — Medusa's history table already prevents
                            re-processing.
                          </span>
                        }
                      >
                        <FolderPicker
                          value={get<string>("torrents.seedLocation") ?? ""}
                          onChange={(v) => set("torrents.seedLocation", v)}
                        />
                      </Field>
                    )}
                    {caps.seedTime && (
                      <Field
                        label={
                          caps.seedTimeLabel ?? "Minimum seed time (hours)"
                        }
                        hint="Hours. 0 = client default, -1 = unset"
                      >
                        <input
                          type="number"
                          min={-1}
                          className="input input-sm w-full"
                          value={get<number>("torrents.seedTime") ?? 0}
                          onChange={(e) =>
                            set("torrents.seedTime", Number(e.target.value))
                          }
                        />
                      </Field>
                    )}
                  </div>
                )}

                {(caps.paused || caps.highBandwidth || caps.verifySSL) && (
                  <div className="flex flex-wrap items-start gap-6 pt-2">
                    {caps.paused && (
                      <Toggle
                        label="Add paused"
                        hint="Send the .torrent to the client but don't start downloading."
                        checked={!!get<boolean>("torrents.paused")}
                        onChange={(v) => set("torrents.paused", v)}
                      />
                    )}
                    {caps.highBandwidth && (
                      <Toggle
                        label="High bandwidth"
                        hint="Use high-bandwidth allocation when the snatch priority is high."
                        checked={!!get<boolean>("torrents.highBandwidth")}
                        onChange={(v) => set("torrents.highBandwidth", v)}
                      />
                    )}
                    {caps.verifySSL && (
                      <Toggle
                        label="Verify SSL"
                        hint={
                          method === "deluge"
                            ? "Disable if you see 'Deluge: Authentication Error' in the log."
                            : "Verify TLS certificates on HTTPS requests."
                        }
                        checked={!!get<boolean>("torrents.verifySSL")}
                        onChange={(v) => set("torrents.verifySSL", v)}
                      />
                    )}
                  </div>
                )}

                <TestRow
                  result={test.data ?? null}
                  ok={ok}
                  pending={test.isPending}
                  onClick={() => test.mutate()}
                />
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}
