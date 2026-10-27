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
  updateToken: () => Promise<boolean>
}

const KeycloakContext = createContext<KeycloakContextValue | undefined>(
  undefined
)

interface KeycloakProviderProps {
  children: ReactNode
}

const TOKEN_MINI_VALIDITY_SECONDS = 60
const TOKEN_REFRESH_INTERVAL_MS = 30_000

// Initialize the shared Keycloak instance exactly once, even under React
// StrictMode's double effect invocation in development. Without this guard,
// init() runs twice, opening two silent-SSO iframes and double-processing the
// login authorization code.
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

export function KeycloakProvider({ children }: KeycloakProviderProps) {
  const [initialized, setInitialized] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)

  useEffect(() => {
    let cancelled = false

    initKeycloak()
      .then((auth) => {
        if (!cancelled) {
          setAuthenticated(auth)
          setInitialized(true)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setInitialized(true)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  // keep the access token fresh for REST/GraphQL/SSE requests made while idle
  useEffect(() => {
    if (!initialized || !authenticated) {
      return
    }

    const interval = setInterval(() => {
      // resolves true when the token was refreshed, false when it is still
      // valid for at least minValidity seconds; rejects only when the session
      // is actually gone (refresh failed)
      keycloak
        .updateToken(TOKEN_MINI_VALIDITY_SECONDS)
        .catch(() => setAuthenticated(false))
    }, TOKEN_REFRESH_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [initialized, authenticated])

  const login = useCallback(() => {
    void keycloak
      .login({ redirectUri: window.location.href })
      .catch((error: unknown) => console.error("Keycloak login failed", error))
  }, [])

  const logout = useCallback(() => {
    keycloak
      .logout({ redirectUri: `${import.meta.env.VITE_APP_DOMAIN}/` })
      .then(() => {})
      .catch((error: unknown) => console.error("Keycloak logout failed", error))
  }, [])

  const updateToken = useCallback(async () => {
    try {
      return await keycloak.updateToken(TOKEN_MINI_VALIDITY_SECONDS)
    } catch {
      setAuthenticated(false)
      return false
    }
  }, [])

  const value: KeycloakContextValue = {
    initialized,
    authenticated,
    login,
    logout,
    updateToken,
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
