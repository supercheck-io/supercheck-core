"use client";

import * as React from "react";
import {
  AudioWaveform,
  BellRing,
  Code,
  Command,
  CalendarClock,
  Frame,
  ChartColumn,
  Activity,
  Map,
  PieChart,
  ChartBar,
  NotepadText,
  Settings2,
  SquareTerminal,
  PlusIcon,
  Shield,
} from "lucide-react";

import { NavMain } from "@/components/nav-main";
// import { NavProjects } from "@/components/nav-projects";
import { NavUser } from "@/components/nav-user";
import { TeamSwitcher } from "@/components/team-switcher";
import Link from "next/link";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

// This is sample data.
const data = {
  user: {
    name: "test user",
    email: "m@example.com",
    avatar: "/avatars/shadcn.jpg",
  },
  teams: [
    {
      name: "Supertest",
      logo: Shield,
      plan: "Enterprise",
    },
    {
      name: "Acme Corp.",
      logo: AudioWaveform,
      plan: "Startup",
    },
    {
      name: "Evil Corp.",
      logo: Command,
      plan: "Free",
    },
  ],
  navMain: [
    {
      title: "Dashboard",
      url: "/",
      icon: ChartColumn,
      isActive: true,
    },
    {
      title: "Playground",
      url: "#",
      icon: SquareTerminal,

      items: [
        {
          title: "Browser test",
          url: "/playground?scriptType=browser",
        },
        {
          title: "API test",
          url: "/playground?scriptType=api",
        },
        {
          title: "Multistep test",
          url: "/playground?scriptType=multistep",
        },
        {
          title: "WebSocket test",
          url: "/playground?scriptType=websocket",
        },
        {
          title: "Database test",
          url: "/playground?scriptType=database",
        },
      ],
    },
    {
      title: "Tests",
      url: "/tests",
      icon: Code,
    },
    {
      title: "Jobs",
      url: "/jobs",
      icon: CalendarClock,
    },
    {
      title: "Runs",
      url: "/runs",
      icon: NotepadText,
    },
    {
      title: "Heartbeats",
      url: "/heartbests",
      icon: Activity,
    },
    {
      title: "Panels",
      url: "/dashboards",
      icon: ChartBar,
    },
    {
      title: "Alerts",
      url: "/alerts",
      icon: BellRing,
    },

    {
      title: "Settings",
      url: "#",
      icon: Settings2,
      items: [
        {
          title: "General",
          url: "#",
        },
        {
          title: "Team",
          url: "#",
        },
        {
          title: "Billing",
          url: "#",
        },
        {
          title: "Limits",
          url: "#",
        },
      ],
    },
  ],
  projects: [
    {
      name: "Design Engineering",
      url: "#",
      icon: Frame,
    },
    {
      name: "Sales & Marketing",
      url: "#",
      icon: PieChart,
    },
    {
      name: "Travel",
      url: "#",
      icon: Map,
    },
  ],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher teams={data.teams} />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className="-mb-2 ">
          <SidebarMenu>
            <SidebarMenuItem>
              <Link href="/create">
                <SidebarMenuButton
                  tooltip="Create"
                  className="flex items-center justify-center bg-primary text-primary-foreground data-[active]:bg-primary data-[active]:text-primary-foreground active:bg-primary active:text-primary-foreground focus:bg-primary focus:text-primary-foreground max-w-[94%] ml-[3%] mr-[3%] cursor-pointer "
                >
                  <PlusIcon className="h-4 w-4 ml-2" />
                  <span>Create</span>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
        <NavMain items={data.navMain} />
        {/* <NavProjects projects={data.projects} /> */}
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
