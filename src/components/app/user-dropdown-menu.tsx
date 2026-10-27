import { useTranslation } from "react-i18next"
import {
  Languages,
  LogIn,
  LogOut,
  Settings,
  User,
  UserCircle,
  UserPlus,
} from "lucide-react"
import { toast } from "sonner"

import { useKeycloak } from "@/components/keycloak-provider"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { setLanguage } from "@/locales/i18n"

function LanguageSubmenu() {
  const { t } = useTranslation("main")

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Languages />
        <span>{t("user_dropdown.select_language")}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent>
          <DropdownMenuItem onClick={() => setLanguage("en")}>
            {t("user_dropdown.en")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setLanguage("pl")}>
            {t("user_dropdown.pl")}
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  )
}

export function UserDropdownMenu() {
  const { authenticated, login, logout } = useKeycloak()
  const { t } = useTranslation("main")

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="secondary" size="icon" />}>
        <UserCircle />
        <span className="sr-only">{t("user_dropdown.my_account")}</span>
      </DropdownMenuTrigger>
      {authenticated ? (
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              {t("user_dropdown.my_account")}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => toast.info(t("user_dropdown.profile"))}
            >
              <User />
              <span>{t("user_dropdown.profile")}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => toast.info(t("user_dropdown.settings"))}
            >
              <Settings />
              <span>{t("user_dropdown.settings")}</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <LanguageSubmenu />
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout}>
              <LogOut />
              <span>{t("user_dropdown.logout")}</span>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      ) : (
        <DropdownMenuContent align="end">
          <LanguageSubmenu />
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => toast.info(t("user_dropdown.register"))}
          >
            <UserPlus />
            <span>{t("user_dropdown.register")}</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={login}>
            <LogIn />
            <span>{t("user_dropdown.login")}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      )}
    </DropdownMenu>
  )
}
