const STATUS_CLASSES: Record<string, string> = {
  Wanted: 'badge-info',
  Snatched: 'badge-warning',
  'Snatched (Proper)': 'badge-warning',
  'Snatched (Best)': 'badge-warning',
  Downloaded: 'badge-success',
  Archived: 'badge-success',
  Skipped: 'badge-ghost',
  Ignored: 'badge-error',
  Unaired: 'badge-ghost',
  Failed: 'badge-error',
}

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`badge badge-xs ${STATUS_CLASSES[status] ?? 'badge-ghost'}`}>
      {status}
    </span>
  )
}
