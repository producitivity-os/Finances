import * as React from "react"
import {
  AudioWaveform,
  Command,
  GalleryVerticalEnd,
  HandCoins,
  Handshake,
  PiggyBank,
  Tag,
  User,
  Store,
  Repeat,
  type LucideIcon,
} from "lucide-react"

import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import { TeamSwitcher } from "@/components/team-switcher"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar"

type MainNavItem = {
  title: string
  url: string
  icon: LucideIcon
  badge?: string
}

const data: {
  teams: {
    name: string
    logo: LucideIcon
    plan: string
  }[]
  navMain: MainNavItem[]
} = {
  teams: [
    {
      name: "Finances",
      logo: GalleryVerticalEnd,
      plan: "Personal",
    },
    {
      name: "Household",
      logo: AudioWaveform,
      plan: "Shared",
    },
    {
      name: "Sandbox",
      logo: Command,
      plan: "Free",
    },
  ],
  navMain: [
    {
      title: "Transactions",
      url: "#/transactions",
      icon: HandCoins,
    },
    {
      title: "Accounts",
      url: "#/accounts",
      icon: User,
    },
    {
      title: "Payees",
      url: "#/payees",
      icon: Store,
    },
    {
      title: "Categories",
      url: "#/categories",
      icon: Tag,
    },
    {
      title: "Budgets",
      url: "#/budgets",
      icon: PiggyBank,
    },
    {
      title: "Loans",
      url: "#/loans",
      icon: Handshake,
    },
    {
      title: "Recurring",
      url: "#/recurring",
      icon: Repeat,
    },
  ],
}

export function AppSidebar({
  user,
  onLogout,
  notificationCount,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: {
    name: string
    email: string
    avatar: string
  }
  onLogout: () => void
  notificationCount: number
}) {
  const [currentRoute, setCurrentRoute] = React.useState(() =>
    window.location.hash || "#/transactions"
  )

  React.useEffect(() => {
    const syncRoute = () => {
      if (!window.location.hash) {
        window.location.hash = "/transactions"
        return
      }
      setCurrentRoute(window.location.hash)
    }

    syncRoute()
    window.addEventListener("hashchange", syncRoute)
    return () => window.removeEventListener("hashchange", syncRoute)
  }, [])

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="pt-10">
        <TeamSwitcher teams={data.teams} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain
          items={data.navMain.map((item) => ({
            ...item,
            badge:
              item.url === "#/notifications" && notificationCount > 0
                ? String(notificationCount)
                : item.badge,
            isActive: item.url === currentRoute,
          }))}
        />
      </SidebarContent>
      <SidebarFooter>
        <NavUser
          user={user}
          onLogout={onLogout}
          notificationCount={notificationCount}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
