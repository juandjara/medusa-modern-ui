import { TriangleAlert, RefreshCw, Home, RotateCcw } from 'lucide-react'

interface Props {
  error: unknown
  onReset?: () => void
}

interface FormattedError {
  message: string
  stack?: string
}

function formatError(error: unknown): FormattedError {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack }
  }
  if (error && typeof error === 'object' && 'status' in error) {
    const e = error as { status: number; statusText?: string; data?: unknown }
    const detail = typeof e.data === 'string' ? e.data : ''
    const status = `${e.status} ${e.statusText ?? ''}`.trim()
    return { message: detail ? `${status} — ${detail}` : status }
  }
  return { message: String(error) }
}

export default function ErrorFallback({ error, onReset }: Props) {
  const { message, stack } = formatError(error)

  return (
    <div
      role="alert"
      className="min-h-screen flex items-center justify-center p-4 bg-base-200"
    >
      <section className="card bg-base-100 border border-base-300 rounded-box shadow-sm w-full max-w-xl">
        <div className="card-body p-6 space-y-4">
          <header className="flex items-start gap-3">
            <TriangleAlert
              size={28}
              className="text-error shrink-0 mt-0.5"
              aria-hidden
            />
            <div className="space-y-1">
              <h1 className="text-xl font-bold leading-tight">
                Something went wrong
              </h1>
              <p className="text-sm text-base-content/70">
                The UI hit an unexpected error and couldn't continue rendering.
              </p>
            </div>
          </header>

          <div className="alert alert-soft alert-error text-sm">
            <span className="font-mono break-all">{message}</span>
          </div>

          {import.meta.env.DEV && stack ? (
            <details className="group">
              <summary className="cursor-pointer text-xs font-semibold text-base-content/70 hover:text-base-content select-none">
                Stack trace
              </summary>
              <pre className="mt-2 text-[11px] leading-relaxed bg-base-200 text-base-content/80 p-3 rounded-box overflow-x-auto max-h-72">
                {stack}
              </pre>
            </details>
          ) : null}

          <div className="card-actions justify-end pt-2 flex-wrap">
            <a href="/" className="btn btn-sm btn-ghost">
              <Home size={14} aria-hidden />
              Go home
            </a>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => window.location.reload()}
            >
              <RefreshCw size={14} aria-hidden />
              Reload
            </button>
            {onReset ? (
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={onReset}
              >
                <RotateCcw size={14} aria-hidden />
                Try again
              </button>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  )
}
