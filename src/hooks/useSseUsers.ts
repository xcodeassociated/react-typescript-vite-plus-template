import { useCallback, useEffect, useRef, useState } from "react"

import { getAccessToken } from "@/providers/keycloak"

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
   * stream stays closed; flipping to true connects with a fresh token. */
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
// Liveness watchdog: the server sends a heartbeat every 10 s, so silence for
// 3+ intervals means the stream is dead even though the socket never errored
// (half-open connection after a proxy/server restart). Without this, a
// stalled reader would hang in "connected" forever.
const LIVENESS_TIMEOUT_MS = 45_000

/**
 * Parse one SSE frame ("event: x\ndata: y") into its event name and data.
 * Defaults to "message" when no `event:` line is present; `data:` values keep
 * one optional leading space (WHATWG SSE field parsing).
 */
function parseFrame(frame: string): { event: string; data: string } {
  let event = "message"
  const dataLines: string[] = []
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim()
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).replace(/^ /, ""))
    }
  }
  return { event, data: dataLines.join("\n") }
}

/**
 * Browser SSE client for `GET /update/user`, authorized with a bearer header.
 *
 * EventSource is deliberately NOT used: it cannot send an Authorization
 * header, which is what forced the old one-time-ticket handshake. A fetch
 * stream can, so the access token rides a header like every other request
 * and never appears in a URL (RFC 9700 §4.3.2); tickets are a WebSocket-only
 * concern now (ADR-0002 amendment).
 *
 * Contract (server-side lifecycle unchanged):
 * - every connect/reconnect resolves a FRESH token via getAccessToken()
 *   (proactive refresh), so an idle-then-reconnect never replays an expired
 *   bearer;
 * - `token_expired` (token ceiling passed mid-stream) → reconnect immediately
 *   with a refreshed token;
 * - `logged_out` (session revoked via Keycloak→Kafka) → close and stop, never
 *   reconnect — the UI must show the logged-out state;
 * - `heartbeat` doubles as the liveness signal; `update` carries broadcasts.
 */
export function useSimpleSSE(url: string, options: SseOptions = {}): SseState {
  const [connectionStatus, setConnectionStatus] =
    useState<SseConnectionStatus>("connecting")
  const [lastMessage, setLastMessage] = useState<SseMessage | null>(null)

  const controllerRef = useRef<AbortController | null>(null)
  const statusRef = useRef<SseConnectionStatus>(connectionStatus)
  const genRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const livenessRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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
    if (livenessRef.current !== null) {
      clearTimeout(livenessRef.current)
      livenessRef.current = null
    }
    if (controllerRef.current) {
      controllerRef.current.abort()
      controllerRef.current = null
    }
  }, [])

  /** Reconnect after `delayMs` — always with a freshly resolved token. */
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
    // Generation guard: only the newest attempt may keep a stream. Without
    // it, two overlapping attempts (StrictMode double-effect, backoff timer
    // racing a wake/manual reconnect) could both pass the awaits and leak a
    // second live stream reading the same endpoint.
    const myGen = (genRef.current += 1)
    const controller = new AbortController()
    controllerRef.current = controller

    // getAccessToken() refreshes proactively, so a reconnect after idle never
    // sends an expired bearer.
    let token: string | undefined
    try {
      token = await getAccessToken()
    } catch {
      // Session lost mid-refresh: real session loss flips the app's auth state
      // (onAuthLogout) and closes the gate; here just back off.
      if (!stoppedRef.current && enabledRef.current) {
        retryWithBackoff()
      }
      return
    }
    if (stoppedRef.current || !enabledRef.current || myGen !== genRef.current) {
      // unmounted, gated off, or superseded by a newer attempt while the
      // token refresh was in flight
      return
    }

    let response: Response
    try {
      response = await fetch(url, {
        method: "GET",
        headers: {
          accept: "text/event-stream",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        signal: controller.signal,
      })
    } catch {
      // Transport failure or our own abort (closeStream/unmount): a session
      // that is actually gone surfaces as 401 or via the auth gate closing.
      if (
        !stoppedRef.current &&
        enabledRef.current &&
        myGen === genRef.current
      ) {
        retryWithBackoff()
      }
      return
    }
    if (stoppedRef.current || !enabledRef.current || myGen !== genRef.current) {
      // superseded while the request was in flight — drop this stream
      controller.abort()
      return
    }
    if (!response.ok || !response.body) {
      // 401/403 (revoked or expired session), 5xx, or a body-less 200: treat
      // like a transport error — the auth provider remains the source of truth
      // for whether the session is really gone.
      retryWithBackoff()
      return
    }

    retryCountRef.current = 0
    setConnectionStatus("connected")
    optionsRef.current.onConnect?.()

    // Liveness watchdog: re-armed on every inbound frame. The server pings a
    // heartbeat every 10 s, so if nothing arrives for LIVENESS_TIMEOUT_MS the
    // stream is silently dead (half-open socket) — force a reconnect. Only the
    // current attempt's stream can trip it.
    const armLiveness = () => {
      if (livenessRef.current !== null) {
        clearTimeout(livenessRef.current)
      }
      livenessRef.current = setTimeout(() => {
        if (
          !stoppedRef.current &&
          enabledRef.current &&
          myGen === genRef.current &&
          controllerRef.current === controller
        ) {
          closeStream()
          retryWithBackoff()
        }
      }, LIVENESS_TIMEOUT_MS)
    }
    armLiveness()

    // Dispatch one parsed SSE frame. Named events carry the stream contract:
    // heartbeat = liveness, update = broadcast, token_expired = reauth (refresh
    // via the next attempt's getAccessToken), logged_out = stop forever.
    const dispatch = (event: string, data: string) => {
      switch (event) {
        case "heartbeat":
          armLiveness()
          setConnectionStatus("connected")
          break
        case "update":
          armLiveness()
          try {
            const message = JSON.parse(data) as SseMessage
            setLastMessage(message)
            optionsRef.current.onUpdate?.(message)
          } catch {
            // malformed broadcast: ignore it, keep the stream — never let one
            // bad frame throw inside the read loop
          }
          break
        case "token_expired":
          closeStream()
          retryCountRef.current = 0
          scheduleReconnect(0)
          break
        case "logged_out":
          stoppedRef.current = true
          closeStream()
          setConnectionStatus("logged_out")
          optionsRef.current.onLoggedOut?.()
          break
      }
    }

    // Read loop: decode + split frames on blank lines until the stream ends
    // (server restart, network drop) or we abort (close/unmount/contract).
    void (async () => {
      const decoder = new TextDecoder()
      const reader = response.body!.getReader()
      let buffer = ""
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buffer = (buffer + decoder.decode(value, { stream: true })).replace(
            /\r\n/g,
            "\n"
          )
          let boundary = buffer.indexOf("\n\n")
          while (boundary !== -1) {
            const frame = buffer.slice(0, boundary)
            buffer = buffer.slice(boundary + 2)
            if (frame.trim() !== "") {
              const { event, data } = parseFrame(frame)
              dispatch(event, data)
              if (
                stoppedRef.current ||
                myGen !== genRef.current ||
                controllerRef.current !== controller
              ) {
                return // logged_out / superseded / closed by the handler above
              }
            }
            boundary = buffer.indexOf("\n\n")
          }
        }
      } catch {
        // aborted (closeStream/unmount) or dropped mid-read: fall through to
        // the reconnect path below
      }
      if (
        !stoppedRef.current &&
        enabledRef.current &&
        myGen === genRef.current &&
        controllerRef.current === controller
      ) {
        // stream ended on its own (server restart, proxy idle timeout)
        retryWithBackoff()
      }
    })()
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
  // again), reset the budget and reconnect with a fresh token. A revoked
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
      statusRef.current === "logged_out" // revoked session: a retry would only 401
    ) {
      return
    }
    stoppedRef.current = false
    retryCountRef.current = 0
    attemptRef.current()
  }, [])

  return { connectionStatus, lastMessage, reconnect }
}
