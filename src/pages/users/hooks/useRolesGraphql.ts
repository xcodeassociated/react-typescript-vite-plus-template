import { useMemo } from 'react'
import { useQuery } from '@apollo/client/react'

import { graphql } from '@/graphql/generated'
import type { Role } from '@/pages/users/api/usersApi.types'

export const GetAllPermissionsDocument = graphql(`
  query GetAllPermissions($page: Int, $size: Int, $sort: String, $direction: String) {
    getAllPermissions(page: $page, size: $size, sort: $sort, direction: $direction) {
      id
      name
    }
  }
`)

export function useRolesGraphql() {
  const { loading, error, data } = useQuery(GetAllPermissionsDocument, {
    variables: {
      page: 0,
      size: 50,
      sort: 'id',
      direction: 'ASC',
    },
  })

  const roles = useMemo<Role[] | undefined>(() => {
    if (!data?.getAllPermissions) {
      return undefined
    }
    return data.getAllPermissions.map(
      (permission): Role => ({
        _id: permission?.id ?? undefined,
        name: permission?.name ?? '',
      }),
    )
  }, [data])

  return { roles, loading, error }
}
