import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"

// Mock the provider's token helper BEFORE importing the ticket module so the
// mint -> proactive-refresh chain runs against the fake (same pattern as
// usersApi.test.ts mocks the keycloak singleton).
const getAccessToken = vi.hoisted(() =>
  vi.fn<() => Promise<string | undefined>>()
)

vi.mock("@/providers/keycloak", () => ({ getAccessToken }))

import { mintTicket } from "@/lib/ticket"

interface MintedRequest {
  url: string
  auth: string | null
}

const seen: MintedRequest[] = []

const server = setupServer(
  http.post(
    `${import.meta.env.VITE_APP_BACKEND_URL}/sse-ticket`,
    ({ request }) => {
      seen.push({
        url: request.url,
        auth: request.headers.get("authorization"),
      })
      return HttpResponse.json({ ticket: "sse-ticket-value", expiresIn: 10 })
    }
  ),
  http.post(
    `${import.meta.env.VITE_APP_BACKEND_URL}/ws-ticket`,
    ({ request }) => {
      seen.push({
        url: request.url,
        auth: request.headers.get("authorization"),
      })
      return HttpResponse.json({ ticket: "ws-ticket-value", expiresIn: 10 })
    }
  )
)

beforeEach(() => {
  seen.length = 0
  getAccessToken.mockResolvedValue("test-token")
  server.listen()
})

afterEach(() => server.close())

describe("mintTicket", () => {
  it("mints an SSE ticket against /sse-ticket with a bearer token", async () => {
    const result = await mintTicket("sse")

    expect(result).toEqual({ ticket: "sse-ticket-value", expiresIn: 10 })
    expect(getAccessToken).toHaveBeenCalledOnce()
    expect(seen).toHaveLength(1)
    expect(seen[0].url).toContain("/sse-ticket")
    expect(seen[0].auth).toBe("Bearer test-token")
  })

  it("mints WS tickets against the transport-bound /ws-ticket endpoint", async () => {
    const result = await mintTicket("ws")

    expect(result.ticket).toBe("ws-ticket-value")
    expect(seen[0].url).toContain("/ws-ticket")
  })

  it("sends no authorization header when unauthenticated", async () => {
    getAccessToken.mockResolvedValue(undefined)

    await mintTicket("sse")

    expect(seen[0].auth).toBeNull()
  })

  it("rejects when the mint is rejected (e.g. expired bearer -> 401)", async () => {
    server.use(
      http.post(
        `${import.meta.env.VITE_APP_BACKEND_URL}/sse-ticket`,
        () => new HttpResponse(null, { status: 401 })
      )
    )

    await expect(mintTicket("sse")).rejects.toThrow(/401/)
  })

  it("rejects a 200 body that carries no usable ticket", async () => {
    server.use(
      http.post(`${import.meta.env.VITE_APP_BACKEND_URL}/sse-ticket`, () =>
        HttpResponse.json({ ok: true })
      )
    )

    await expect(mintTicket("sse")).rejects.toThrow(/invalid body/)
  })
})
