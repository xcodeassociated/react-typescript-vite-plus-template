import { useCallback, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import type {
  OnChangeFn,
  PaginationState,
  SortingState,
} from "@tanstack/react-table"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { DataTable } from "@/pages/users/components/data-table"
import { SseStatusBar } from "@/pages/users/components/sse-status-bar"
import { LoadingScreenMemo } from "@/components/loading-screen"
import { UserDialog } from "./components/user-dialog"
import { usersApi } from "./api/usersApi"
import type { User, UserInput } from "./api/usersApi.types"
import { useUserColumns } from "./hooks/useColumns"
import { useRolesGraphql } from "./hooks/useRolesGraphql"
import { useSimpleSSE } from "./hooks/useSseUsers"

const DEFAULT_PAGE_SIZE = 5

const EMPTY_USERS: User[] = []

function toUserInput(user: User): UserInput {
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    version: user.version,
  }
}

export function Users() {
  const { t } = useTranslation("main")
  const [searchParams, setSearchParams] = useSearchParams()

  const pagination = useMemo<PaginationState>(
    () => ({
      pageIndex: Number(searchParams.get("page") ?? 0),
      pageSize: Number(searchParams.get("size") ?? DEFAULT_PAGE_SIZE),
    }),
    [searchParams]
  )

  const sorting = useMemo<SortingState>(
    () => [
      {
        id: searchParams.get("sort") ?? "_id",
        desc: searchParams.get("desc") === "true",
      },
    ],
    [searchParams]
  )

  const updateParams = useCallback(
    (patch: Record<string, string>) => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous)
          for (const [key, value] of Object.entries(patch)) {
            next.set(key, value)
          }
          return next
        },
        { replace: true }
      )
    },
    [setSearchParams]
  )

  const handlePaginationChange: OnChangeFn<PaginationState> = useCallback(
    (updater) => {
      const next = typeof updater === "function" ? updater(pagination) : updater
      updateParams({ page: `${next.pageIndex}`, size: `${next.pageSize}` })
    },
    [pagination, updateParams]
  )

  const handleSortingChange: OnChangeFn<SortingState> = useCallback(
    (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater
      updateParams({ sort: next[0].id, desc: `${next[0].desc}` })
    },
    [sorting, updateParams]
  )

  const direction = sorting[0].desc ? "DESC" : "ASC"
  const users = usersApi.useGetAllUsersQuery({
    page: pagination.pageIndex,
    pageSize: pagination.pageSize,
    sort: sorting[0].id,
    direction,
  })
  const usersCount = usersApi.useGetUsersSizeQuery()
  const [createUser] = usersApi.useCreateUserMutation()
  const [updateUser] = usersApi.useUpdateUserMutation()
  const [deleteUser] = usersApi.useDeleteUserMutation()

  const { roles } = useRolesGraphql()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<UserInput | undefined>(undefined)

  const handleEdit = useCallback((user: User) => {
    setEditing(toUserInput(user))
    setDialogOpen(true)
  }, [])

  const handleDelete = useCallback(
    (user: User) => {
      if (user._id === undefined) {
        return
      }
      deleteUser(user._id)
        .unwrap()
        .then(() => toast.success(t("users.delete")))
        .catch(() => toast.error(t("error.not_found")))
    },
    [deleteUser, t]
  )

  const columns = useUserColumns({ onEdit: handleEdit, onDelete: handleDelete })

  const { connectionStatus, lastMessage, reconnect } = useSimpleSSE(
    `${import.meta.env.VITE_APP_BACKEND_URL}/update/user`,
    {
      onUpdate: () => {
        void users.refetch()
      },
    }
  )

  const handleSubmit = useCallback(
    (data: UserInput) => {
      const mutation =
        data._id === undefined ? createUser(data) : updateUser(data)
      mutation.unwrap().catch(() => toast.error(t("users.f1")))
    },
    [createUser, updateUser, t]
  )

  const emptyUsers = EMPTY_USERS

  if (users.isError) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-4">
        <SseStatusBar
          connectionStatus={connectionStatus}
          lastMessage={lastMessage}
          onReconnect={reconnect}
        />
        <div className="text-center text-lg font-medium">
          {t("error.not_found")}
        </div>
      </div>
    )
  }

  if (users.isLoading) {
    return <LoadingScreenMemo />
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <SseStatusBar
        connectionStatus={connectionStatus}
        lastMessage={lastMessage}
        onReconnect={reconnect}
      />
      <Card>
        <CardHeader>
          <CardTitle>{t("users.t1")}</CardTitle>
          <CardDescription>{t("users.t2")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex w-full min-w-0 flex-col gap-4">
            <UserDialog
              open={dialogOpen}
              onOpenChange={setDialogOpen}
              data={editing}
              roles={roles ?? []}
              onSubmit={handleSubmit}
            />
            <Button
              variant="outline"
              className="self-end"
              onClick={() => {
                setEditing(undefined)
                setDialogOpen(true)
              }}
            >
              {t("users.add")}
            </Button>
            <DataTable
              columns={columns}
              data={users.data ?? emptyUsers}
              total={usersCount.data ?? 0}
              pagination={pagination}
              onPaginationChange={handlePaginationChange}
              sorting={sorting}
              onSortingChange={handleSortingChange}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
