import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'

export default function Login() {
  const { isAuthenticated, login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (isAuthenticated) return <Navigate to="/" replace />

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-base-200">
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          setError(null)
          setSubmitting(true)
          try {
            await login(username, password)
            navigate('/', { replace: true })
          } catch {
            setError('Invalid username or password')
          } finally {
            setSubmitting(false)
          }
        }}
        className="card bg-base-100 shadow-xl w-full max-w-sm p-6 space-y-4"
      >
        <h1 className="text-2xl font-bold text-center">🧬 Medusa</h1>

        <label className="form-control">
          <span className="label-text">Username</span>
          <input
            className="input input-bordered"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            required
          />
        </label>

        <label className="form-control">
          <span className="label-text">Password</span>
          <input
            type="password"
            className="input input-bordered"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        {error && <div className="alert alert-soft alert-error text-sm py-2">{error}</div>}

        <button
          type="submit"
          className="btn btn-primary w-full"
          disabled={submitting}
        >
          {submitting ? (
            <span className="loading loading-spinner loading-sm" />
          ) : (
            'Log in'
          )}
        </button>
      </form>
    </div>
  )
}
