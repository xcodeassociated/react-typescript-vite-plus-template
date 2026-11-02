import { createContext, useContext, useMemo, type ReactNode } from "react"

import {
  useSimpleSSE,
  type SseConnectionStatus,
  type SseMessage,
} from "@/hooks/useSseUsers"
import { usersApi } from "@/pages/users/api/usersApi"
import { useKeycloak } from "@/providers/keycloak"
import { useAppDispatch } from "@/store/hooks"

export interface NotificationsContextValue {
  connectionStatus: SseConnectionStatus
  lastMessage: SseMessage | null
  reconnect: () => void
}

const NotificationsContext = createContext<
  NotificationsContextValue | undefined
>(undefined)

/**
 * App-level live-updates stream. Mounted once, inside KeycloakProvider and the
 * Redux Provider, so session revocation (`logged_out` → `expireSession` →
 * ProtectedRoute lock) is instant on EVERY route — not just the users page —
 * and `update` broadcasts invalidate the users queries whether or not the
 * page is mounted. The stream is gated on authentication: it connects on
 * login, closes on logout, and re-mints a fresh ticket per (re)connect.
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { authenticated, expireSession } = useKeycloak()
  const dispatch = useAppDispatch()

  const { connectionStatus, lastMessage, reconnect } = useSimpleSSE(
    `${import.meta.env.VITE_APP_BACKEND_URL}/update/user`,
    {
      enabled: authenticated,
      onLoggedOut: expireSession,
      onUpdate: () => {
        void dispatch(usersApi.util.invalidateTags(["users", "usersCount"]))
      },
    }
  )

  const value = useMemo(
    () => ({ connectionStatus, lastMessage, reconnect }),
    [connectionStatus, lastMessage, reconnect]
  )

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  )
}

export function useNotifications(): NotificationsContextValue {
  const context = useContext(NotificationsContext)
  if (!context) {
    throw new Error(
      "useNotifications must be used within NotificationsProvider"
    )
  }
  return context
}
