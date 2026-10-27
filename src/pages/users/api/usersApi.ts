import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react"

import { getAccessToken } from "@/components/keycloak-provider"
import type { Page, User, UserInput, UserInputDto } from "./usersApi.types"

function toDto(data: UserInput): UserInputDto {
  return {
    _id: data._id,
    name: data.name,
    email: data.email,
    role: data.role.map((r) => r._id ?? ""),
    version: data.version,
  }
}

export const usersApi = createApi({
  tagTypes: ["users", "usersCount"],
  reducerPath: "usersApi",
  baseQuery: fetchBaseQuery({
    baseUrl: `${import.meta.env.VITE_APP_BACKEND_URL}/coroutine`,
    // Proactively refresh so requests after idle never send an expired token
    // (updateToken is a no-op while the token is fresh).
    prepareHeaders: async (headers) => {
      const token = await getAccessToken()
      if (token) {
        headers.set("authorization", `Bearer ${token}`)
      }
      return headers
    },
  }),
  endpoints: (builder) => ({
    getAllUsers: builder.query<User[], Page>({
      query: ({ page, pageSize, sort, direction }) =>
        `/users?page=${page}&size=${pageSize}&sort=${sort}&direction=${direction}`,
      providesTags: ["users"],
    }),
    getUsersSize: builder.query<number, void>({
      query: () => "/usersCount",
      providesTags: ["usersCount"],
    }),
    getUser: builder.query<User, string>({
      query: (id: string) => `/users/${id}`,
    }),
    // note: no optimistic locking for create, because the new user's ID is unknown
    createUser: builder.mutation<User, UserInput>({
      query: (data: UserInput) => ({
        url: "/users",
        method: "POST",
        body: toDto(data),
      }),
      invalidatesTags: ["users", "usersCount"],
    }),
    updateUser: builder.mutation<User, UserInput>({
      query: (data: UserInput) => ({
        url: `/users/${data._id}`,
        method: "PUT",
        body: toDto(data),
      }),
      async onQueryStarted({ _id, name, email, role }, api) {
        for (const {
          endpointName,
          originalArgs,
        } of usersApi.util.selectInvalidatedBy(api.getState(), [
          { type: "users" },
        ])) {
          if (endpointName !== "getAllUsers") continue
          const patchResult = api.dispatch(
            usersApi.util.updateQueryData(endpointName, originalArgs, (draft) =>
              draft.map((user): User =>
                user._id === _id ? { ...user, name, email, role } : user
              )
            )
          )
          try {
            await api.queryFulfilled
          } catch {
            patchResult.undo()
          }
        }
      },
      invalidatesTags: ["users", "usersCount"],
    }),
    deleteUser: builder.mutation<boolean, string>({
      query: (id: string) => ({
        url: `/users/${id}`,
        method: "DELETE",
      }),
      async onQueryStarted(id, api) {
        for (const {
          endpointName,
          originalArgs,
        } of usersApi.util.selectInvalidatedBy(api.getState(), [
          { type: "users" },
        ])) {
          if (endpointName !== "getAllUsers") continue
          const patchResult = api.dispatch(
            usersApi.util.updateQueryData(endpointName, originalArgs, (draft) =>
              draft.filter((user) => user._id !== id)
            )
          )
          try {
            await api.queryFulfilled
          } catch {
            patchResult.undo()
          }
        }
      },
      invalidatesTags: ["users", "usersCount"],
    }),
  }),
})

export const {
  useGetAllUsersQuery,
  useGetUsersSizeQuery,
  useGetUserQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
  useDeleteUserMutation,
} = usersApi
