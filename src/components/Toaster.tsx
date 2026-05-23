import { Toaster as SonnerToaster } from "sonner";

// Toast surface for server-pushed `notification` WS events and any in-app
// pushToast() callers. Sonner handles stacking, swipe-to-dismiss, and
// hover-to-pause; we just position it and pick the theme.
export default function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      richColors
      closeButton
      theme="system"
      toastOptions={{
        duration: 5_000,
      }}
    />
  );
}
