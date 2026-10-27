import type { ReactNode } from "react"
import { Provider } from "react-redux"
import { render, screen, waitFor } from "@testing-library/react"
import { BrowserRouter } from "react-router-dom"
import { describe, expect, it, vi } from "vite-plus/test"

import App from "@/App"
import { ThemeProvider } from "@/components/theme-provider"
import { setupStore } from "@/store/store"

vi.mock("@/components/keycloak-provider", () => ({
  useKeycloak: () => ({
    initialized: true,
    authenticated: true,
    login: vi.fn(),
    logout: vi.fn(),
    updateToken: vi.fn().mockResolvedValue(true),
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
