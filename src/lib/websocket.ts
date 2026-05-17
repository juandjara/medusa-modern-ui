import { useEffect, useState, useCallback, useEffectEvent } from 'react'
import { useAuth } from './auth'

// Connection state, exposed via useWebSocketStatus() so the UI can surface it.
//   idle       — no token, socket never opened (or torn down on logout)
//   connecting — handshake in progress
//   open       — connected, dispatching events
//   closed     — socket dropped; auto-reconnect timer pending if token present
export type WsStatus = 'idle' | 'connecting' | 'open' | 'closed'

// Message envelope from PyMedusa's WebSocket. The Python side emits via
// `ws.Message(event, data).push()` (medusa/ws/__init__.py); the JSON shape is
// `{ event: '<name>', data: <payload> }`. The handler key is `event`, NOT
// `type` — getting this wrong silently swallows every message.
interface WsMessage {
  event: string
  data: unknown
}

type MessageHandler = (data: unknown) => void
type Dispatcher = (event: string, data: unknown) => void

// Module-singleton state. One socket per browser tab, fan-out to N subscribers
// — components register handlers, the socket itself is shared. Reconnect is
// best-effort: 5s fixed delay, only while a token is present.
let socket: WebSocket | null = null
let reconnectTimer: number | null = null
const dispatchers = new Set<Dispatcher>()

let currentStatus: WsStatus = 'idle'
const statusListeners = new Set<(s: WsStatus) => void>()

function setStatus(s: WsStatus) {
  if (currentStatus === s) return
  currentStatus = s
  for (const fn of statusListeners) fn(s)
}

// PyMedusa's WS handler is mounted at `{WEB_ROOT}/ws/ui` per
// medusa/server/core.py:215 — not at `/ws`. We assume the default
// empty WEB_ROOT; if a user runs Medusa behind a subpath, this needs
// to become configurable.
function buildUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws/ui`
}

function ensureSocket() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return
  }
  if (reconnectTimer !== null) {
    window.clearTimeout(reconnectTimer)
    reconnectTimer = null
  }

  setStatus('connecting')
  const s = new WebSocket(buildUrl())
  socket = s

  s.onopen = () => {
    if (socket === s) setStatus('open')
  }

  s.onmessage = (evt) => {
    let msg: WsMessage
    try {
      msg = JSON.parse(evt.data) as WsMessage
    } catch {
      return
    }
    if (typeof msg.event !== 'string') return
    for (const dispatch of dispatchers) {
      try {
        dispatch(msg.event, msg.data)
      } catch (err) {
        console.error('WS dispatcher threw', err)
      }
    }
  }

  s.onclose = () => {
    if (socket !== s) return
    socket = null
    setStatus('closed')
    // Auto-reconnect while there's still a token. Logout clears the token,
    // which causes the subscribing component to no longer call ensureSocket.
    if (sessionStorage.getItem('medusa_token')) {
      reconnectTimer = window.setTimeout(ensureSocket, 5_000)
    }
  }

  s.onerror = () => {
    // onclose will fire after this; reconnect there.
  }
}

function teardownSocket() {
  if (reconnectTimer !== null) {
    window.clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  socket?.close()
  socket = null
  setStatus('idle')
}

export function useWebSocket(handlers: Record<string, MessageHandler>) {
  const { token } = useAuth()

  // Stable dispatcher that always reads the latest handlers map. Lets us
  // register with the singleton once per mount without reconnecting on
  // every render of the consumer component.
  const dispatch = useEffectEvent((event: string, data: unknown) => {
    handlers[event]?.(data)
  })

  useEffect(() => {
    if (!token) {
      teardownSocket()
      return
    }
    ensureSocket()
    const subscriber: Dispatcher = (event, data) => dispatch(event, data)
    dispatchers.add(subscriber)
    return () => {
      dispatchers.delete(subscriber)
    }
  }, [token])

  const send = useCallback((data: unknown) => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(data))
    }
  }, [])

  return { send }
}

export function useWebSocketStatus(): WsStatus {
  const [status, set] = useState<WsStatus>(currentStatus)
  useEffect(() => {
    // Resync immediately in case state changed between render and effect.
    set(currentStatus)
    statusListeners.add(set)
    return () => {
      statusListeners.delete(set)
    }
  }, [])
  return status
}
