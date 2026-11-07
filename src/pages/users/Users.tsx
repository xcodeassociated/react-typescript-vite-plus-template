import { useCallback, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { RotateCwIcon, TriangleAlertIcon } from "lucide-react"
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
import { usePermissionsListGraphql } from "@/components/permissions/usePermissionsGraphql"
import { useNotifications } from "@/providers/notifications"
import { UserDialog } from "./components/user-dialog"
import { usersApi } from "./api/usersApi"
import type { Role, User, UserInput } from "./api/usersApi.types"
import { useUserColumns } from "./hooks/useColumns"

const DEFAULT_PAGE_SIZE = 5

// the combobox needs the full role list in one flat fetch; it shares the
// widget's PermissionsList document — same cache, same refetches
const ROLES_FETCH_SIZE = 50

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

  const { permissions: rolePermissions } = usePermissionsListGraphql(
    true,
    0,
    ROLES_FETCH_SIZE
  )
  const roles = useMemo<Role[]>(
    () =>
      rolePermissions.map((permission) => ({
        _id: permission.id,
        name: permission.name,
      })),
    [rolePermissions]
  )

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

  // Live-updates state comes from the app-level stream (NotificationsProvider):
  // revocation (`logged_out`) locks every route via expireSession, and update
  // broadcasts invalidate the users queries even when this page is not open.
  const { connectionStatus, lastMessage, reconnect } = useNotifications()

  const handleSubmit = useCallback(
    (data: UserInput) => {
      const mutation =
        data._id === undefined ? createUser(data) : updateUser(data)
      mutation.unwrap().catch(() => toast.error(t("users.f1")))
    },
    [createUser, updateUser, t]
  )

  const emptyUsers = EMPTY_USERS
  // On a failed background refetch RTK Query moves the rows to previousData;
  // treat that as still-displayable — never throw away usable data. A failed
  // REFRESH keeps the table with a short stale notice; a failure with nothing
  // to show gets the standard error card + retry. Copy is deliberately
  // generic and production-appropriate — no operational advice for users.
  const usersData =
    users.data ?? (users as { previousData?: User[] }).previousData
  const isStale = users.isError && usersData !== undefined

  if (users.isError && usersData === undefined) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-4">
        <SseStatusBar
          connectionStatus={connectionStatus}
          lastMessage={lastMessage}
          onReconnect={reconnect}
        />
        <Card>
          <CardContent>
            <div className="flex flex-col items-center gap-4 py-10 text-center">
              <TriangleAlertIcon size={32} className="text-muted-foreground" />
              <div className="text-lg font-medium">
                {t("error.something_wrong")}
              </div>
              <Button variant="outline" onClick={() => void users.refetch()}>
                <RotateCwIcon size={14} />
                {t("error.try_again")}
              </Button>
            </div>
          </CardContent>
        </Card>
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
      {isStale ? (
        <div
          role="status"
          className="flex items-center justify-between gap-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm"
        >
          <span className="min-w-0 truncate">{t("users.error_retry")}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void users.refetch()}
          >
            <RotateCwIcon size={14} />
            {t("users.error_retryed")}
          </Button>
        </div>
      ) : null}
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
              roles={roles}
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
              data={usersData ?? emptyUsers}
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
