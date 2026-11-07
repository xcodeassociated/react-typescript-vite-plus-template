import { useMemo } from "react"
import { useMutation, useQuery } from "@apollo/client/react"

import { graphql } from "@/graphql/generated"

export const PERMISSIONS_PAGE_SIZE = 8

// THE permission data layer for the whole app: the header widget (paginated
// CRUD) and the users-page roles combobox (one flat fetch) share these
// documents — one cache, one refetch mechanism, entities normalized by id.

export const PermissionsListDocument = graphql(`
  query PermissionsList(
    $page: Int
    $size: Int
    $sort: String
    $direction: String
  ) {
    getAllPermissions(
      page: $page
      size: $size
      sort: $sort
      direction: $direction
    ) {
      id
      name
      description
      version
    }
  }
`)

export const PermissionsSizeDocument = graphql(`
  query PermissionsSize {
    getPermissionsSize
  }
`)

export const CreatePermissionDocument = graphql(`
  mutation CreatePermission($input: PermissionInput) {
    createPermission(input: $input) {
      id
      name
      description
      version
    }
  }
`)

export const UpdatePermissionDocument = graphql(`
  mutation UpdatePermission($id: String, $input: PermissionInput) {
    updatePermission(id: $id, input: $input) {
      id
      name
      description
      version
    }
  }
`)

export const DeletePermissionDocument = graphql(`
  mutation DeletePermission($id: String) {
    deletePermission(id: $id)
  }
`)

export interface PermissionRow {
  id: string
  name: string
  description: string
  version?: number | undefined
}

const refresh = {
  refetchQueries: [PermissionsListDocument, PermissionsSizeDocument],
}

// The one permission data layer for the app. Mutations refetch the active
// PermissionsList/Size queries, so every consumer of the shared document (the
// widget list AND the users-page roles combobox) refreshes from the same hook.
export function usePermissionMutations() {
  const [createPermission] = useMutation(CreatePermissionDocument, refresh)
  const [updatePermission] = useMutation(UpdatePermissionDocument, refresh)
  const [deletePermission] = useMutation(DeletePermissionDocument, refresh)

  return { createPermission, updatePermission, deletePermission }
}

// Split into size + list so the caller can clamp the page against the total
// while rendering, without an effect-driven setState.
export function usePermissionsSizeGraphql(enabled: boolean) {
  const size = useQuery(PermissionsSizeDocument, {
    skip: !enabled,
    // cache-first would never hit the network on reopen and show stale rows
    fetchPolicy: "cache-and-network",
  })

  return {
    total: size.data?.getPermissionsSize ?? 0,
    loading: size.loading,
    error: size.error,
  }
}

export function usePermissionsListGraphql(
  enabled: boolean,
  page = 0,
  size = PERMISSIONS_PAGE_SIZE
) {
  const list = useQuery(PermissionsListDocument, {
    skip: !enabled,
    // cache-first would never hit the network on reopen and show stale rows
    fetchPolicy: "cache-and-network",
    variables: {
      page,
      size,
      sort: "id",
      direction: "ASC",
    },
  })

  const permissions = useMemo<PermissionRow[]>(
    () =>
      (list.data?.getAllPermissions ?? []).flatMap((permission) =>
        permission
          ? [
              {
                id: permission.id,
                name: permission.name,
                description: permission.description ?? "",
                version: permission.version ?? undefined,
              },
            ]
          : []
      ),
    [list.data]
  )

  return {
    permissions,
    loaded: list.data !== undefined,
    loading: list.loading,
    error: list.error,
    refetch: list.refetch,
  }
}
