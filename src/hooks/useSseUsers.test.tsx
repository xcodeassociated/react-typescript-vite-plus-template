import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { act, cleanup, renderHook } from "@testing-library/react"

// One-time-ticket discipline is what this tests: every connect/reconnect must
// carry a FRESH ticket (a replayed ticket 401s), token_expired re-mints and
// reconnects, logged_out stops forever.
const mintTicket = vi.hoisted(() =>
  vi.fn<() => Promise<{ ticket: string; expiresIn: number }>>(async () => ({
    ticket: "unused",
    expiresIn: 10,
  }))
)

vi.mock("@/lib/ticket", () => ({ mintTicket }))

import { useSimpleSSE } from "@/hooks/useSseUsers"

const STREAM_URL = "http://backend.test/update/user"

/** Controllable EventSource fake: records instances, lets tests fire the
 * named lifecycle events and observe close(). */
class FakeEventSource {
  static instances: FakeEventSource[] = []
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 2

  url: string
  readyState = FakeEventSource.CONNECTING
  closeCalls = 0
  onopen: ((ev: Event) => void) | null = null
  onerror: ((ev: Event) => void) | null = null
  onmessage: ((ev: MessageEvent) => void) | null = null
  private handlers = new Map<string, Set<(ev: MessageEvent) => void>>()

  constructor(url: string | URL) {
    this.url = String(url)
    FakeEventSource.instances.push(this)
  }

  addEventListener(type: string, listener: (ev: MessageEvent) => void): void {
    const set = this.handlers.get(type) ?? new Set()
    set.add(listener)
    this.handlers.set(type, set)
  }

  removeEventListener(
    type: string,
    listener: (ev: MessageEvent) => void
  ): void {
    this.handlers.get(type)?.delete(listener)
  }

  close(): void {
    this.closeCalls += 1
    this.readyState = FakeEventSource.CLOSED
  }

  fireOpen(): void {
    this.readyState = FakeEventSource.OPEN
    act(() => this.onopen?.(new Event("open")))
  }

  fireError(): void {
    act(() => this.onerror?.(new Event("error")))
  }

  fire(type: string, data = ""): void {
    const event = new MessageEvent(type, { data })
    act(() => {
      for (const listener of this.handlers.get(type) ?? []) {
        listener(event)
      }
    })
  }
}

vi.stubGlobal("EventSource", FakeEventSource)

let ticketCounter = 0

function lastSource(): FakeEventSource {
  return FakeEventSource.instances[FakeEventSource.instances.length - 1]
}

async function flush(ms = 0): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  FakeEventSource.instances = []
  ticketCounter = 0
  mintTicket.mockImplementation(async () => ({
    ticket: `t${(ticketCounter += 1)}`,
    expiresIn: 10,
  }))
})

afterEach(() => {
  cleanup() // unmount hooks so their recovery listeners do not leak across tests
  vi.useRealTimers()
})

describe("useSimpleSSE ticket flow", () => {
  it("mints a fresh ticket on mount and opens the stream with ?ticket=", async () => {
    const { result } = renderHook(() => useSimpleSSE(STREAM_URL))
    await flush()

    expect(mintTicket).toHaveBeenCalledWith("sse")
    expect(FakeEventSource.instances).toHaveLength(1)
    expect(FakeEventSource.instances[0].url).toBe(`${STREAM_URL}?ticket=t1`)
    expect(result.current.connectionStatus).toBe("connecting")
  })

  it("reports connected on open/heartbeat and forwards update events", async () => {
    const onUpdate = vi.fn()
    const { result } = renderHook(() => useSimpleSSE(STREAM_URL, { onUpdate }))
    await flush()

    const source = lastSource()
    source.fireOpen()
    expect(result.current.connectionStatus).toBe("connected")

    const message = { from: "SYSTEM", to: "ALL", content: "USER_CREATED: 42" }
    source.fire("heartbeat", JSON.stringify(message))
    expect(result.current.connectionStatus).toBe("connected")

    source.fire("update", JSON.stringify(message))
    expect(result.current.lastMessage).toEqual(message)
    expect(onUpdate).toHaveBeenCalledWith(message)
  })

  it("closes the stream on transport error and reconnects with a FRESH ticket", async () => {
    const { result } = renderHook(() => useSimpleSSE(STREAM_URL))
    await flush()

    const first = lastSource()
    first.fireError()
    expect(first.closeCalls).toBeGreaterThan(0) // kills the used-ticket auto-retry
    expect(result.current.connectionStatus).toBe("reconnecting")

    await flush(1000) // exponential backoff step
    expect(mintTicket).toHaveBeenCalledTimes(2)
    expect(FakeEventSource.instances).toHaveLength(2)
    const second = lastSource()
    expect(second.url).toBe(`${STREAM_URL}?ticket=t2`) // never replays t1
  })

  it("token_expired re-mints and reconnects immediately", async () => {
    const { result } = renderHook(() => useSimpleSSE(STREAM_URL))
    await flush()

    const first = lastSource()
    first.fire(
      "token_expired",
      JSON.stringify({ from: "SYSTEM", to: "ALL", content: "token_expired" })
    )
    expect(first.closeCalls).toBeGreaterThan(0)

    await flush(0) // no backoff on reauth
    expect(mintTicket).toHaveBeenCalledTimes(2)
    expect(lastSource().url).toBe(`${STREAM_URL}?ticket=t2`)
    expect(result.current.connectionStatus).toBe("connecting")
  })

  it("logged_out stops the stream and NEVER reconnects", async () => {
    const onLoggedOut = vi.fn()
    const { result } = renderHook(() =>
      useSimpleSSE(STREAM_URL, { onLoggedOut })
    )
    await flush()

    const source = lastSource()
    source.fire(
      "logged_out",
      JSON.stringify({ from: "SYSTEM", to: "ALL", content: "logged_out" })
    )

    expect(result.current.connectionStatus).toBe("logged_out")
    expect(onLoggedOut).toHaveBeenCalledOnce()
    expect(source.closeCalls).toBeGreaterThan(0)

    await flush(120_000) // far beyond any backoff window
    expect(mintTicket).toHaveBeenCalledTimes(1)
    expect(FakeEventSource.instances).toHaveLength(1)
  })

  it("gives up after maxRetries and manual reconnect mints a fresh ticket", async () => {
    const { result } = renderHook(() =>
      useSimpleSSE(STREAM_URL, { maxRetries: 1 })
    )
    await flush()

    lastSource().fireError()
    await flush(1000)
    expect(result.current.connectionStatus).toBe("disconnected")
    // maxRetries: 1 = one connect attempt total; giving up does not re-mint
    expect(mintTicket).toHaveBeenCalledTimes(1)

    act(() => result.current.reconnect())
    await flush()
    expect(mintTicket).toHaveBeenCalledTimes(2) // initial + manual, fresh ticket
    expect(lastSource().url).toBe(`${STREAM_URL}?ticket=t2`)
  })

  it("closes the stream on unmount and stops retrying", async () => {
    const { unmount } = renderHook(() => useSimpleSSE(STREAM_URL))
    await flush()

    const source = lastSource()
    unmount()
    expect(source.closeCalls).toBe(1)

    source.fireError() // late error after unmount must not restart anything
    await flush(60_000)
    expect(FakeEventSource.instances).toHaveLength(1)
    expect(mintTicket).toHaveBeenCalledTimes(1)
  })

  it("recovers with a fresh ticket when the network returns after giving up", async () => {
    const { result } = renderHook(() =>
      useSimpleSSE(STREAM_URL, { maxRetries: 1 })
    )
    await flush()

    // Sleep/offline: drop and burn the budget -> parked "disconnected".
    lastSource().fireError()
    await flush(1000)
    expect(result.current.connectionStatus).toBe("disconnected")

    // Wake-up: browser reports online -> budget reset, fresh ticket.
    act(() => {
      window.dispatchEvent(new Event("online"))
    })
    await flush()
    expect(mintTicket).toHaveBeenCalledTimes(2)
    expect(lastSource().url).toBe(`${STREAM_URL}?ticket=t2`)
    expect(result.current.connectionStatus).toBe("connecting")
  })

  it("recovers when a parked stream's tab becomes visible again", async () => {
    const { result } = renderHook(() =>
      useSimpleSSE(STREAM_URL, { maxRetries: 1 })
    )
    await flush()
    lastSource().fireError()
    await flush(1000)
    expect(result.current.connectionStatus).toBe("disconnected")

    act(() => {
      document.dispatchEvent(new Event("visibilitychange"))
    })
    await flush()
    expect(mintTicket).toHaveBeenCalledTimes(2)
    expect(FakeEventSource.instances).toHaveLength(2)
  })

  it("online/visibility events NEVER resurrect a logged-out stream", async () => {
    const { result } = renderHook(() => useSimpleSSE(STREAM_URL))
    await flush()

    lastSource().fire(
      "logged_out",
      JSON.stringify({ from: "SYSTEM", to: "ALL", content: "logged_out" })
    )
    expect(result.current.connectionStatus).toBe("logged_out")

    act(() => {
      window.dispatchEvent(new Event("online"))
      document.dispatchEvent(new Event("visibilitychange"))
    })
    await flush(60_000)
    expect(mintTicket).toHaveBeenCalledTimes(1)
    expect(FakeEventSource.instances).toHaveLength(1)
    expect(result.current.connectionStatus).toBe("logged_out")
  })

  it("ignores a malformed update frame without throwing", async () => {
    const onUpdate = vi.fn()
    const { result } = renderHook(() => useSimpleSSE(STREAM_URL, { onUpdate }))
    await flush()

    const source = lastSource()
    source.fireOpen()
    expect(() => source.fire("update", "{not-json")).not.toThrow()
    expect(onUpdate).not.toHaveBeenCalled()
    expect(result.current.lastMessage).toBeNull()

    // the stream stays usable afterwards
    source.fire(
      "update",
      JSON.stringify({ from: "SYSTEM", to: "ALL", content: "USER_CREATED: 1" })
    )
    expect(onUpdate).toHaveBeenCalledTimes(1)
  })

  it("reconnect after unmount is a no-op (no ownerless stream)", async () => {
    const { result, unmount } = renderHook(() => useSimpleSSE(STREAM_URL))
    await flush()

    unmount()
    act(() => result.current.reconnect())
    await flush(60_000)
    expect(mintTicket).toHaveBeenCalledTimes(1)
    expect(FakeEventSource.instances).toHaveLength(1)
  })

  it("keeps logged_out when the auth gate closes after revocation", async () => {
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useSimpleSSE(STREAM_URL, { enabled }),
      { initialProps: { enabled: true } }
    )
    await flush()

    lastSource().fire(
      "logged_out",
      JSON.stringify({ from: "SYSTEM", to: "ALL", content: "logged_out" })
    )
    expect(result.current.connectionStatus).toBe("logged_out")

    rerender({ enabled: false }) // logout flips the gate — state stays honest
    await flush()
    expect(result.current.connectionStatus).toBe("logged_out")

    rerender({ enabled: true }) // fresh login: new session, new ticket
    await flush()
    expect(result.current.connectionStatus).toBe("connecting")
    expect(mintTicket).toHaveBeenCalledTimes(2)
  })

  it("recovers on page-resume after sleep without an online event", async () => {
    const { result } = renderHook(() =>
      useSimpleSSE(STREAM_URL, { maxRetries: 1 })
    )
    await flush()

    lastSource().fireError()
    await flush(1000)
    expect(result.current.connectionStatus).toBe("disconnected")

    act(() => {
      window.dispatchEvent(new Event("resume"))
    })
    await flush()
    expect(mintTicket).toHaveBeenCalledTimes(2)
    expect(FakeEventSource.instances).toHaveLength(2)
  })

  it("overlapping attempts open exactly ONE stream (newest generation wins)", async () => {
    let releaseMint:
      | ((v: { ticket: string; expiresIn: number }) => void)
      | null = null
    mintTicket.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseMint = resolve
        })
    )
    const { result } = renderHook(() => useSimpleSSE(STREAM_URL))
    await flush() // first attempt starts, its mint is pending

    act(() => {
      result.current.reconnect() // second attempt while the first mint is in flight
    })
    await flush() // second mint resolves -> its stream opens

    act(() => {
      releaseMint?.({ ticket: "stale-generation", expiresIn: 10 }) // first mint lands late
    })
    await flush()

    // The superseded attempt must NOT open a stream — this is the StrictMode/
    // reconnect race that previously leaked an orphan EventSource whose
    // auto-reconnect replayed its redeemed ticket (401 + CORS console noise).
    expect(FakeEventSource.instances).toHaveLength(1)
    expect(lastSource().url).not.toContain("stale-generation")
  })

  it("manual reconnect is a no-op after logged_out", async () => {
    const { result } = renderHook(() => useSimpleSSE(STREAM_URL))
    await flush()

    lastSource().fire(
      "logged_out",
      JSON.stringify({ from: "SYSTEM", to: "ALL", content: "logged_out" })
    )

    act(() => result.current.reconnect())
    await flush(60_000)
    expect(mintTicket).toHaveBeenCalledTimes(1)
    expect(FakeEventSource.instances).toHaveLength(1)
    expect(result.current.connectionStatus).toBe("logged_out")
  })

  it("stays closed while disabled, connects when enabled flips on, closes again when off", async () => {
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useSimpleSSE(STREAM_URL, { enabled }),
      { initialProps: { enabled: false } }
    )
    await flush()
    expect(mintTicket).not.toHaveBeenCalled()
    expect(FakeEventSource.instances).toHaveLength(0)
    expect(result.current.connectionStatus).toBe("disconnected")

    rerender({ enabled: true })
    await flush()
    expect(mintTicket).toHaveBeenCalledTimes(1)
    expect(lastSource().url).toBe(`${STREAM_URL}?ticket=t1`)

    rerender({ enabled: false })
    await flush()
    expect(lastSource().closeCalls).toBeGreaterThan(0)
    expect(result.current.connectionStatus).toBe("disconnected")

    // gated off: wake-up recovery must not connect either
    act(() => {
      window.dispatchEvent(new Event("online"))
    })
    await flush(60_000)
    expect(mintTicket).toHaveBeenCalledTimes(1)
    expect(FakeEventSource.instances).toHaveLength(1)
  })
})
