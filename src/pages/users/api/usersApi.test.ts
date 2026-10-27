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
})
