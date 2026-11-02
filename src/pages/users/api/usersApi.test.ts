import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"

// Mock the keycloak-js singleton BEFORE importing the store/usersApi so the
// whole prepareHeaders -> getAccessToken chain runs against the fake.
const kc = vi.hoisted(() => ({
  init: vi.fn<(options: Record<string, unknown>) => Promise<boolean>>(),
  login: vi.fn(),
  logout: vi.fn(),
  updateToken: vi.fn<(minValidity?: number) => Promise<boolean>>(),
  authenticated: false,
  token: undefined as string | undefined,
  idToken: undefined as string | undefined,
}))

vi.mock("@/lib/keycloak", () => ({ default: kc }))

import { setupStore } from "@/store/store"
import { usersApi } from "@/pages/users/api/usersApi"

let seenAuthHeader: string | null = null

const server = setupServer(
  http.get(
    `${import.meta.env.VITE_APP_BACKEND_URL}/coroutine/users`,
    ({ request }) => {
      seenAuthHeader = request.headers.get("authorization")
      return HttpResponse.json([])
    }
  )
)

beforeEach(() => {
  kc.updateToken = vi.fn().mockResolvedValue(false)
  kc.authenticated = true
  kc.token = "integration-token"
  seenAuthHeader = null
  server.listen()
})

afterEach(() => server.close())

describe("usersApi request auth", () => {
  it("attaches a bearer token after proactively refreshing", async () => {
    const store = setupStore()
    await store
      .dispatch(
        usersApi.endpoints.getAllUsers.initiate({
          page: 0,
          pageSize: 5,
          sort: "_id",
          direction: "ASC",
        })
      )
      .unwrap()

    expect(kc.updateToken).toHaveBeenCalledWith(60)
    expect(seenAuthHeader).toBe("Bearer integration-token")
  })

  it("still sends the token when the proactive refresh fails transiently", async () => {
    kc.updateToken = vi.fn().mockRejectedValue(new Error("network"))
    const store = setupStore()

    await store
      .dispatch(
        usersApi.endpoints.getAllUsers.initiate({
          page: 0,
          pageSize: 5,
          sort: "_id",
          direction: "ASC",
        })
      )
      .unwrap()

    expect(seenAuthHeader).toBe("Bearer integration-token")
  })

  it("URL-encodes sort so crafted URL state cannot inject query params", async () => {
    let seenUrl = ""
    server.use(
      http.get(
        `${import.meta.env.VITE_APP_BACKEND_URL}/coroutine/users`,
        ({ request }) => {
          seenUrl = request.url
          return HttpResponse.json([])
        }
      )
    )
    const store = setupStore()

    await store
      .dispatch(
        usersApi.endpoints.getAllUsers.initiate({
          page: 0,
          pageSize: 5,
          sort: "name&direction=DESC&x",
          direction: "ASC",
        })
      )
      .unwrap()

    const params = new URL(seenUrl).searchParams
    // the crafted value stays a single sort param — no pollution of direction
    expect(params.get("sort")).toBe("name&direction=DESC&x")
    expect(params.get("direction")).toBe("ASC")
  })

  it("refetches active queries when the window regains focus", async () => {
    let getCount = 0
    server.use(
      http.get(
        `${import.meta.env.VITE_APP_BACKEND_URL}/coroutine/users`,
        () => {
          getCount += 1
          return HttpResponse.json([])
        }
      )
    )
    const store = setupStore()
    const sub = store.dispatch(
      usersApi.endpoints.getAllUsers.initiate({
        page: 0,
        pageSize: 5,
        sort: "_id",
        direction: "ASC",
      })
    )
    await sub.unwrap()
    expect(getCount).toBe(1)

    // the window-focus wiring dispatches this action; refetchOnFocus must
    // make active queries refresh with it (alt+tab freshness backstop)
    store.dispatch(usersApi.internalActions.onFocus())
    for (let i = 0; i < 20 && getCount < 2; i++) {
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    expect(getCount).toBe(2)

    sub.unsubscribe()
  })
})
