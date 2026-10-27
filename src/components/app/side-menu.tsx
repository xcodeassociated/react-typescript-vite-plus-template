import { useLocation, useNavigate } from "react-router-dom"
import { Menu } from "lucide-react"

import type { MenuItem } from "@/components/app/menu-item"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

interface SideMenuItemProps {
  item: MenuItem
}

function SideMenuItem({ item }: SideMenuItemProps) {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <SheetClose
      render={
        <Button
          variant={location.pathname === item.route ? "secondary" : "ghost"}
          className="justify-start"
          onClick={() => navigate(item.route)}
        />
      }
    >
      {item.key}
    </SheetClose>
  )
}

export interface SideMenuProps {
  items: MenuItem[]
  authenticated: boolean
}

export function SideMenu({ items, authenticated }: SideMenuProps) {
  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button
            variant="outline"
            size="icon"
            className="shrink-0 md:hidden"
          />
        }
      >
        <Menu />
        <span className="sr-only">Toggle navigation menu</span>
      </SheetTrigger>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle>Shadcn</SheetTitle>
          <SheetDescription>Navigation menu</SheetDescription>
        </SheetHeader>
        <nav className="grid gap-1">
          {items
            .filter((item) => (item.restricted ? authenticated : true))
            .map((item) => (
              <SideMenuItem key={item.key} item={item} />
            ))}
        </nav>
      </SheetContent>
    </Sheet>
  )
}
