import { useLocation } from "react-router-dom"
import { Link } from "react-router-dom"

import type { MenuItem } from "@/components/menu-item"
import {
  NavigationMenuItem,
  NavigationMenuLink,
} from "@/components/ui/navigation-menu"

export interface NavMenuItemProps {
  item: MenuItem
}

export function NavMenuItem({ item }: NavMenuItemProps) {
  const location = useLocation()

  return (
    <NavigationMenuItem>
      <NavigationMenuLink
        active={location.pathname === item.route}
        render={<Link to={item.route} />}
      >
        {item.key}
      </NavigationMenuLink>
    </NavigationMenuItem>
  )
}
