import { getAccessToken } from "@/providers/keycloak"

export type TicketTransport = "sse" | "ws"

export interface TicketResponse {
  ticket: string
  /** Server-side TTL in seconds (10 on the current backend). */
  expiresIn: number
}

/**
 * Mint a one-time handshake ticket for a streaming transport
 * (`POST /sse-ticket` or `POST /ws-ticket`, bearer-authenticated).
 *
 * Tickets are opaque, single-use, 10 s TTL and transport-bound: a stream
 * handshake may only carry a never-used ticket in the URL (the access token
 * must never appear in a query string — RFC 9700 §4.3.2). This function keeps
 * the single-use discipline by construction: it never caches and every
 * connect/reconnect must call it again. A replayed ticket 401s.
 *
 * `getAccessToken()` proactively refreshes first, so minting after idle never
 * sends an expired bearer. Rejects on any non-2xx (caller decides retrying).
 */
export async function mintTicket(
  transport: TicketTransport
): Promise<TicketResponse> {
  const token = await getAccessToken()
  const response = await fetch(
    `${import.meta.env.VITE_APP_BACKEND_URL}/${transport}-ticket`,
    {
      method: "POST",
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
    }
  )
  if (!response.ok) {
    throw new Error(`Ticket mint failed: HTTP ${response.status}`)
  }
  const body = (await response.json()) as Partial<TicketResponse> | null
  if (typeof body?.ticket !== "string" || body.ticket.length === 0) {
    // Never open a stream with a non-ticket (gateway/proxy JSON, empty body):
    // it would just 401-loop against the redeemed-URL retry path.
    throw new Error("Ticket mint returned an invalid body")
  }
  return { ticket: body.ticket, expiresIn: Number(body.expiresIn) || 0 }
}
