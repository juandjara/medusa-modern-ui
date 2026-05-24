import { useWebSocketStatus } from "../lib/websocket";

const VARIANTS = {
  open: {
    dot: "bg-success",
    label: "Connected",
    title: "Receiving live updates from Medusa.",
    pulse: false,
  },
  connecting: {
    dot: "bg-warning",
    label: "Connecting…",
    title: "WebSocket handshake in progress.",
    pulse: true,
  },
  closed: {
    dot: "bg-error",
    label: "Offline",
    title:
      "Connection dropped — auto-reconnect pending. UI falls back to timer-based refresh.",
    pulse: true,
  },
  idle: {
    dot: "bg-base-content/30",
    label: "Idle",
    title:
      "No active connection — no auth token, or socket was torn down on logout.",
    pulse: false,
  },
} as const;

export default function LiveStatus() {
  const status = useWebSocketStatus();
  const v = VARIANTS[status];
  return (
    <div
      className="flex items-center gap-2 px-3 py-1 text-xs text-base-content/60"
      title={v.title}
    >
      <span
        className={`inline-block w-2 h-2 rounded-full ${v.dot} ${v.pulse ? "animate-pulse" : ""}`}
      />
      <span>{v.label}</span>
    </div>
  );
}
