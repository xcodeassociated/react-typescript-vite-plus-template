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
// logged_out -> expireSession, update -> usersApi invalidation. The stream
// transport itself (bearer connect, backoff, generation guard) is covered in
// useSseUsers.test.tsx — here the hook is mocked so the provider's wiring is
// tested in isolation.
const kc = vi.hoisted(() => ({
  authenticated: true,
  expireSession: vi.fn(),
}))

vi.mock("@/providers/keycloak", () => ({
  useKeycloak: () => kc,
  getAccessToken: async () => "test-token",
}))

interface CapturedOptions {
  url?: string
  enabled?: boolean
  onUpdate?: () => void
  onConnect?: () => void
  onLoggedOut?: () => void
}

const sse = vi.hoisted(() => ({
  lastUrl: "" as string,
  options: {} as CapturedOptions,
}))

vi.mock("@/hooks/useSseUsers", () => ({
  useSimpleSSE: (url: string, options: CapturedOptions) => {
    sse.lastUrl = url
    sse.options = options
    return {
      connectionStatus: "connected",
      lastMessage: null,
      reconnect: vi.fn(),
    }
  },
}))

import { NotificationsProvider } from "@/providers/notifications"
import { usersApi } from "@/pages/users/api/usersApi"
import { setupStore, type AppStore } from "@/store/store"

let usersGetCount = 0

const server = setupServer(
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
  usersGetCount = 0
  kc.authenticated = true
  kc.expireSession = vi.fn()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  server.resetHandlers()
})
afterAll(() => server.close())

describe("NotificationsProvider", () => {
  it("subscribes to the stream gated on authentication", async () => {
    renderProvider()
    await flush()

    expect(sse.lastUrl).toContain("/update/user")
    expect(sse.options.enabled).toBe(true)
  })

  it("does not connect while logged out", async () => {
    kc.authenticated = false
    renderProvider()
    await flush(60_000)

    expect(sse.options.enabled).toBe(false)
  })

  it("opens the gate on login and closes it on logout", async () => {
    kc.authenticated = false
    const { rerender } = render(
      <Provider store={setupStore()}>
        <NotificationsProvider>
          <div />
        </NotificationsProvider>
      </Provider>
    )
    await flush()
    expect(sse.options.enabled).toBe(false)

    kc.authenticated = true
    rerender(
      <Provider store={setupStore()}>
        <NotificationsProvider>
          <div />
        </NotificationsProvider>
      </Provider>
    )
    await flush()
    expect(sse.options.enabled).toBe(true)

    kc.authenticated = false
    rerender(
      <Provider store={setupStore()}>
        <NotificationsProvider>
          <div />
        </NotificationsProvider>
      </Provider>
    )
    await flush()
    expect(sse.options.enabled).toBe(false)
  })

  it("expires the session when the stream reports logged_out", async () => {
    renderProvider()
    await flush()

    act(() => sse.options.onLoggedOut?.())

    expect(kc.expireSession).toHaveBeenCalledOnce()
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

    act(() => sse.options.onUpdate?.())
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100))
    })
    expect(usersGetCount).toBe(2) // refetch without any component wiring

    sub.unsubscribe()
  })

  it("invalidation while the page is unmounted still forces a fresh fetch on next mount", async () => {
    vi.useRealTimers()
    const store = renderProvider()
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })

    const args = { page: 0, pageSize: 5, sort: "_id", direction: "ASC" }
    const first = store.dispatch(usersApi.endpoints.getAllUsers.initiate(args))
    await act(async () => {
      await first.unwrap()
    })
    expect(usersGetCount).toBe(1)
    first.unsubscribe()

    // control: without any invalidation a remount serves the cache (no hole
    // in the test setup itself)
    const control = store.dispatch(
      usersApi.endpoints.getAllUsers.initiate(args)
    )
    await act(async () => {
      await control.unwrap()
    })
    expect(usersGetCount).toBe(1)
    control.unsubscribe()

    // the page is closed when the broadcast lands: the cache entry goes stale
    act(() => sse.options.onUpdate?.())
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })

    // mounting later must hit the network, not serve the stale cache
    const second = store.dispatch(usersApi.endpoints.getAllUsers.initiate(args))
    await act(async () => {
      await second.unwrap()
    })
    expect(usersGetCount).toBe(2)
    second.unsubscribe()
  })

  it("revalidates users on stream (re)connect — no silent gaps from missed broadcasts", async () => {
    vi.useRealTimers()
    const store = renderProvider()
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })

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

    // SSE has no replay: events broadcast while we were disconnected are
    // gone — connecting again must trigger a catch-up revalidation
    act(() => sse.options.onConnect?.())
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100))
    })
    expect(usersGetCount).toBe(2)

    sub.unsubscribe()
  })
})
