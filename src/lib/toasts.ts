import { toast } from "sonner";

// Server-pushed `notification` WS events (ui.py:104) and any in-app
// pushToast() callers land here. Thin wrapper over sonner so call sites
// don't depend on the library directly.
export type ToastType = "notice" | "error";

export interface PushToastInput {
  title: string;
  body?: string;
  type: ToastType;
  // Backend `hash` from Notification.data — used as sonner's id so a repeat
  // push with the same hash updates the existing toast rather than stacking.
  hash?: number;
}

export function pushToast(t: PushToastInput): string | number {
  const opts = {
    description: t.body,
    id: t.hash !== undefined ? `n-${t.hash}` : undefined,
  };
  return t.type === "error"
    ? toast.error(t.title, opts)
    : toast.info(t.title, opts);
}
