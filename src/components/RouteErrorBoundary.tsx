import { useRouteError } from 'react-router-dom'
import ErrorFallback from './ErrorFallback'

export default function RouteErrorBoundary() {
  const error = useRouteError()
  return <ErrorFallback error={error} />
}
