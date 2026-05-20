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

// Defensive read; payload varies by action.
interface QueueItemShowData {
  inProgress?: boolean;
  success?: boolean | null;
  show?: { id?: { slug?: string } };
}

interface ShowEnvelope {
  id?: { slug?: string };
}

const LIVE_QUEUE_KEY = ["live-queue"] as const;

// Post-process items already come through /config/system; don't double-track.
function shouldTrackInLiveQueue(item: LiveQueueItem): boolean {
  return item.name !== "Post Process";
}

// Successful items linger this long so the user can see the final state.
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
  // One subscriber at Layout level; shared cache with the Logs page.
  const logCounts = useLogCounts();

  // Invalidate on completion only (avoid thrashing mid-action). showAdded /
  // showRemoved invalidate the full list since the slug may be unknown.
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
    // Search / snatch / download-handler items live here as long as the
    // app is open — no HTTP endpoint exposes them.
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

      // Auto-clean successful items only — failures linger until the user
      // dismisses them from the Queue page. Gate on `success === true`
      // alone: PyMedusa keeps `inProgress` true through completion, so
      // checking it would mean nothing ever gets cleaned. Re-check on
      // timer fire to avoid clearing a reactivated item.
      if (item.success === true) {
        window.setTimeout(() => {
          queryClient.setQueryData<LiveQueueItem[]>(
            LIVE_QUEUE_KEY,
            (prev = []) => {
              const current = prev.find(
                (i) => i.identifier === item.identifier,
              );
              if (!current) return prev;
              if (current.success === true) {
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
