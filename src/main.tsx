import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary'
import { router } from './routes'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

function FallbackUI({ error, resetErrorBoundary }: FallbackProps) {
  const message = error instanceof Error ? error.message : String(error)
  return (
    <div role="alert" className="p-8 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
      <pre className="text-xs bg-base-200 p-3 rounded overflow-x-auto">
        {message}
      </pre>
      <button
        className="btn btn-primary btn-sm mt-4"
        onClick={resetErrorBoundary}
      >
        Try again
      </button>
    </div>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary FallbackComponent={FallbackUI}>
        <RouterProvider router={router} />
      </ErrorBoundary>
    </QueryClientProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
