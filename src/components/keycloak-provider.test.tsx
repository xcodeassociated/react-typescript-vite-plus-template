import { StrictMode, act } from "react"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"

// Controllable stand-in for the keycloak-js singleton (exported by
// @/lib/keycloak and used by the provider, getAccessToken, usersApi, apollo).
const kc = vi.hoisted(() => ({
  init: vi.fn<(options: Record<string, unknown>) => Promise<boolean>>(),
  login: vi.fn<(options?: Record<string, unknown>) => Promise<void>>(),
  logout: vi.fn<(options?: Record<string, unknown>) => Promise<void>>(),
  updateToken: vi.fn<(minValidity?: number) => Promise<boolean>>(),
  authenticated: false,
  token: undefined as string | undefined,
  idToken: undefined as string | undefined,
  onReady: undefined as ((authenticated?: boolean) => void) | undefined,
  onAuthSuccess: undefined as (() => void) | undefined,
  onAuthError: undefined as ((errorData?: unknown) => void) | undefined,
  onAuthRefreshSuccess: undefined as (() => void) | undefined,
  onAuthRefreshError: undefined as (() => void) | undefined,
  onAuthLogout: undefined as (() => void) | undefined,
  onTokenExpired: undefined as (() => void) | undefined,
}))

vi.mock("@/lib/keycloak", () => ({ default: kc }))

interface KCState {
  initialized: boolean
  authenticated: boolean
  login: () => void
  logout: () => void
}

// Mirror of keycloak-js' setToken/clearToken side effects: authenticated is
// always set together with token+idToken, cleared with them.
function setSession(authenticated: boolean): void {
  kc.authenticated = authenticated
  kc.token = authenticated ? "access-token" : undefined
  kc.idToken = authenticated ? "id-token" : undefined
}

async function loadProvider() {
  // resetModules clears the module-level init-once promise so each test
  // exercises a "fresh page load".
  vi.resetModules()
  return import("@/components/keycloak-provider")
}

function makeProbe(useKeycloak: () => KCState) {
  return function Probe() {
    const state = useKeycloak()
    return (
      <div>
        <span data-testid="state">
          {JSON.stringify({
            initialized: state.initialized,
            authenticated: state.authenticated,
          })}
        </span>
        <button onClick={state.login}>login</button>
        <button onClick={state.logout}>logout</button>
      </div>
    )
  }
}

function readState(): { initialized: boolean; authenticated: boolean } {
  return JSON.parse(screen.getByTestId("state").textContent ?? "{}")
}

async function renderProvider() {
  const mod = await loadProvider()
  const Probe = makeProbe(mod.useKeycloak)
  render(
    <mod.KeycloakProvider>
      <Probe />
    </mod.KeycloakProvider>
  )
  return mod
}

beforeEach(() => {
  kc.init = vi.fn()
  kc.login = vi.fn().mockResolvedValue(undefined)
  kc.logout = vi.fn().mockResolvedValue(undefined)
  kc.updateToken = vi.fn().mockResolvedValue(false)
  setSession(false)
  kc.onReady = undefined
  kc.onAuthSuccess = undefined
  kc.onAuthError = undefined
  kc.onAuthRefreshSuccess = undefined
  kc.onAuthRefreshError = undefined
  kc.onAuthLogout = undefined
  kc.onTokenExpired = undefined
  vi.stubEnv("VITE_APP_DOMAIN", "http://localhost:3000")
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe("KeycloakProvider init", () => {
  it("renders authenticated when init resolves with a session", async () => {
    setSession(true)
    kc.init.mockResolvedValue(true)

    await renderProvider()

    await waitFor(() => {
      expect(readState()).toEqual({ initialized: true, authenticated: true })
    })
    expect(kc.init).toHaveBeenCalledWith(
      expect.objectContaining({
        onLoad: "check-sso",
        checkLoginIframe: false,
        silentCheckSsoRedirectUri:
          "http://localhost:3000/silent-check-sso.html",
      })
    )
  })

  it("renders unauthenticated when check-sso finds no session", async () => {
    kc.init.mockResolvedValue(false)

    await renderProvider()

    await waitFor(() => {
      expect(readState()).toEqual({ initialized: true, authenticated: false })
    })
  })

  it("renders unauthenticated when init rejects (auth server down)", async () => {
    kc.init.mockRejectedValue(new Error("init failed"))

    await renderProvider()

    await waitFor(() => {
      expect(readState()).toEqual({ initialized: true, authenticated: false })
    })
  })

  it("renders logged-out via watchdog when init never settles", async () => {
    vi.useFakeTimers()
    kc.init.mockReturnValue(new Promise<boolean>(() => {}))

    await renderProvider()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000)
    })
    expect(readState()).toEqual({ initialized: true, authenticated: false })
  })

  it("initializes keycloak exactly once under StrictMode", async () => {
    setSession(true)
    kc.init.mockResolvedValue(true)

    const mod = await loadProvider()
    const Probe = makeProbe(mod.useKeycloak)
    render(
      <StrictMode>
        <mod.KeycloakProvider>
          <Probe />
        </mod.KeycloakProvider>
      </StrictMode>
    )

    await waitFor(() => {
      expect(readState().initialized).toBe(true)
    })
    expect(kc.init).toHaveBeenCalledTimes(1)
  })
})

describe("KeycloakProvider lifecycle events", () => {
  it("marks unauthenticated when keycloak fires onAuthLogout (session lost)", async () => {
    setSession(true)
    kc.init.mockResolvedValue(true)

    await renderProvider()
    await waitFor(() => {
      expect(readState().authenticated).toBe(true)
    })

    act(() => {
      setSession(false)
      kc.onAuthLogout?.()
    })

    expect(readState()).toEqual({ initialized: true, authenticated: false })
  })

  it("refreshes proactively when onTokenExpired fires", async () => {
    setSession(true)
    kc.init.mockResolvedValue(true)
    kc.updateToken.mockResolvedValue(true)

    await renderProvider()
    await waitFor(() => {
      expect(readState().authenticated).toBe(true)
    })

    act(() => {
      kc.onTokenExpired?.()
    })

    expect(kc.updateToken).toHaveBeenCalledWith(60)
  })

  it("does NOT log out on a transient refresh error (token still valid)", async () => {
    setSession(true)
    kc.init.mockResolvedValue(true)
    kc.updateToken.mockRejectedValue(new Error("network"))

    await renderProvider()
    await waitFor(() => {
      expect(readState().authenticated).toBe(true)
    })

    act(() => {
      kc.onAuthRefreshError?.()
    })

    // keycloak-js only clears the session on a 400 from the token endpoint
    // (which fires onAuthLogout); a network blip must keep the session.
    expect(readState()).toEqual({ initialized: true, authenticated: true })
  })

  it("refreshes on the idle backstop timer while authenticated", async () => {
    vi.useFakeTimers()
    setSession(true)
    kc.init.mockResolvedValue(true)

    await renderProvider()
    await vi.advanceTimersByTimeAsync(61_000)

    expect(kc.updateToken).toHaveBeenCalled()
    expect(readState()).toEqual({ initialized: true, authenticated: true })
  })

  it("detaches all event handlers on unmount", async () => {
    kc.init.mockResolvedValue(false)

    const mod = await loadProvider()
    const Probe = makeProbe(mod.useKeycloak)
    const view = render(
      <mod.KeycloakProvider>
        <Probe />
      </mod.KeycloakProvider>
    )
    await waitFor(() => {
      expect(readState().initialized).toBe(true)
    })

    view.unmount()

    expect(kc.onReady).toBeUndefined()
    expect(kc.onAuthSuccess).toBeUndefined()
    expect(kc.onAuthError).toBeUndefined()
    expect(kc.onAuthRefreshSuccess).toBeUndefined()
    expect(kc.onAuthRefreshError).toBeUndefined()
    expect(kc.onAuthLogout).toBeUndefined()
    expect(kc.onTokenExpired).toBeUndefined()
  })
})

describe("KeycloakProvider login/logout", () => {
  it("login redirects via keycloak with the current URL", async () => {
    kc.init.mockResolvedValue(false)

    await renderProvider()
    await waitFor(() => {
      expect(readState().initialized).toBe(true)
    })

    await act(async () => {
      screen.getByText("login").click()
    })

    expect(kc.login).toHaveBeenCalledWith({ redirectUri: window.location.href })
  })

  it("logout redirects to the app root via keycloak", async () => {
    setSession(true)
    kc.init.mockResolvedValue(true)

    await renderProvider()
    await waitFor(() => {
      expect(readState().initialized).toBe(true)
    })

    await act(async () => {
      screen.getByText("logout").click()
    })

    expect(kc.logout).toHaveBeenCalledWith({
      redirectUri: "http://localhost:3000/",
    })
  })
})

describe("getAccessToken", () => {
  it("refreshes when needed and returns the token", async () => {
    setSession(true)
    kc.updateToken.mockResolvedValue(false)
    kc.init.mockResolvedValue(true)

    const { getAccessToken } = await loadProvider()
    const token = await getAccessToken()

    expect(kc.updateToken).toHaveBeenCalledWith(60)
    expect(token).toBe("access-token")
  })

  it("still returns the token when the refresh fails transiently", async () => {
    setSession(true)
    kc.updateToken.mockRejectedValue(new Error("network"))
    kc.init.mockResolvedValue(true)

    const { getAccessToken } = await loadProvider()

    await expect(getAccessToken()).resolves.toBe("access-token")
  })

  it("returns undefined when unauthenticated", async () => {
    setSession(false)
    kc.updateToken.mockRejectedValue(new Error("no refresh token"))
    kc.init.mockResolvedValue(false)

    const { getAccessToken } = await loadProvider()

    await expect(getAccessToken()).resolves.toBeUndefined()
  })
})

describe("useKeycloak", () => {
  it("throws when used outside the provider", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const mod = await loadProvider()
    const Probe = makeProbe(mod.useKeycloak)

    expect(() => render(<Probe />)).toThrow(
      "useKeycloak must be used within a KeycloakProvider"
    )
    spy.mockRestore()
  })
})
