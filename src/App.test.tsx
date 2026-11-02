import type { ReactNode } from "react"
import { Provider } from "react-redux"
import { render, screen, waitFor } from "@testing-library/react"
import { BrowserRouter } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"

import App from "@/App"
import { ThemeProvider } from "@/providers/theme"
import { setupStore } from "@/store/store"

// Controllable auth state so the same App tree can be exercised as an
// authenticated and a logged-out visitor.
const kcState = vi.hoisted(() => ({ authenticated: true }))

vi.mock("@/providers/keycloak", () => ({
  useKeycloak: () => ({
    initialized: true,
    authenticated: kcState.authenticated,
    login: vi.fn(),
    logout: vi.fn(),
    updateToken: vi.fn().mockResolvedValue(true),
    expireSession: vi.fn(),
  }),
  KeycloakProvider: ({ children }: { children: ReactNode }) => children,
  keycloak: { token: "test-token" },
  getAccessToken: async () => "test-token",
}))

function renderApp() {
  return render(
    <Provider store={setupStore()}>
      <ThemeProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ThemeProvider>
    </Provider>
  )
}

beforeEach(() => {
  kcState.authenticated = true
  window.history.pushState({}, "", "/")
})

afterEach(() => {
  window.history.pushState({}, "", "/")
})

describe("App tests", () => {
  it("home renders with keycloak authorized", async () => {
    renderApp()

    await waitFor(() => {
      // note: restricted menu items are shown only after login
      expect(screen.getByRole("link", { name: "Counter" })).toBeInTheDocument()
      expect(screen.getByRole("link", { name: "Users" })).toBeInTheDocument()
    })
  })

  it("shows the home headline", async () => {
    renderApp()

    await waitFor(() => {
      expect(screen.getByText("Vite+ + shadcn/ui Starter")).toBeInTheDocument()
    })
  })
})

describe("ProtectedRoute access control", () => {
  it("denies a logged-out visitor the users page", async () => {
    kcState.authenticated = false
    window.history.pushState({}, "", "/users")

    renderApp()

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Unauthorized" })
      ).toBeInTheDocument()
    })
    expect(window.location.pathname).toBe("/unauthorized")
    // No trace of the page: neither the table chrome nor its actions
    expect(
      screen.queryByRole("button", { name: /add user/i })
    ).not.toBeInTheDocument()
    expect(screen.queryByText("Users Table")).not.toBeInTheDocument()
  })

  it("denies a logged-out visitor the counter page", async () => {
    kcState.authenticated = false
    window.history.pushState({}, "", "/counter")

    renderApp()

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Unauthorized" })
      ).toBeInTheDocument()
    })
    expect(window.location.pathname).toBe("/unauthorized")
  })

  it("keeps restricted menu items hidden while logged out", async () => {
    kcState.authenticated = false

    renderApp()

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Home" })).toBeInTheDocument()
    })
    expect(
      screen.queryByRole("link", { name: "Users" })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("link", { name: "Counter" })
    ).not.toBeInTheDocument()
  })

  // Authenticated /users rendering is covered hermetically in Users.test.tsx;
  // mounting it here would reach the real backend.
})
