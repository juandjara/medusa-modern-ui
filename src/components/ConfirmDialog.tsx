import { useEffect, useRef, useEffectEvent, type ReactNode } from 'react'

interface Props {
  open: boolean
  title: string
  body: ReactNode
  confirmLabel: string
  variant?: 'normal' | 'danger'
  onConfirm: () => void
  onClose: () => void
}

export default function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  variant = 'normal',
  onConfirm,
  onClose,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, [open])

  // Sync parent when the dialog closes natively (ESC, backdrop click, or the
  // Cancel button submitting the form). useEffectEvent keeps the listener
  // attached once while always reading the latest onClose.
  const handleNativeClose = useEffectEvent(() => onClose())
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const listener = () => handleNativeClose()
    dialog.addEventListener('close', listener)
    return () => dialog.removeEventListener('close', listener)
  }, [])

  return (
    <dialog ref={dialogRef} className="modal" aria-labelledby="confirm-title">
      <div className="modal-box max-w-md">
        <h3 id="confirm-title" className="font-bold text-lg mb-2">
          {title}
        </h3>
        <div className="text-sm text-base-content/80 space-y-2">{body}</div>
        <div className="modal-action">
          <form method="dialog">
            <button type="submit" className="btn btn-sm btn-ghost">
              Cancel
            </button>
          </form>
          <button
            type="button"
            className={`btn btn-sm ${
              variant === 'danger' ? 'btn-error' : 'btn-primary'
            }`}
            onClick={() => {
              onConfirm()
              dialogRef.current?.close()
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button aria-label="Close dialog">close</button>
      </form>
    </dialog>
  )
}
