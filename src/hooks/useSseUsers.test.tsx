import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { act, cleanup, renderHook } from "@testing-library/react"

// Bearer discipline is what this tests: every connect/reconnect resolves a
// FRESH token via getAccessToken (proactive refresh), token_expired reconnects
// immediately with a refreshed token, logged_out stops forever. No tickets —
// the stream is fetch-based (ADR-0002 amendment).
const getAccessToken = vi.hoisted(() =>
  vi.fn<() => Promise<string | null>>(async () => "test-token")
)

vi.mock("@/providers/keycloak", () => ({ getAccessToken }))

import { useSimpleSSE } from "@/hooks/useSseUsers"

const STREAM_URL = "http://backend.test/update/user"
const encoder = new TextEncoder()

/** Controllable fetch/stream fake: records calls, lets tests resolve the
 * response, push SSE frames, and observe abort() on the request signal. */
class FakeStream {
  static instances: FakeStream[] = []
  url: string
  init: RequestInit
  body: ReadableStream<Uint8Array>
  closeCalls = 0
  opened = false
  private controller!: ReadableStreamDefaultController<Uint8Array>
  private resolveResponse!: (r: Response) => void
  private rejectResponse!: (e: unknown) => void
  private responseSettled = false
  responsePromise: Promise<Response>

  constructor(url: string, init: RequestInit) {
    this.url = url
    this.init = init
    this.body = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.controller = controller
      },
    })
    this.responsePromise = new Promise<Response>((resolve, reject) => {
      this.resolveResponse = resolve
      this.rejectResponse = reject
    })
    init.signal?.addEventListener("abort", () => {
      this.closeCalls += 1
      if (!this.responseSettled) {
        this.settle(() => this.rejectResponse(new Error("aborted")))
      } else {
        this.errorStream()
      }
    })
    FakeStream.instances.push(this)
  }

  private settle(fn: () => void): void {
    this.responseSettled = true
    act(() => fn())
  }

  /** Headers arrive OK — the hook treats this as "open" (and fires onConnect). */
  fireOpen(status = 200): void {
    this.opened = true
    this.settle(() =>
      this.resolveResponse({
        ok: status >= 200 && status < 400,
        status,
        body: this.body,
      } as unknown as Response)
    )
  }

  /** Server answered with an error status (401/403/5xx). */
  fireStatus(status: number): void {
    this.settle(() =>
      this.resolveResponse({
        ok: false,
        status,
        body: null,
      } as unknown as Response)
    )
  }

  /** Transport failure before headers arrive. */
  fireError(): void {
    this.settle(() => this.rejectResponse(new TypeError("network down")))
  }

  /** Push one SSE frame into the open stream. */
  fire(event: string, data = ""): void {
    act(() => {
      this.controller.enqueue(
        encoder.encode(`event: ${event}\ndata: ${data}\n\n`)
      )
    })
  }

  /** Stream dies mid-body (server restart, dropped connection). */
  failBody(): void {
    act(() => {
      this.controller.error(new TypeError("network down"))
    })
  }

  /** Server ends the stream cleanly (idle timeout, shutdown). */
  endBody(): void {
    act(() => {
      this.controller.close()
    })
  }

  private errorStream(): void {
    try {
      this.controller.error(new Error("aborted"))
    } catch {
      // already closed/errored — the abort was a no-op for the body
    }
  }
}

vi.stubGlobal("fetch", (input: string | URL, init: RequestInit = {}) => {
  const stream = new FakeStream(String(input), init)
  return stream.responsePromise
})

function lastStream(): FakeStream {
  return FakeStream.instances[FakeStream.instances.length - 1]
}

async function flush(ms = 0): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  FakeStream.instances = []
  getAccessToken.mockImplementation(async () => "test-token")
})

afterEach(() => {
  cleanup() // unmount hooks so their recovery listeners do not leak across tests
  vi.useRealTimers()
})

describe("useSimpleSSE bearer flow", () => {
  it("resolves a fresh token and opens the stream with an Authorization header", async () => {
    const { result } = renderHook(() => useSimpleSSE(STREAM_URL))
    await flush()

    expect(getAccessToken).toHaveBeenCalledTimes(1)
    expect(FakeStream.instances).toHaveLength(1)
    expect(FakeStream.instances[0].url).toBe(STREAM_URL)
    const headers = FakeStream.instances[0].init.headers as Record<
      string,
      string
    >
    expect(headers.authorization).toBe("Bearer test-token")
    expect(headers.accept).toBe("text/event-stream")
    expect(result.current.connectionStatus).toBe("connecting")
  })

  it("reports connected on open/heartbeat and forwards update events", async () => {
    const onUpdate = vi.fn()
    const { result } = renderHook(() => useSimpleSSE(STREAM_URL, { onUpdate }))
    await flush()

    const stream = lastStream()
    stream.fireOpen()
    await flush()
    expect(result.current.connectionStatus).toBe("connected")

    const message = { from: "SYSTEM", to: "ALL", content: "USER_CREATED: 42" }
    stream.fire("heartbeat", JSON.stringify(message))
    await flush()
    expect(result.current.connectionStatus).toBe("connected")

    stream.fire("update", JSON.stringify(message))
    await flush()
    expect(result.current.lastMessage).toEqual(message)
    expect(onUpdate).toHaveBeenCalledWith(message)
  })

  it("reconnects after a mid-stream failure with a FRESH token", async () => {
    const { result } = renderHook(() => useSimpleSSE(STREAM_URL))
    await flush()

    const first = lastStream()
    first.fireOpen()
    await flush()
    first.failBody()
    await flush()
    expect(result.current.connectionStatus).toBe("reconnecting")

    getAccessToken.mockResolvedValue("refreshed-token")
    await flush(1000) // exponential backoff step
    expect(getAccessToken).toHaveBeenCalledTimes(2)
    expect(FakeStream.instances).toHaveLength(2)
    const second = lastStream()
    const headers = second.init.headers as Record<string, string>
    expect(headers.authorization).toBe("Bearer refreshed-token")
  })

  it("a 401 answer backs off like any transport error", async () => {
    const { result } = renderHook(() => useSimpleSSE(STREAM_URL))
    await flush()

    lastStream().fireStatus(401)
    await flush()
    expect(result.current.connectionStatus).toBe("reconnecting")
  })

  it("token_expired reconnects immediately with a refreshed token", async () => {
    const { result } = renderHook(() => useSimpleSSE(STREAM_URL))
    await flush()

    const first = lastStream()
    first.fireOpen()
    await flush()
    first.fire(
      "token_expired",
      JSON.stringify({ from: "SYSTEM", to: "ALL", content: "token_expired" })
    )
    getAccessToken.mockResolvedValue("refreshed-token") // reauth resolves fresh
    await flush()
    expect(first.closeCalls).toBeGreaterThan(0) // aborted before reconnect

    await flush(0) // no backoff on reauth
    expect(getAccessToken).toHaveBeenCalledTimes(2)
    const headers = lastStream().init.headers as Record<string, string>
    expect(headers.authorization).toBe("Bearer refreshed-token")
    expect(result.current.connectionStatus).toBe("connecting")
  })

  it("logged_out stops the stream and NEVER reconnects", async () => {
    const onLoggedOut = vi.fn()
    const { result } = renderHook(() =>
      useSimpleSSE(STREAM_URL, { onLoggedOut })
    )
    await flush()

    const stream = lastStream()
    stream.fireOpen()
    await flush()
    stream.fire(
      "logged_out",
      JSON.stringify({ from: "SYSTEM", to: "ALL", content: "logged_out" })
    )
    await flush()

    expect(result.current.connectionStatus).toBe("logged_out")
    expect(onLoggedOut).toHaveBeenCalledOnce()
    expect(stream.closeCalls).toBeGreaterThan(0)

    await flush(120_000) // far beyond any backoff window
    expect(getAccessToken).toHaveBeenCalledTimes(1)
    expect(FakeStream.instances).toHaveLength(1)
  })

  it("gives up after maxRetries and manual reconnect fetches with a fresh token", async () => {
    const { result } = renderHook(() =>
      useSimpleSSE(STREAM_URL, { maxRetries: 1 })
    )
    await flush()

    lastStream().fireError()
    await flush(1000)
    expect(result.current.connectionStatus).toBe("disconnected")
    // maxRetries: 1 = one connect attempt total; giving up does not re-fetch
    expect(getAccessToken).toHaveBeenCalledTimes(1)

    getAccessToken.mockResolvedValue("refreshed-token")
    act(() => result.current.reconnect())
    await flush()
    expect(getAccessToken).toHaveBeenCalledTimes(2)
    const headers = lastStream().init.headers as Record<string, string>
    expect(headers.authorization).toBe("Bearer refreshed-token")
  })

  it("closes the stream on unmount and stops retrying", async () => {
    const { unmount } = renderHook(() => useSimpleSSE(STREAM_URL))
    await flush()

    const stream = lastStream()
    stream.fireOpen()
    await flush()
    unmount()
    expect(stream.closeCalls).toBe(1)

    stream.fireError() // late error after unmount must not restart anything
    await flush(60_000)
    expect(FakeStream.instances).toHaveLength(1)
    expect(getAccessToken).toHaveBeenCalledTimes(1)
  })

  it("recovers with a fresh token when the network returns after giving up", async () => {
    const { result } = renderHook(() =>
      useSimpleSSE(STREAM_URL, { maxRetries: 1 })
    )
    await flush()

    // Sleep/offline: drop and burn the budget -> parked "disconnected".
    lastStream().fireError()
    await flush(1000)
    expect(result.current.connectionStatus).toBe("disconnected")

    // Wake-up: browser reports online -> budget reset, fresh token.
    getAccessToken.mockResolvedValue("refreshed-token")
    act(() => {
      window.dispatchEvent(new Event("online"))
    })
    await flush()
    expect(getAccessToken).toHaveBeenCalledTimes(2)
    expect(result.current.connectionStatus).toBe("connecting")
  })

  it("recovers when a parked stream's tab becomes visible again", async () => {
    const { result } = renderHook(() =>
      useSimpleSSE(STREAM_URL, { maxRetries: 1 })
    )
    await flush()
    lastStream().fireError()
    await flush(1000)
    expect(result.current.connectionStatus).toBe("disconnected")

    act(() => {
      Object.defineProperty(document, "visibilityState", {
        value: "visible",
        configurable: true,
      })
      document.dispatchEvent(new Event("visibilitychange"))
    })
    await flush()
    expect(getAccessToken).toHaveBeenCalledTimes(2)
    expect(FakeStream.instances).toHaveLength(2)
  })

  it("online/visibility events NEVER resurrect a logged-out stream", async () => {
    const { result } = renderHook(() => useSimpleSSE(STREAM_URL))
    await flush()

    const stream = lastStream()
    stream.fireOpen()
    await flush()
    stream.fire(
      "logged_out",
      JSON.stringify({ from: "SYSTEM", to: "ALL", content: "logged_out" })
    )
    await flush()
    expect(result.current.connectionStatus).toBe("logged_out")

    act(() => {
      window.dispatchEvent(new Event("online"))
      document.dispatchEvent(new Event("visibilitychange"))
    })
    await flush(60_000)
    expect(getAccessToken).toHaveBeenCalledTimes(1)
    expect(FakeStream.instances).toHaveLength(1)
    expect(result.current.connectionStatus).toBe("logged_out")
  })

  it("ignores a malformed update frame without throwing", async () => {
    const onUpdate = vi.fn()
    const { result } = renderHook(() => useSimpleSSE(STREAM_URL, { onUpdate }))
    await flush()

    const stream = lastStream()
    stream.fireOpen()
    await flush()
    expect(() => stream.fire("update", "{not-json")).not.toThrow()
    await flush()
    expect(onUpdate).not.toHaveBeenCalled()
    expect(result.current.lastMessage).toBeNull()

    // the stream stays usable afterwards
    stream.fire(
      "update",
      JSON.stringify({ from: "SYSTEM", to: "ALL", content: "USER_CREATED: 1" })
    )
    await flush()
    expect(onUpdate).toHaveBeenCalledTimes(1)
  })

  it("reconnect after unmount is a no-op (no ownerless stream)", async () => {
    const { result, unmount } = renderHook(() => useSimpleSSE(STREAM_URL))
    await flush()

    unmount()
    act(() => result.current.reconnect())
    await flush(60_000)
    expect(getAccessToken).toHaveBeenCalledTimes(1)
    expect(FakeStream.instances).toHaveLength(1)
  })

  it("keeps logged_out when the auth gate closes after revocation", async () => {
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useSimpleSSE(STREAM_URL, { enabled }),
      { initialProps: { enabled: true } }
    )
    await flush()

    const stream = lastStream()
    stream.fireOpen()
    await flush()
    stream.fire(
      "logged_out",
      JSON.stringify({ from: "SYSTEM", to: "ALL", content: "logged_out" })
    )
    await flush()
    expect(result.current.connectionStatus).toBe("logged_out")

    rerender({ enabled: false }) // logout flips the gate — state stays honest
    await flush()
    expect(result.current.connectionStatus).toBe("logged_out")

    rerender({ enabled: true }) // fresh login: new session, new token
    await flush()
    expect(result.current.connectionStatus).toBe("connecting")
    expect(getAccessToken).toHaveBeenCalledTimes(2)
  })

  it("recovers on page-resume after sleep without an online event", async () => {
    const { result } = renderHook(() =>
      useSimpleSSE(STREAM_URL, { maxRetries: 1 })
    )
    await flush()

    lastStream().fireError()
    await flush(1000)
    expect(result.current.connectionStatus).toBe("disconnected")

    act(() => {
      window.dispatchEvent(new Event("resume"))
    })
    await flush()
    expect(getAccessToken).toHaveBeenCalledTimes(2)
    expect(FakeStream.instances).toHaveLength(2)
  })

  it("overlapping attempts open exactly ONE stream (newest generation wins)", async () => {
    // Hold the first attempt's token refresh so it resumes late, after a
    // second attempt (manual reconnect) already opened its stream.
    let releaseFirst: ((token: string) => void) | null = null
    getAccessToken
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            releaseFirst = resolve
          })
      )
      .mockImplementationOnce(async () => "fresh-token")

    const { result } = renderHook(() => useSimpleSSE(STREAM_URL))
    await flush() // first attempt starts, its token refresh is pending

    act(() => {
      result.current.reconnect() // second attempt while the first awaits its token
    })
    await flush() // second resolves -> its stream opens
    lastStream().fireOpen()
    await flush()

    act(() => {
      releaseFirst?.("stale-generation") // first attempt lands late
    })
    await flush()

    // The superseded attempt must NOT fetch — the generation check fires
    // before the request, so only ONE stream exists (the StrictMode/reconnect
    // race that previously leaked an orphan reader).
    expect(FakeStream.instances).toHaveLength(1)
  })

  it("manual reconnect is a no-op after logged_out", async () => {
    const { result } = renderHook(() => useSimpleSSE(STREAM_URL))
    await flush()

    const stream = lastStream()
    stream.fireOpen()
    await flush()
    stream.fire(
      "logged_out",
      JSON.stringify({ from: "SYSTEM", to: "ALL", content: "logged_out" })
    )
    await flush()

    act(() => result.current.reconnect())
    await flush(60_000)
    expect(getAccessToken).toHaveBeenCalledTimes(1)
    expect(FakeStream.instances).toHaveLength(1)
    expect(result.current.connectionStatus).toBe("logged_out")
  })

  it("stays closed while disabled, connects when enabled flips on, closes again when off", async () => {
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useSimpleSSE(STREAM_URL, { enabled }),
      { initialProps: { enabled: false } }
    )
    await flush()
    expect(getAccessToken).not.toHaveBeenCalled()
    expect(FakeStream.instances).toHaveLength(0)
    expect(result.current.connectionStatus).toBe("disconnected")

    rerender({ enabled: true })
    await flush()
    expect(getAccessToken).toHaveBeenCalledTimes(1)
    expect(lastStream().url).toBe(STREAM_URL)

    rerender({ enabled: false })
    await flush()
    expect(lastStream().closeCalls).toBeGreaterThan(0)
    expect(result.current.connectionStatus).toBe("disconnected")

    // gated off: wake-up recovery must not connect either
    act(() => {
      window.dispatchEvent(new Event("online"))
    })
    await flush(60_000)
    expect(getAccessToken).toHaveBeenCalledTimes(1)
    expect(FakeStream.instances).toHaveLength(1)
  })

  it("reconnects when the server ends the stream cleanly", async () => {
    const { result } = renderHook(() => useSimpleSSE(STREAM_URL))
    await flush()

    const stream = lastStream()
    stream.fireOpen()
    await flush()
    stream.endBody()
    await flush(1000)
    expect(FakeStream.instances).toHaveLength(2)
    expect(result.current.connectionStatus).toBe("connecting")
  })

  it("reconnects when the stream stalls past the liveness timeout", async () => {
    const { result } = renderHook(() => useSimpleSSE(STREAM_URL))
    await flush()

    const first = lastStream()
    first.fireOpen()
    await flush()
    first.fire(
      "heartbeat",
      JSON.stringify({ from: "SYSTEM", to: "ALL", content: "ping" })
    )
    await flush()

    // Half-open connection: the socket never errors but nothing arrives for
    // longer than 3 heartbeat intervals -> the watchdog must recycle the stream.
    await flush(45_500) // watchdog at 45 s; reconnect timer (1 s) still pending
    expect(result.current.connectionStatus).toBe("reconnecting")
    expect(first.closeCalls).toBeGreaterThan(0)

    await flush(1000) // backoff step -> fresh attempt
    expect(FakeStream.instances).toHaveLength(2)
  })

  it("stays connected while heartbeats keep arriving", async () => {
    const { result } = renderHook(() => useSimpleSSE(STREAM_URL))
    await flush()

    const stream = lastStream()
    stream.fireOpen()
    await flush()
    for (let i = 0; i < 5; i++) {
      await flush(9_000)
      stream.fire(
        "heartbeat",
        JSON.stringify({ from: "SYSTEM", to: "ALL", content: "ping" })
      )
      await flush(500)
    }
    expect(result.current.connectionStatus).toBe("connected")
    expect(FakeStream.instances).toHaveLength(1)
  })
})
