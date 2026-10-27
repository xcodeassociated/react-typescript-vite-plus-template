import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

import keycloak from '@/lib/keycloak'

export interface KeycloakContextValue {
  initialized: boolean
  authenticated: boolean
  login: () => void
  logout: () => void
  updateToken: () => Promise<boolean>
}

const KeycloakContext = createContext<KeycloakContextValue | undefined>(undefined)

interface KeycloakProviderProps {
  children: ReactNode
}

const TOKEN_MINI_VALIDITY_SECONDS = 60
const TOKEN_REFRESH_INTERVAL_MS = 30_000

export function KeycloakProvider({ children }: KeycloakProviderProps) {
  const [initialized, setInitialized] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)

  useEffect(() => {
    let cancelled = false

    keycloak
      .init({
        onLoad: 'check-sso',
        silentCheckSsoRedirectUri: `${import.meta.env.VITE_APP_DOMAIN}/silent-check-sso.html`,
        checkLoginIframe: false,
      })
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
      keycloak
        .updateToken(TOKEN_MINI_VALIDITY_SECONDS)
        .then((granted) => {
          if (!granted) {
            setAuthenticated(false)
          }
        })
        .catch(() => {
          setAuthenticated(false)
        })
    }, TOKEN_REFRESH_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [initialized, authenticated])

  const login = useCallback(() => {
    keycloak.login({ redirectUri: window.location.href }).then(() => {})
  }, [])

  const logout = useCallback(() => {
    keycloak
      .logout({ redirectUri: `${import.meta.env.VITE_APP_DOMAIN}/` })
      .then(() => {})
      .catch((error: unknown) => console.error('Keycloak logout failed', error))
  }, [])

  const updateToken = useCallback(async () => {
    try {
      return await keycloak.updateToken(TOKEN_MINI_VALIDITY_SECONDS)
    } catch {
      setAuthenticated(false)
      return false
    }
  }, [])

  const value: KeycloakContextValue = { initialized, authenticated, login, logout, updateToken }

  return <KeycloakContext.Provider value={value}>{children}</KeycloakContext.Provider>
}

export function useKeycloak(): KeycloakContextValue {
  const context = useContext(KeycloakContext)
  if (!context) {
    throw new Error('useKeycloak must be used within a KeycloakProvider')
  }
  return context
}

export { keycloak }
