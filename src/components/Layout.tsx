import { Outlet, NavLink } from "react-router-dom";
import { Suspense, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Tv,
  Calendar,
  Clock as History,
  Download,
  Gauge,
  Settings,
  LogOut,
  Menu,
  X,
  ScrollText,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { useWebSocket } from "../lib/websocket";
import { useLogCounts } from "../lib/logs";
import LiveStatus from "./LiveStatus";
import type { LiveQueueItem } from "../types/medusa";

// Shape of QueueItemShow.data, per medusa/queues/show_queue.py + generic_queue.py.
// We only read a couple of fields defensively — the rest of the payload varies
// by action and isn't needed for cache invalidation.
interface QueueItemShowData {
  inProgress?: boolean;
  success?: boolean | null;
  show?: { id?: { slug?: string } };
}

interface ShowEnvelope {
  id?: { slug?: string };
}

const LIVE_QUEUE_KEY = ["live-queue"] as const;

// Items that already appear in /config/system shouldn't be duplicated in the
// live-queue cache. Post-process items go through the system fetch path; the
// show-queue items emit QueueItemShow (separate event), so we don't see them
// here anyway.
function shouldTrackInLiveQueue(item: LiveQueueItem): boolean {
  return item.name !== "Post Process";
}

// How long to keep finished items visible after they complete, so the user
// gets a chance to see the final state before they vanish.
const LIVE_QUEUE_EXPIRE_MS = 30_000;

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  showLogBadge?: boolean;
};

const navItems: NavItem[] = [
  { to: "/", label: "Shows", icon: Tv },
  { to: "/schedule", label: "Schedule", icon: Calendar },
  { to: "/history", label: "History", icon: History },
  { to: "/queue", label: "Queue", icon: Download },
  { to: "/logs", label: "Logs", icon: ScrollText, showLogBadge: true },
  { to: "/system", label: "System", icon: Gauge },
  { to: "/settings", label: "Settings", icon: Settings },
];

export default function Layout() {
  const { logout } = useAuth();
  const queryClient = useQueryClient();
  const [mobileOpen, setMobileOpen] = useState(false);
  // Hook-in once at the Layout level so we get a single polling subscriber
  // for the sidebar badge. Shared cache with the Logs page.
  const logCounts = useLogCounts();

  // Global WS subscriber. PyMedusa emits one QueueItemShow per state change
  // (queued → in-progress → finished); we only invalidate on completion so we
  // don't thrash the cache mid-action. showAdded / showRemoved invalidate the
  // full list — the new or deleted slug may not be known to the cache yet.
  useWebSocket({
    QueueItemShow: (raw) => {
      const item = raw as QueueItemShowData;
      if (item.inProgress !== false) return;
      const slug = item.show?.id?.slug;
      if (!slug) return;
      queryClient.invalidateQueries({ queryKey: ["series", slug] });
    },
    showAdded: (raw) => {
      queryClient.invalidateQueries({ queryKey: ["series"] });
      const slug = (raw as ShowEnvelope)?.id?.slug;
      if (slug) queryClient.invalidateQueries({ queryKey: ["series", slug] });
    },
    showRemoved: () => {
      queryClient.invalidateQueries({ queryKey: ["series"] });
    },
    // Upsert into live-queue cache. Drives the Search Queue section + the
    // Download Handler banner on the Queue page. Items not exposed via
    // /config/system (search, snatch, download handler heartbeat) only exist
    // here as long as the user has the app open.
    QueueItemUpdate: (raw) => {
      const item = raw as LiveQueueItem;
      if (!item.identifier || !item.name) return;
      if (!shouldTrackInLiveQueue(item)) return;

      queryClient.setQueryData<LiveQueueItem[]>(
        LIVE_QUEUE_KEY,
        (prev = []) => {
          const others = prev.filter((i) => i.identifier !== item.identifier);
          return [...others, item];
        },
      );

      // Only auto-clean *successful* finished items. Failures are kept in
      // the cache until the user dismisses them on the Queue page — the
      // queue is the natural place to notice that a long-running task
      // failed, and a vanishing item there means the failure goes unseen
      // (the user noticed `/api/v2/search/manual` failures only via the
      // legacy /errorlogs view because the queue item disappeared). The
      // dismiss control on Queue.tsx writes back to LIVE_QUEUE_KEY.
      // Re-check the cache on fire so a reactivated item (same identifier,
      // new in-progress event) doesn't get removed by a stale timer.
      const finishedOk = item.inProgress === false && item.success === true;
      if (finishedOk) {
        window.setTimeout(() => {
          queryClient.setQueryData<LiveQueueItem[]>(
            LIVE_QUEUE_KEY,
            (prev = []) => {
              const current = prev.find(
                (i) => i.identifier === item.identifier,
              );
              if (!current) return prev;
              if (
                current.inProgress === false &&
                current.success === true
              ) {
                return prev.filter((i) => i.identifier !== item.identifier);
              }
              return prev;
            },
          );
        }, LIVE_QUEUE_EXPIRE_MS);
      }
    },
  });

  return (
    <div className="drawer lg:drawer-open">
      <input
        id="drawer"
        type="checkbox"
        className="drawer-toggle"
        checked={mobileOpen}
        onChange={(e) => setMobileOpen(e.target.checked)}
      />

      <div className="drawer-content flex flex-col bg-base-200">
        <header className="navbar bg-base-300 lg:hidden shadow-sm">
          <div className="flex-none">
            <label htmlFor="drawer" className="btn btn-square btn-ghost">
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </label>
          </div>
          <div className="flex-1 font-bold">Medusa</div>
        </header>

        <main className="p-4 lg:p-6 max-w-7xl mx-auto w-full">
          <Suspense
            fallback={
              <div className="flex justify-center py-20">
                <span className="loading loading-spinner loading-lg" />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </main>
      </div>

      <div className="drawer-side z-40">
        <label
          htmlFor="drawer"
          aria-label="Close sidebar"
          className="drawer-overlay"
        />
        <aside className="bg-base-300 text-base-content min-h-full w-64 p-4 flex flex-col gap-4">
          <div className="text-xl font-bold tracking-tight px-2 pt-2 pb-6">
            🧬 Medusa
          </div>

          <ul className="menu gap-1 w-full">
            {navItems.map((item) => (
              <NavItemRow
                key={item.to}
                item={item}
                logCounts={logCounts}
                onNavigate={() => setMobileOpen(false)}
              />
            ))}
          </ul>

          <div className="flex-1" />

          <LiveStatus />

          <button
            onClick={logout}
            className="btn btn-ghost btn-sm justify-start gap-2"
          >
            <LogOut size={18} /> Logout
          </button>
        </aside>
      </div>
    </div>
  );
}

function NavItemRow({
  item,
  logCounts,
  onNavigate,
}: {
  item: NavItem;
  logCounts: { warnings: number; errors: number };
  onNavigate: () => void;
}) {
  const { to, label, icon: Icon, showLogBadge } = item;
  const { warnings, errors } = logCounts;
  const showBadge = !!showLogBadge && warnings + errors > 0;
  const badgeClass = errors > 0 ? "badge-error" : "badge-warning";
  return (
    <li>
      <NavLink
        to={to}
        end={to === "/"}
        onClick={onNavigate}
        className={({ isActive }) =>
          isActive ? "menu-active font-semibold" : ""
        }
      >
        <Icon size={18} />
        <span className="flex-1">{label}</span>
        {showBadge && (
          <span className={`badge badge-xs ${badgeClass}`}>
            {errors > 0 ? errors : warnings}
          </span>
        )}
      </NavLink>
    </li>
  );
}
