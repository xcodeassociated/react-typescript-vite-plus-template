import { useTranslation } from "react-i18next"
import { createColumnHelper } from "@tanstack/react-table"
import { ArrowUpDown, MoreHorizontalIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { features, type DataTableColumns } from "@/components/custom/data-table"
import type { User } from "@/pages/users/api/usersApi.types"

const helper = createColumnHelper<typeof features, User>()

export interface UserColumnsOptions {
  onEdit: (user: User) => void
  onDelete: (user: User) => void
}

export function useUserColumns({
  onEdit,
  onDelete,
}: UserColumnsOptions): DataTableColumns<User> {
  const { t } = useTranslation("main")

  return helper.columns([
    helper.accessor("_id", {
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          {t("users.id")}
          <ArrowUpDown />
        </Button>
      ),
    }),
    helper.accessor("name", { header: t("users.name") }),
    helper.accessor("email", { header: t("users.email") }),
    helper.accessor("role", {
      header: t("users.role"),
      cell: ({ row }) => (
        <div>{row.original.role.map((role) => role.name).join(", ")}</div>
      ),
    }),
    helper.display({
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const user = row.original
        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="ghost" size="icon-sm" />}
              >
                <span className="sr-only">Open menu</span>
                <MoreHorizontalIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>{t("users.actions")}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onEdit(user)}>
                    {t("users.update")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => onDelete(user)}
                  >
                    {t("users.delete")}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      },
    }),
  ])
}
