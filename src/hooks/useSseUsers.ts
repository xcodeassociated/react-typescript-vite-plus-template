import { useCallback, useEffect, useRef, useState } from "react"

import { mintTicket } from "@/lib/ticket"

export interface SseMessage {
  from: string
  to: string
  content: string
}

export type SseConnectionStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "logged_out"

export interface SseOptions {
  onUpdate?: (message: SseMessage) => void
  onConnect?: () => void
  /** Fired when the server revoked the session (`logged_out` event). */
  onLoggedOut?: () => void
  autoReconnect?: boolean
  maxRetries?: number
  /** Gate the connection on app state (e.g. authentication). While false the
   * stream stays closed; flipping to true connects with a fresh ticket. */
  enabled?: boolean
}

export interface SseState {
  connectionStatus: SseConnectionStatus
  lastMessage: SseMessage | null
  reconnect: () => void
}

const MAX_RETRIES = 5
const RETRY_BASE_MS = 1000
const RETRY_MAX_MS = 30_000

/**
 * Browser SSE client for `GET /update/user` using the one-time-ticket
 * handshake (the stream is no longer public).
 *
 * Contract (mirrors the backend's web/sse.html reference):
 * - every connect/reconnect MINTS A FRESH ticket — the ticket in the URL is
 *   redeemed at connect, so replaying it (what EventSource's own auto-reconnect
 *   does) would 401-loop; on `error` we therefore close() and take over;
 * - `token_expired` (mint-time token ceiling passed) → refresh + re-mint +
 *   reconnect immediately;
 * - `logged_out` (session revoked via Keycloak→Kafka) → close and stop, never
 *   reconnect — the UI must show the logged-out state;
 * - `heartbeat` doubles as the liveness signal; `update` carries broadcasts.
 */
export function useSimpleSSE(url: string, options: SseOptions = {}): SseState {
  const [connectionStatus, setConnectionStatus] =
    useState<SseConnectionStatus>("connecting")
  const [lastMessage, setLastMessage] = useState<SseMessage | null>(null)

  const sourceRef = useRef<EventSource | null>(null)
  const statusRef = useRef<SseConnectionStatus>(connectionStatus)
  const genRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryCountRef = useRef(0)
  const stoppedRef = useRef(false)
  const mountedRef = useRef(false)
  const optionsRef = useRef(options)
  const attemptRef = useRef<() => void>(() => {})

  useEffect(() => {
    optionsRef.current = options
  }, [options])

  useEffect(() => {
    statusRef.current = connectionStatus
  }, [connectionStatus])

  const maxAttempts =
    options.autoReconnect === false ? 0 : (options.maxRetries ?? MAX_RETRIES)
  const maxAttemptsRef = useRef(maxAttempts)
  useEffect(() => {
    maxAttemptsRef.current = maxAttempts
  }, [maxAttempts])

  const enabled = options.enabled !== false
  const enabledRef = useRef(enabled)
  useEffect(() => {
    enabledRef.current = enabled
  }, [enabled])

  const closeStream = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (sourceRef.current) {
      sourceRef.current.close()
      sourceRef.current = null
    }
  }, [])

  /** Reconnect after `delayMs` — always with a freshly minted ticket. */
  const scheduleReconnect = useCallback((delayMs: number) => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
    }
    setConnectionStatus("reconnecting")
    timerRef.current = setTimeout(() => attemptRef.current(), delayMs)
  }, [])

  const retryWithBackoff = useCallback(() => {
    if (retryCountRef.current >= maxAttemptsRef.current) {
      setConnectionStatus("disconnected")
      return
    }
    const delay = Math.min(
      RETRY_BASE_MS * 2 ** retryCountRef.current,
      RETRY_MAX_MS
    )
    retryCountRef.current += 1
    scheduleReconnect(delay)
  }, [scheduleReconnect])

  const attempt = useCallback(async () => {
    if (stoppedRef.current) {
      return
    }
    closeStream()
    if (!enabled) {
      // Stay honest about WHY we are closed: a revoked session keeps showing
      // "logged_out" instead of being downgraded to a retryable disconnected.
      setConnectionStatus((previous) =>
        previous === "logged_out" ? previous : "disconnected"
      )
      return
    }
    if (retryCountRef.current >= maxAttemptsRef.current) {
      setConnectionStatus("disconnected")
      return
    }

    setConnectionStatus("connecting")
    // Generation guard: only the newest attempt may open a stream. Without
    // it, two overlapping attempts (StrictMode double-effect, backoff timer
    // racing a wake/manual reconnect) both pass the await and leak a second
    // EventSource whose auto-reconnect replays its redeemed ticket (401 loop).
    const myGen = (genRef.current += 1)
    let ticket: string
    try {
      ;({ ticket } = await mintTicket("sse"))
    } catch {
      // Backend hiccup or lost session: real session loss flips the app's
      // auth state (onAuthLogout) and unmounts this page; here just back off.
      if (!stoppedRef.current && enabledRef.current) {
        retryWithBackoff()
      }
      return
    }
    if (stoppedRef.current || !enabledRef.current || myGen !== genRef.current) {
      // unmounted, gated off, or superseded by a newer attempt while the mint
      // was in flight — this single-use ticket simply expires unused
      return
    }

    const source = new EventSource(
      `${url}?ticket=${encodeURIComponent(ticket)}`
    )
    sourceRef.current = source

    source.onopen = () => {
      retryCountRef.current = 0
      setConnectionStatus("connected")
      optionsRef.current.onConnect?.()
    }

    // The first heartbeat arrives immediately on subscribe, then ~every 10 s.
    source.addEventListener("heartbeat", () => {
      setConnectionStatus("connected")
    })

    source.addEventListener("update", (event: MessageEvent<string>) => {
      try {
        const message = JSON.parse(event.data) as SseMessage
        setLastMessage(message)
        optionsRef.current.onUpdate?.(message)
      } catch {
        // malformed broadcast: ignore it, keep the stream (reference client
        // behavior — never let one bad frame throw inside a listener)
      }
    })

    // Mint-time token ceiling passed: refresh (via the next mint's
    // getAccessToken), re-mint and reconnect right away.
    source.addEventListener("token_expired", () => {
      closeStream()
      retryCountRef.current = 0
      scheduleReconnect(0)
    })

    // Session revoked: stop forever — a re-mint would only 401.
    source.addEventListener("logged_out", () => {
      stoppedRef.current = true
      closeStream()
      setConnectionStatus("logged_out")
      optionsRef.current.onLoggedOut?.()
    })

    // Transport error: EventSource would auto-reconnect replaying the used
    // ticket (401 loop) — take over and reconnect with a fresh one.
    source.onerror = () => {
      if (stoppedRef.current || sourceRef.current !== source) {
        return
      }
      closeStream()
      retryWithBackoff()
    }
  }, [url, enabled, closeStream, scheduleReconnect, retryWithBackoff])

  useEffect(() => {
    attemptRef.current = () => {
      void attempt()
    }
  }, [attempt])

  useEffect(() => {
    stoppedRef.current = false
    mountedRef.current = true
    attemptRef.current()

    return () => {
      mountedRef.current = false
      stoppedRef.current = true
      closeStream()
    }
  }, [attempt, closeStream])

  // Wake-up recovery: after sleep/offline the retry budget may be exhausted
  // while the session is fine, leaving the stream parked in "disconnected".
  // When connectivity returns (browser "online", or the tab becomes visible
  // again), reset the budget and reconnect with a fresh ticket. A revoked
  // (logged_out) or unmounted stream is never resurrected.
  useEffect(() => {
    const recover = () => {
      if (
        stoppedRef.current ||
        !enabledRef.current ||
        maxAttemptsRef.current <= 0 ||
        statusRef.current !== "disconnected"
      ) {
        return
      }
      retryCountRef.current = 0
      attemptRef.current()
    }
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        recover()
      }
    }
    window.addEventListener("online", recover)
    // Page Lifecycle "resume": a laptop waking from sleep fires this even
    // when no online/visibilitychange accompanies it.
    window.addEventListener("resume", recover)
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      window.removeEventListener("online", recover)
      window.removeEventListener("resume", recover)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [])

  const reconnect = useCallback(() => {
    if (
      !mountedRef.current ||
      statusRef.current === "logged_out" // revoked session: a re-mint would only 401
    ) {
      return
    }
    stoppedRef.current = false
    retryCountRef.current = 0
    attemptRef.current()
  }, [])

  return { connectionStatus, lastMessage, reconnect }
}
