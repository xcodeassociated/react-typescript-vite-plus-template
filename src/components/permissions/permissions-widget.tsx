import { useCallback, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PencilIcon,
  RotateCwIcon,
  ShieldCheckIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { Spinner } from "@/components/spinner"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import type { PermissionInput } from "@/graphql/generated/graphql"
import { PermissionForm, type PermissionFormValues } from "./permission-form"
import {
  PERMISSIONS_PAGE_SIZE,
  usePermissionMutations,
  usePermissionsListGraphql,
  usePermissionsSizeGraphql,
  type PermissionRow,
} from "./usePermissionsGraphql"

type PermissionMode =
  | { kind: "idle" }
  | { kind: "create" }
  | { kind: "update"; permission: PermissionRow }

export function PermissionsWidget() {
  const { t } = useTranslation("main")
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="outline" size="icon" />}>
        <ShieldCheckIcon />
        <span className="sr-only">{t("permissions.open")}</span>
      </SheetTrigger>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>{t("permissions.title")}</SheetTitle>
          <SheetDescription>{t("permissions.subtitle")}</SheetDescription>
        </SheetHeader>
        {/* Queries only mount while the sheet is open: closed costs nothing. */}
        {open ? <PermissionsPanel /> : null}
      </SheetContent>
    </Sheet>
  )
}

function PermissionsPanel() {
  const { t } = useTranslation("main")
  const [page, setPage] = useState(0)
  const [mode, setMode] = useState<PermissionMode>({ kind: "idle" })
  const {
    total,
    loading: sizeLoading,
    error: sizeError,
  } = usePermissionsSizeGraphql(true)
  const pageCount = Math.max(1, Math.ceil(total / PERMISSIONS_PAGE_SIZE))
  // A delete can shrink the list past the current page: clamp while rendering
  // so no effect-driven setState is needed.
  const currentPage = Math.min(page, pageCount - 1)
  const {
    permissions,
    loaded,
    loading: listLoading,
    error: listError,
    refetch,
  } = usePermissionsListGraphql(true, currentPage)
  const { createPermission, updatePermission, deletePermission } =
    usePermissionMutations()
  const loading = listLoading || sizeLoading
  const error = listError ?? sizeError

  const handleSubmit = useCallback(
    async (values: PermissionFormValues) => {
      const input: PermissionInput = {
        name: values.name,
        description: values.description === "" ? null : values.description,
      }
      try {
        if (mode.kind === "update") {
          await updatePermission({
            variables: {
              id: mode.permission.id,
              input: { ...input, version: mode.permission.version },
            },
          })
          toast.success(t("permissions.updated"))
        } else {
          await createPermission({ variables: { input } })
          toast.success(t("permissions.created"))
        }
        setMode({ kind: "idle" })
      } catch {
        toast.error(t("error.something_wrong"))
      }
    },
    [mode, createPermission, updatePermission, t]
  )

  const handleDelete = useCallback(
    (permission: PermissionRow) => {
      deletePermission({ variables: { id: permission.id } })
        .then(() => toast.success(t("permissions.deleted")))
        .catch(() => toast.error(t("error.something_wrong")))
    },
    [deletePermission, t]
  )

  const idle = useCallback(() => setMode({ kind: "idle" }), [])

  // Keep the list visible across refetches after mutations: only the very
  // first load (or a failed one with nothing cached) replaces it.
  if (loading && !loaded) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    )
  }

  if (error && !loaded) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <p className="text-sm">{t("error.something_wrong")}</p>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          <RotateCwIcon size={14} />
          {t("error.try_again")}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-4">
      {mode.kind === "create" ? (
        <div className="rounded-lg border p-4">
          <PermissionForm onSubmit={handleSubmit} onCancel={idle} />
        </div>
      ) : (
        <Button variant="outline" onClick={() => setMode({ kind: "create" })}>
          {t("permissions.add")}
        </Button>
      )}
      {/* Content-sized: grows only as far as its rows, scrolls when they exceed
          the panel instead of stretching an empty box. */}
      <div className="min-h-0 overflow-y-auto rounded-lg border">
        {permissions.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {t("permissions.empty")}
          </div>
        ) : (
          permissions.map((permission) =>
            mode.kind === "update" && mode.permission.id === permission.id ? (
              <div key={permission.id} className="border-b p-4 last:border-b-0">
                <PermissionForm
                  initialName={permission.name}
                  initialDescription={permission.description}
                  onSubmit={handleSubmit}
                  onCancel={idle}
                />
              </div>
            ) : (
              <div
                key={permission.id}
                className="flex items-center gap-2 border-b px-3 py-2 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {permission.name}
                  </div>
                  {permission.description !== "" ? (
                    <div className="truncate text-xs text-muted-foreground">
                      {permission.description}
                    </div>
                  ) : null}
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("permissions.update")}
                  onClick={() => setMode({ kind: "update", permission })}
                >
                  <PencilIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("permissions.delete")}
                  onClick={() => handleDelete(permission)}
                >
                  <Trash2Icon />
                </Button>
              </div>
            )
          )
        )}
      </div>
      <div className="mt-auto flex items-center justify-between gap-2">
        <span className="text-sm font-medium">
          {t("permissions.page_of", {
            page: currentPage + 1,
            pages: pageCount,
          })}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setPage(Math.max(0, currentPage - 1))}
            disabled={currentPage === 0}
          >
            <ChevronLeftIcon />
            <span className="sr-only">Go to previous page</span>
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setPage(currentPage + 1)}
            disabled={currentPage >= pageCount - 1}
          >
            <ChevronRightIcon />
            <span className="sr-only">Go to next page</span>
          </Button>
        </div>
      </div>
    </div>
  )
}
