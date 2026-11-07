import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test"
import { MockedProvider } from "@apollo/client/testing/react"
import { Provider } from "react-redux"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { BrowserRouter } from "react-router-dom"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"

import { ThemeProvider } from "@/providers/theme"
import { PermissionsListDocument } from "@/components/permissions/usePermissionsGraphql"
import { setupStore } from "@/store/store"
import "@/locales/i18n"
import { usersApi } from "./api/usersApi"
import { Users } from "./Users"

// The page reads the app-level stream from NotificationsProvider; the stream
// itself (and the revocation wiring) is covered in notifications.test.tsx.
const notificationsState = vi.hoisted(() => ({
  connectionStatus: "connected" as
    | "connecting"
    | "connected"
    | "reconnecting"
    | "disconnected"
    | "logged_out",
  lastMessage: null as null | { from: string; to: string; content: string },
  reconnect: vi.fn(),
}))

vi.mock("@/providers/notifications", () => ({
  useNotifications: () => notificationsState,
}))

// usersApi's prepareHeaders resolves getAccessToken from the provider module.
vi.mock("@/providers/keycloak", () => ({
  getAccessToken: async () => "test-token",
}))

// The roles combobox shares the widget's PermissionsList document (flat page).
const mockedRolesGql = {
  request: {
    query: PermissionsListDocument,
    variables: { page: 0, size: 50, sort: "id", direction: "ASC" },
  },
  result: {
    data: {
      getAllPermissions: [
        {
          id: "63c16ce71ba30e5f08b4d66e",
          name: "GUEST",
          description: "Anonymous user who can only read info",
          version: 0,
        },
      ],
    },
  },
}

const mockedUsers = [
  {
    _id: "63c16cfe1ba30e5f08b4d66f",
    name: "John Snow",
    email: "john.snow@email.com",
    role: [
      {
        _id: "63c16ce71ba30e5f08b4d66e",
        name: "GUEST",
        description: "Anonymous user who can only read info",
      },
    ],
  },
]

const server = setupServer(
  http.get(`${import.meta.env.VITE_APP_BACKEND_URL}/coroutine/users`, () =>
    HttpResponse.json(mockedUsers)
  ),
  http.get(`${import.meta.env.VITE_APP_BACKEND_URL}/coroutine/usersCount`, () =>
    HttpResponse.json(1)
  )
)

function renderUsers(store = setupStore()) {
  return {
    store,
    ...render(
      <MockedProvider mocks={[mockedRolesGql]}>
        <Provider store={store}>
          <ThemeProvider>
            <BrowserRouter>
              <Users />
            </BrowserRouter>
          </ThemeProvider>
        </Provider>
      </MockedProvider>
    ),
  }
}

describe("Users component tests", () => {
  beforeAll(() => server.listen())
  beforeEach(() => {
    notificationsState.connectionStatus = "connected"
    notificationsState.lastMessage = null
  })
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  it("renders users fetched via RTK Query and roles via GraphQL", async () => {
    renderUsers()

    await waitFor(() => {
      expect(screen.getByText("John Snow")).toBeInTheDocument()
    })
    expect(screen.getByText("john.snow@email.com")).toBeInTheDocument()
    expect(screen.getByText("GUEST")).toBeInTheDocument()
  })

  it("shows the add-user action", async () => {
    renderUsers()

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /add user/i })
      ).toBeInTheDocument()
    })
  })

  it("renders the stream status from the app-level context", async () => {
    notificationsState.connectionStatus = "reconnecting"
    renderUsers()

    await waitFor(() => {
      expect(
        screen.getByText("Reconnecting to live updates...")
      ).toBeInTheDocument()
    })
  })

  it("shows the last update broadcast from the context", async () => {
    notificationsState.lastMessage = {
      from: "SYSTEM",
      to: "ALL",
      content: "USER_CREATED: abc123",
    }
    renderUsers()

    await waitFor(() => {
      expect(screen.getByText("John Snow")).toBeInTheDocument()
    })
    expect(
      screen.getByText(/Last update: USER_CREATED: abc123/)
    ).toBeInTheDocument()
  })

  it("shows the error card and recovers via Try again", async () => {
    // backend down at first load: nothing cached -> standard error card
    server.use(
      http.get(`${import.meta.env.VITE_APP_BACKEND_URL}/coroutine/users`, () =>
        HttpResponse.error()
      ),
      http.get(
        `${import.meta.env.VITE_APP_BACKEND_URL}/coroutine/usersCount`,
        () => HttpResponse.error()
      )
    )
    renderUsers()
    await waitFor(() => {
      expect(screen.getByText("Something went wrong")).toBeInTheDocument()
    })

    // backend comes back -> Retry refetches and the table renders
    server.use(
      http.get(`${import.meta.env.VITE_APP_BACKEND_URL}/coroutine/users`, () =>
        HttpResponse.json(mockedUsers)
      ),
      http.get(
        `${import.meta.env.VITE_APP_BACKEND_URL}/coroutine/usersCount`,
        () => HttpResponse.json(1)
      )
    )
    fireEvent.click(screen.getByRole("button", { name: /try again/i }))
    await waitFor(() => {
      expect(screen.getByText("John Snow")).toBeInTheDocument()
    })
  })

  it("keeps cached rows with a stale notice when a refresh fails", async () => {
    let online = true
    server.use(
      http.get(`${import.meta.env.VITE_APP_BACKEND_URL}/coroutine/users`, () =>
        online ? HttpResponse.json(mockedUsers) : HttpResponse.error()
      )
    )
    const { store } = renderUsers()
    await waitFor(() => {
      expect(screen.getByText("John Snow")).toBeInTheDocument()
    })

    // backend dies; a cache-invalidation (SSE-style) refresh now fails
    online = false
    act(() => {
      store.dispatch(usersApi.util.invalidateTags(["users"]))
    })

    await waitFor(() => {
      expect(
        screen.getByText("The data may be out of date.")
      ).toBeInTheDocument()
    })
    // the usable data is NOT thrown away
    expect(screen.getByText("John Snow")).toBeInTheDocument()
  })
})
