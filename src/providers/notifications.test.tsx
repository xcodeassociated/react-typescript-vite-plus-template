import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test"
import { Provider } from "react-redux"
import { act, cleanup, render } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"

// The provider wires the stream to auth: gated on `authenticated`,
// logged_out -> expireSession, update -> usersApi invalidation.
const kc = vi.hoisted(() => ({
  authenticated: true,
  expireSession: vi.fn(),
}))

vi.mock("@/providers/keycloak", () => ({
  useKeycloak: () => kc,
  getAccessToken: async () => "test-token",
}))

const mintTicket = vi.hoisted(() =>
  vi.fn<() => Promise<{ ticket: string; expiresIn: number }>>(async () => ({
    ticket: "unused",
    expiresIn: 10,
  }))
)

vi.mock("@/lib/ticket", () => ({ mintTicket }))

import { NotificationsProvider } from "@/providers/notifications"
import { usersApi } from "@/pages/users/api/usersApi"
import { setupStore, type AppStore } from "@/store/store"

class FakeEventSource {
  static instances: FakeEventSource[] = []
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 2

  url: string
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
let usersGetCount = 0

const server = setupServer(
  http.post(`${import.meta.env.VITE_APP_BACKEND_URL}/sse-ticket`, () =>
    HttpResponse.json({ ticket: `t${(ticketCounter += 1)}`, expiresIn: 10 })
  ),
  http.get(`${import.meta.env.VITE_APP_BACKEND_URL}/coroutine/users`, () => {
    usersGetCount += 1
    return HttpResponse.json([])
  }),
  http.get(`${import.meta.env.VITE_APP_BACKEND_URL}/coroutine/usersCount`, () =>
    HttpResponse.json(0)
  )
)

function flush(ms = 0): Promise<void> {
  return act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

function lastSource(): FakeEventSource {
  return FakeEventSource.instances[FakeEventSource.instances.length - 1]
}

function renderProvider(): AppStore {
  const store = setupStore()
  render(
    <Provider store={store}>
      <NotificationsProvider>
        <div />
      </NotificationsProvider>
    </Provider>
  )
  return store
}

beforeAll(() => server.listen())
beforeEach(() => {
  vi.useFakeTimers()
  FakeEventSource.instances = []
  ticketCounter = 0
  usersGetCount = 0
  kc.authenticated = true
  kc.expireSession = vi.fn()
  mintTicket.mockImplementation(async () => ({
    ticket: `t${(ticketCounter += 1)}`,
    expiresIn: 10,
  }))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  server.resetHandlers()
})
afterAll(() => server.close())

describe("NotificationsProvider", () => {
  it("subscribes with a fresh ticket while authenticated", async () => {
    renderProvider()
    await flush()

    expect(mintTicket).toHaveBeenCalledWith("sse")
    expect(FakeEventSource.instances[0].url).toContain("/update/user?ticket=t1")
  })

  it("does not connect while logged out", async () => {
    kc.authenticated = false
    renderProvider()
    await flush(60_000)

    expect(mintTicket).not.toHaveBeenCalled()
    expect(FakeEventSource.instances).toHaveLength(0)
  })

  it("connects when the user logs in and closes on logout", async () => {
    kc.authenticated = false
    const { rerender } = render(
      <Provider store={setupStore()}>
        <NotificationsProvider>
          <div />
        </NotificationsProvider>
      </Provider>
    )
    await flush()
    expect(mintTicket).not.toHaveBeenCalled()

    kc.authenticated = true
    rerender(
      <Provider store={setupStore()}>
        <NotificationsProvider>
          <div />
        </NotificationsProvider>
      </Provider>
    )
    await flush()
    expect(FakeEventSource.instances).toHaveLength(1)

    kc.authenticated = false
    rerender(
      <Provider store={setupStore()}>
        <NotificationsProvider>
          <div />
        </NotificationsProvider>
      </Provider>
    )
    await flush()
    expect(lastSource().closeCalls).toBeGreaterThan(0)
    expect(mintTicket).toHaveBeenCalledTimes(1) // never reconnects logged out
  })

  it("expires the session when the stream reports logged_out", async () => {
    renderProvider()
    await flush()

    lastSource().fire(
      "logged_out",
      JSON.stringify({ from: "SYSTEM", to: "ALL", content: "logged_out" })
    )

    expect(kc.expireSession).toHaveBeenCalledOnce()
    expect(lastSource().closeCalls).toBeGreaterThan(0)

    await flush(120_000)
    expect(mintTicket).toHaveBeenCalledTimes(1) // stop forever
  })

  it("invalidates users queries on update broadcasts, page or no page", async () => {
    vi.useRealTimers() // fetch pipeline under MSW is macrotask-heavy; no backoff here
    const store = renderProvider()
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })

    // an active subscription (e.g. the users page open)
    const sub = store.dispatch(
      usersApi.endpoints.getAllUsers.initiate({
        page: 0,
        pageSize: 5,
        sort: "_id",
        direction: "ASC",
      })
    )
    await act(async () => {
      await sub.unwrap()
    })
    expect(usersGetCount).toBe(1)

    lastSource().fire(
      "update",
      JSON.stringify({ from: "SYSTEM", to: "ALL", content: "USER_CREATED: x" })
    )
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100))
    })
    expect(usersGetCount).toBe(2) // refetch without any component wiring

    sub.unsubscribe()
  })
})
