import * as React from "react"
import {
  AudioWaveform,
  Command,
  GalleryVerticalEnd,
  Settings2,
  ArrowLeftRight,
  User,
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

const data = {
  user: {
    name: "Mustafa",
    email: "m@example.com",
    avatar: "/avatars/shadcn.jpg",
  },
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
      icon: ArrowLeftRight,
    },
    {
      title: "Accounts",
      url: "#/accounts",
      icon: User,
    },
    {
      title: "Settings",
      url: "#/settings",
      icon: Settings2,
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
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
            isActive: item.url === currentRoute,
          }))}
        />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
