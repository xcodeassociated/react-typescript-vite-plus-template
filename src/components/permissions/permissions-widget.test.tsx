import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { MockedProvider } from "@apollo/client/testing/react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

import "@/locales/i18n"
import { PermissionsWidget } from "@/components/permissions/permissions-widget"
import {
  CreatePermissionDocument,
  DeletePermissionDocument,
  PERMISSIONS_PAGE_SIZE,
  PermissionsListDocument,
  PermissionsSizeDocument,
  UpdatePermissionDocument,
} from "@/components/permissions/usePermissionsGraphql"

interface MockPermission {
  id: string
  name: string
  description: string | null
  version: number | null
}

const admin: MockPermission = {
  id: "p1",
  name: "ADMIN",
  description: "Full access",
  version: 0,
}

const listMock = (permissions: MockPermission[]) => ({
  request: {
    query: PermissionsListDocument,
    variables: {
      page: 0,
      size: PERMISSIONS_PAGE_SIZE,
      sort: "id",
      direction: "ASC",
    },
  },
  result: { data: { getAllPermissions: permissions } },
})

const sizeMock = (getPermissionsSize: number) => ({
  request: { query: PermissionsSizeDocument },
  result: { data: { getPermissionsSize } },
})

function renderWidget(mocks: unknown[]) {
  render(
    <MockedProvider mocks={mocks as never}>
      <PermissionsWidget />
    </MockedProvider>
  )
}

function openWidget() {
  fireEvent.click(screen.getByRole("button", { name: "Permissions" }))
}

describe("PermissionsWidget", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("lists permissions fetched via GraphQL when opened", async () => {
    renderWidget([listMock([admin]), sizeMock(1)])
    openWidget()

    await waitFor(() => {
      expect(screen.getByText("ADMIN")).toBeInTheDocument()
    })
    expect(screen.getByText("Full access")).toBeInTheDocument()
  })

  it("creates a permission via createPermission and refreshes the list", async () => {
    const editor: MockPermission = {
      id: "p2",
      name: "EDITOR",
      description: null,
      version: 0,
    }
    renderWidget([
      listMock([admin]),
      sizeMock(1),
      {
        request: {
          query: CreatePermissionDocument,
          variables: { input: { name: "EDITOR", description: null } },
        },
        result: { data: { createPermission: editor } },
      },
      listMock([admin, editor]),
      sizeMock(2),
    ])
    openWidget()

    await waitFor(() => {
      expect(screen.getByText("ADMIN")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: "Add Permission" }))
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "EDITOR" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Submit" }))

    await waitFor(() => {
      expect(screen.getByText("EDITOR")).toBeInTheDocument()
    })
  })

  it("updates a permission inline via updatePermission", async () => {
    const renamed: MockPermission = {
      id: "p1",
      name: "SUPER",
      description: "Full access",
      version: 1,
    }
    renderWidget([
      listMock([admin]),
      sizeMock(1),
      {
        request: {
          query: UpdatePermissionDocument,
          variables: {
            id: "p1",
            input: { name: "SUPER", description: "Full access", version: 0 },
          },
        },
        result: { data: { updatePermission: renamed } },
      },
      listMock([renamed]),
      sizeMock(1),
    ])
    openWidget()

    await waitFor(() => {
      expect(screen.getByText("ADMIN")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: "Update" }))
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "SUPER" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Submit" }))

    await waitFor(() => {
      expect(screen.getByText("SUPER")).toBeInTheDocument()
    })
  })

  it("deletes a permission via deletePermission and refreshes the list", async () => {
    renderWidget([
      listMock([admin]),
      sizeMock(1),
      {
        request: {
          query: DeletePermissionDocument,
          variables: { id: "p1" },
        },
        result: { data: { deletePermission: true } },
      },
      listMock([]),
      sizeMock(0),
    ])
    openWidget()

    await waitFor(() => {
      expect(screen.getByText("ADMIN")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: "Delete" }))

    await waitFor(() => {
      expect(screen.getByText("No permissions found")).toBeInTheDocument()
    })
    expect(screen.queryByText("ADMIN")).not.toBeInTheDocument()
  })

  it("hides the add form after cancel", async () => {
    renderWidget([listMock([admin]), sizeMock(1)])
    openWidget()

    await waitFor(() => {
      expect(screen.getByText("ADMIN")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: "Add Permission" }))
    expect(screen.getByLabelText("Name")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Add Permission" }))
  })
})
