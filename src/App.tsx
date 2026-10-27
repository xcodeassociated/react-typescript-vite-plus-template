import { useMemo, type FormEvent, type ReactNode } from "react"
import { Link, Navigate, Route, Routes } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { MessageSquareIcon, SearchIcon } from "lucide-react"
import { toast } from "sonner"

import type { MenuItem } from "@/components/app/menu-item"
import { NavMenuItem } from "@/components/app/nav-item"
import { SideMenu } from "@/components/app/side-menu"
import { UserDropdownMenu } from "@/components/app/user-dropdown-menu"
import { LoadingScreenMemo } from "@/components/app/loading-screen"
import { CookieConsent } from "@/components/custom/cookie-consent"
import { ModeToggle } from "@/components/custom/mode-toggle"
import { useKeycloak } from "@/components/keycloak-provider"
import { useTheme } from "@/components/theme-provider"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  NavigationMenu,
  NavigationMenuList,
} from "@/components/ui/navigation-menu"
import { Toaster } from "@/components/ui/sonner"
import { Counter } from "@/pages/counter/Counter"
import { NotFound, Unauthorized } from "@/pages/error/errors"
import { Home } from "@/pages/home/home"
import { Users } from "@/pages/users/Users"

interface ProtectedRouteProps {
  authenticated: boolean
  redirectPath?: string
  children: ReactNode
}

function ProtectedRoute({
  authenticated,
  redirectPath = "/unauthorized",
  children,
}: ProtectedRouteProps) {
  if (!authenticated) {
    return <Navigate to={redirectPath} replace />
  }
  return children
}

function App() {
  const { initialized, authenticated } = useKeycloak()
  const { theme } = useTheme()
  const { t } = useTranslation("main")

  const menuItems = useMemo<MenuItem[]>(
    () => [
      { key: t("menu.home"), route: "/", restricted: false },
      { key: t("menu.counter"), route: "/counter", restricted: true },
      { key: t("menu.users"), route: "/users", restricted: true },
    ],
    [t]
  )

  const handleSearch = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const query = new FormData(e.currentTarget).get("search")
    toast.info(`${t("menu.search")} ${typeof query === "string" ? query : ""}`)
    e.currentTarget.reset()
  }

  if (!initialized) {
    return <LoadingScreenMemo />
  }

  return (
    <>
      <div className="flex min-h-svh w-full flex-col">
        <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background px-4 md:px-6">
          <nav className="hidden flex-1 items-center gap-5 text-sm font-medium md:flex">
            <Link to="/" className="text-lg font-semibold whitespace-nowrap">
              {t("app.name")}
            </Link>
            <NavigationMenu>
              <NavigationMenuList>
                {menuItems
                  .filter((item) => (item.restricted ? authenticated : true))
                  .map((item) => (
                    <NavMenuItem key={item.key} item={item} />
                  ))}
              </NavigationMenuList>
            </NavigationMenu>
          </nav>
          <SideMenu items={menuItems} authenticated={authenticated} />
          <form
            className="ml-auto flex-1 sm:flex-initial"
            onSubmit={handleSearch}
          >
            <InputGroup>
              <InputGroupAddon align="inline-start">
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                type="search"
                name="search"
                placeholder={t("menu.search")}
              />
            </InputGroup>
          </form>
          <ModeToggle />
          <UserDropdownMenu />
        </header>
        <main className="flex flex-1 flex-col gap-6 bg-muted/40 p-4 md:gap-10 md:p-10">
          <div className="mx-auto grid w-full max-w-6xl content-start justify-items-center gap-6">
            <div className="text-center">
              <div className="text-4xl font-bold">{t("home.section1")}</div>
              <div className="text-lg text-muted-foreground">
                {t("home.section2")}
              </div>
            </div>
            <div className="w-full justify-items-center">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/unauthorized" element={<Unauthorized />} />
                <Route
                  path="/counter"
                  element={
                    <ProtectedRoute authenticated={authenticated}>
                      <Counter />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/users"
                  element={
                    <ProtectedRoute authenticated={authenticated}>
                      <Users />
                    </ProtectedRoute>
                  }
                />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </div>
          </div>
          <CookieConsent
            onAcceptCallback={() => toast.success(t("cookie_consent.accept"))}
            onDeclineCallback={() => toast.info(t("cookie_consent.decline"))}
          />
        </main>
        <footer className="flex h-16 items-center justify-center gap-3 border-t bg-background px-4 md:px-6">
          <MessageSquareIcon />
          <span className="text-muted-foreground">{t("footer.text")}</span>
        </footer>
      </div>
      <Toaster theme={theme} />
    </>
  )
}

export default App
