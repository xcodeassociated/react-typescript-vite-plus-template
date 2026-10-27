import { useCallback, useEffect, useRef, useState } from "react"

export interface SseMessage {
  from: string
  to: string
  content: string
}

export type SseConnectionStatus = "connecting" | "connected" | "disconnected"

export interface SseOptions {
  onUpdate?: (message: SseMessage) => void
  onConnect?: () => void
  onError?: (event: Event) => void
  autoReconnect?: boolean
  maxRetries?: number
}

export interface SseState {
  connectionStatus: SseConnectionStatus
  lastMessage: SseMessage | null
  reconnect: () => void
}

const MAX_RETRIES = 5

export function useSimpleSSE(url: string, options: SseOptions = {}): SseState {
  const [connectionStatus, setConnectionStatus] =
    useState<SseConnectionStatus>("connecting")
  const [lastMessage, setLastMessage] = useState<SseMessage | null>(null)

  const eventSourceRef = useRef<EventSource | null>(null)
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryCountRef = useRef(0)
  const optionsRef = useRef(options)
  const connectRef = useRef<() => void>(() => {})

  useEffect(() => {
    optionsRef.current = options
  }, [options])

  const maxAttempts =
    options.autoReconnect === false ? 0 : (options.maxRetries ?? MAX_RETRIES)

  const connect = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current)
      retryTimeoutRef.current = null
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    if (retryCountRef.current >= maxAttempts) {
      setConnectionStatus("disconnected")
      return
    }

    setConnectionStatus("connecting")
    const source = new EventSource(url)
    eventSourceRef.current = source

    source.onopen = () => {
      retryCountRef.current = 0
      setConnectionStatus("connected")
      optionsRef.current.onConnect?.()
    }

    source.addEventListener("update", (event: MessageEvent<string>) => {
      const message = JSON.parse(event.data) as SseMessage
      setLastMessage(message)
      optionsRef.current.onUpdate?.(message)
    })

    source.onerror = (event) => {
      setConnectionStatus("disconnected")
      optionsRef.current.onError?.(event)
      source.close()

      if (retryCountRef.current < maxAttempts) {
        const delay = Math.min(1000 * 2 ** retryCountRef.current, 30_000)
        retryCountRef.current += 1
        retryTimeoutRef.current = setTimeout(() => connectRef.current(), delay)
      }
    }
  }, [url, maxAttempts])

  useEffect(() => {
    connectRef.current = connect
  }, [connect])

  useEffect(() => {
    connect()

    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current)
      }
      eventSourceRef.current?.close()
      eventSourceRef.current = null
      setConnectionStatus("disconnected")
    }
  }, [connect])

  return { connectionStatus, lastMessage, reconnect: connect }
}
