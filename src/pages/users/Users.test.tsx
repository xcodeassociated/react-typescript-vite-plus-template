import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from "vite-plus/test"
import { MockedProvider } from "@apollo/client/testing/react"
import { Provider } from "react-redux"
import { render, screen, waitFor } from "@testing-library/react"
import { BrowserRouter } from "react-router-dom"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"

import { ThemeProvider } from "@/providers/theme"
import { GetAllPermissionsDocument } from "@/graphql/generated/graphql"
import { setupStore } from "@/store/store"
import "@/locales/i18n"
import { Users } from "./Users"

const mockedRolesGql = {
  request: {
    query: GetAllPermissionsDocument,
    variables: { page: 0, size: 50, sort: "id", direction: "ASC" },
  },
  result: {
    data: {
      getAllPermissions: [{ id: "63c16ce71ba30e5f08b4d66e", name: "GUEST" }],
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

describe("Users component tests", () => {
  beforeAll(() => server.listen())
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  it("renders users fetched via RTK Query and roles via GraphQL", async () => {
    render(
      <MockedProvider mocks={[mockedRolesGql]}>
        <Provider store={setupStore()}>
          <ThemeProvider>
            <BrowserRouter>
              <Users />
            </BrowserRouter>
          </ThemeProvider>
        </Provider>
      </MockedProvider>
    )

    await waitFor(() => {
      expect(screen.getByText("John Snow")).toBeInTheDocument()
    })
    expect(screen.getByText("john.snow@email.com")).toBeInTheDocument()
    expect(screen.getByText("GUEST")).toBeInTheDocument()
  })

  it("shows the add-user action", async () => {
    render(
      <MockedProvider mocks={[mockedRolesGql]}>
        <Provider store={setupStore()}>
          <ThemeProvider>
            <BrowserRouter>
              <Users />
            </BrowserRouter>
          </ThemeProvider>
        </Provider>
      </MockedProvider>
    )

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /add user/i })
      ).toBeInTheDocument()
    })
  })
})
