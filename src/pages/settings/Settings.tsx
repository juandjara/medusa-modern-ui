import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

export default function Settings() {
  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Settings</h1>

      <div className="bg-base-100 border border-base-300 rounded-box">
        <div className="px-4 py-3 font-semibold border-b border-base-300">
          General
        </div>
        <ul>
          <li>
            <Link
              to="/settings/general"
              className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-base-200/50 transition-colors"
            >
              <div>
                <div className="font-medium">General &amp; web interface</div>
                <div className="text-xs text-base-content/60">
                  Bind host / port, auth, HTTPS, indexer defaults, updates,
                  proxy, performance.
                </div>
              </div>
              <ChevronRight size={16} className="text-base-content/40" />
            </Link>
          </li>
        </ul>
      </div>

      <div className="bg-base-100 border border-base-300 rounded-box">
        <div className="px-4 py-3 font-semibold border-b border-base-300">
          Search
        </div>
        <ul>
          <li>
            <Link
              to="/settings/search"
              className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-base-200/50 transition-colors border-b border-base-300"
            >
              <div>
                <div className="font-medium">Search settings</div>
                <div className="text-xs text-base-content/60">
                  Schedule, release filters (ignored / required / preferred /
                  undesired), propers, failed-download handling, cache.
                </div>
              </div>
              <ChevronRight size={16} className="text-base-content/40" />
            </Link>
          </li>
          <li>
            <Link
              to="/settings/providers"
              className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-base-200/50 transition-colors border-b border-base-300"
            >
              <div>
                <div className="font-medium">Providers</div>
                <div className="text-xs text-base-content/60">
                  Set search order, enable/disable, and configure per-provider
                  options.
                </div>
              </div>
              <ChevronRight size={16} className="text-base-content/40" />
            </Link>
          </li>
          <li>
            <Link
              to="/settings/providers/custom"
              className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-base-200/50 transition-colors border-b border-base-300"
            >
              <div>
                <div className="font-medium">Custom providers</div>
                <div className="text-xs text-base-content/60">
                  Add direct Newznab / Torznab / TorrentRSS feeds without
                  Prowlarr.
                </div>
              </div>
              <ChevronRight size={16} className="text-base-content/40" />
            </Link>
          </li>
          <li>
            <Link
              to="/settings/providers/prowlarr"
              className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-base-200/50 transition-colors"
            >
              <div>
                <div className="font-medium">Prowlarr</div>
                <div className="text-xs text-base-content/60">
                  Import Newznab / Torznab indexers from a Prowlarr server.
                </div>
              </div>
              <ChevronRight size={16} className="text-base-content/40" />
            </Link>
          </li>
        </ul>
      </div>

      <div className="bg-base-100 border border-base-300 rounded-box">
        <div className="px-4 py-3 font-semibold border-b border-base-300">
          Download clients
        </div>
        <ul>
          <li>
            <Link
              to="/settings/download-clients"
              className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-base-200/50 transition-colors"
            >
              <div>
                <div className="font-medium">NZB and Torrent</div>
                <div className="text-xs text-base-content/60">
                  Configure SABnzbd, NZBget, qBittorrent, Transmission, and
                  others — including blackhole folders.
                </div>
              </div>
              <ChevronRight size={16} className="text-base-content/40" />
            </Link>
          </li>
        </ul>
      </div>

      <div className="bg-base-100 border border-base-300 rounded-box">
        <div className="px-4 py-3 font-semibold border-b border-base-300">
          Post-processing
        </div>
        <ul>
          <li>
            <Link
              to="/settings/postprocessing"
              className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-base-200/50 transition-colors"
            >
              <div>
                <div className="font-medium">Post-processing</div>
                <div className="text-xs text-base-content/60">
                  How downloads get into the library: method, naming, download
                  handler, FFmpeg.
                </div>
              </div>
              <ChevronRight size={16} className="text-base-content/40" />
            </Link>
          </li>
        </ul>
      </div>

      <div className="bg-base-100 border border-base-300 rounded-box">
        <div className="px-4 py-3 font-semibold border-b border-base-300">
          Notifications
        </div>
        <ul>
          <li>
            <Link
              to="/settings/notifications"
              className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-base-200/50 transition-colors"
            >
              <div>
                <div className="font-medium">Media servers and push</div>
                <div className="text-xs text-base-content/60">
                  Tell Kodi / Plex / Emby / Jellyfin to refresh, or get a
                  Pushbullet alert when a download finishes.
                </div>
              </div>
              <ChevronRight size={16} className="text-base-content/40" />
            </Link>
          </li>
        </ul>
      </div>
    </div>
  );
}
