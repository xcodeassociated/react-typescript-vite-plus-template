import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"

import keycloak from "@/lib/keycloak"

export interface KeycloakContextValue {
  initialized: boolean
  authenticated: boolean
  login: () => void
  logout: () => void
  /** Refresh the access token if it is close to expiry. Resolves true when a
   * refresh happened, false when the token was still fresh. Rejects only on
   * failure — session loss is signalled via the auth state, not here. */
  updateToken: () => Promise<boolean>
  /** Proactively refresh, then return a bearer token for API requests
   * (undefined when unauthenticated). */
  getAccessToken: () => Promise<string | undefined>
  /** Expire the local session without redirecting (server-side revocation,
   * e.g. the SSE `logged_out` event): clearToken fires onAuthLogout, which
   * flips the auth state so protected routes lock immediately. */
  expireSession: () => void
}

const KeycloakContext = createContext<KeycloakContextValue | undefined>(
  undefined
)

interface KeycloakProviderProps {
  children: ReactNode
}

const TOKEN_MINI_VALIDITY_SECONDS = 60
// Backstop for background-tab timer throttling: keycloak-js schedules
// onTokenExpired with a plain setTimeout, which browsers can delay
// arbitrarily while the tab is hidden.
const TOKEN_REFRESH_BACKSTOP_MS = 60_000
// If Keycloak's silent-SSO iframe never posts back (e.g. the current origin
// is missing from the client's allowed origins), init() never settles. This
// watchdog renders the app logged-out instead of hanging on the loading
// screen forever.
const INIT_TIMEOUT_MS = 15_000

// Initialize the shared Keycloak instance exactly once: keycloak-js throws
// "A 'Keycloak' instance can only be initialized once." on re-entry, and React
// StrictMode double-invokes effects in development. Without this guard the
// second init() would reject, opening two silent-SSO iframes and breaking the
// login authorization-code exchange.
let initPromise: Promise<boolean> | null = null

function initKeycloak(): Promise<boolean> {
  if (!initPromise) {
    initPromise = keycloak.init({
      onLoad: "check-sso",
      silentCheckSsoRedirectUri: `${import.meta.env.VITE_APP_DOMAIN}/silent-check-sso.html`,
      checkLoginIframe: false,
    })
  }
  return initPromise
}

// Derive auth state from keycloak-js' own fields (it sets `authenticated`
// together with token/idToken in setToken and clears all of them in
// clearToken) instead of caching a boolean that goes stale on session loss.
function isUserAuthenticated(): boolean {
  return Boolean(keycloak.authenticated && keycloak.token && keycloak.idToken)
}

/**
 * Refresh the access token if needed, then return it for API requests.
 * updateToken is a no-op (resolves false) while the token is fresh, so this
 * only costs a network round-trip when the token is close to expiry — which
 * fixes the idle case where a request would otherwise send an expired token.
 * A rejected refresh must NOT throw here: real session loss fires
 * onAuthLogout (handled by the provider); transient network errors leave the
 * session intact, and the request then simply 401s.
 */
export async function getAccessToken(): Promise<string | undefined> {
  try {
    await keycloak.updateToken(TOKEN_MINI_VALIDITY_SECONDS)
  } catch {
    // Intentionally ignored — see above.
  }
  return keycloak.token ?? undefined
}

export function KeycloakProvider({ children }: KeycloakProviderProps) {
  const [initialized, setInitialized] = useState(false)
  const [authenticated, setAuthenticated] = useState(isUserAuthenticated)

  const refresh = useCallback(() => {
    return keycloak.updateToken(TOKEN_MINI_VALIDITY_SECONDS).catch(() => false)
  }, [])

  useEffect(() => {
    let cancelled = false

    const sync = () => {
      if (!cancelled) {
        setAuthenticated(isUserAuthenticated())
      }
    }
    const ready = () => {
      if (!cancelled) {
        setAuthenticated(isUserAuthenticated())
        setInitialized(true)
      }
    }

    // Lifecycle wiring mirrors @react-keycloak/core's createAuthProvider, with
    // two deliberate improvements: the init watchdog below and NOT treating a
    // plain refresh error as a logout (keycloak-js only clears the session on
    // a 400 from the token endpoint, which fires onAuthLogout).
    keycloak.onReady = ready
    keycloak.onAuthSuccess = sync
    keycloak.onAuthError = ready
    keycloak.onAuthRefreshSuccess = sync
    keycloak.onAuthRefreshError = sync
    keycloak.onAuthLogout = sync
    keycloak.onTokenExpired = () => {
      void refresh()
    }

    const watchdog = setTimeout(() => {
      if (!cancelled) {
        setInitialized(true)
      }
    }, INIT_TIMEOUT_MS)

    initKeycloak()
      .then(() => {
        if (!cancelled) {
          setAuthenticated(isUserAuthenticated())
          setInitialized(true)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setInitialized(true)
        }
      })
      .finally(() => clearTimeout(watchdog))

    const backstop = setInterval(() => {
      if (isUserAuthenticated()) {
        void refresh()
      }
    }, TOKEN_REFRESH_BACKSTOP_MS)

    // Wake revalidation: the backstop's updateToken(60) no-ops while the
    // token is still fresh, so a session killed remotely could stay
    // undetected until the next refresh window. updateToken(-1) always hits
    // the token endpoint — a dead session answers 400, keycloak-js clears
    // the token and fires onAuthLogout, so routes lock on tab wake-up.
    const revalidate = () => {
      if (isUserAuthenticated()) {
        void keycloak.updateToken(-1).catch(() => {})
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        revalidate()
      }
    }
    window.addEventListener("online", revalidate)
    // Page Lifecycle "resume": laptop waking from sleep fires this even when
    // no online/visibilitychange accompanies it — the last detection net.
    window.addEventListener("resume", revalidate)
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      cancelled = true
      clearTimeout(watchdog)
      clearInterval(backstop)
      window.removeEventListener("online", revalidate)
      window.removeEventListener("resume", revalidate)
      document.removeEventListener("visibilitychange", onVisibility)
      keycloak.onReady = undefined
      keycloak.onAuthSuccess = undefined
      keycloak.onAuthError = undefined
      keycloak.onAuthRefreshSuccess = undefined
      keycloak.onAuthRefreshError = undefined
      keycloak.onAuthLogout = undefined
      keycloak.onTokenExpired = undefined
    }
  }, [refresh])

  const login = useCallback(() => {
    void keycloak
      .login({ redirectUri: window.location.href })
      .catch((error: unknown) => console.error("Keycloak login failed", error))
  }, [])

  const logout = useCallback(() => {
    void keycloak
      .logout({ redirectUri: `${import.meta.env.VITE_APP_DOMAIN}/` })
      .catch((error: unknown) => console.error("Keycloak logout failed", error))
  }, [])

  // Server-side revocation (e.g. the SSE `logged_out` event): drop the local
  // session without redirecting. clearToken fires onAuthLogout (handled by
  // the sync above); the settle-sync covers the no-token no-op case.
  const expireSession = useCallback(() => {
    void keycloak
      .clearToken()
      .catch((error: unknown) =>
        console.error("Keycloak session expire failed", error)
      )
      .finally(() => setAuthenticated(isUserAuthenticated()))
  }, [])

  const value: KeycloakContextValue = {
    initialized,
    authenticated,
    login,
    logout,
    updateToken: refresh,
    getAccessToken,
    expireSession,
  }

  return (
    <KeycloakContext.Provider value={value}>
      {children}
    </KeycloakContext.Provider>
  )
}

export function useKeycloak(): KeycloakContextValue {
  const context = useContext(KeycloakContext)
  if (!context) {
    throw new Error("useKeycloak must be used within a KeycloakProvider")
  }
  return context
}

export { keycloak }
