"use client";

import * as React from "react";
import {
  AudioWaveform,
  // BellRing,
  Code,
  Command,
  CalendarClock,
  Frame,
  ChartColumn,
  Activity,
  Map,
  PieChart,
  // ChartBar,
  NotepadText,
  Settings2,
  SquareTerminal,
  // PlusIcon,
  Shield,
  PlusCircleIcon,
  Globe,
  Globe2,
  ChartBar,
  BellRing,
  // MailIcon,
} from "lucide-react";

import { CheckIcon } from "@/components/logo/supercheck-logo";
import { NavMain } from "@/components/nav-main";
// import { NavProjects } from "@/components/nav-projects";
import { NavUser } from "@/components/nav-user";
// import { TeamSwitcher } from "@/components/team-switcher";
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
    avatar: "https://ui-avatars.com/api/?name=Test+User&background=random",
  },
  /* teams: [
    {
      name: "Supercheck", 
      logo: CheckIcon,
      plan: "Automation & Monitoring",
    },
    {
      name: "Test Team 1",
      logo: AudioWaveform,
      plan: "Startup",
    },
    {
      name: "Test Team 2",
      logo: Command,
      plan: "Enterprise",
    },
  ], */

  Communicate: [
    {
      title: "Dashboard",
      url: "/",
      icon: ChartColumn,
      isActive: true,
    },
    
      {
        title: "Status",
        url: "/status",
        icon: ChartBar,
      },
      {
        title: "Alerts",
        url: "/alerts",
        icon: BellRing,
      },

  ],

  Detect: [

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
  
    // {
    //   title: "Panels",
    //   url: "/panels",
    //   icon: ChartBar,
    // },
    // {
    //   title: "Alerts",
    //   url: "/alerts",
    //   icon: BellRing,
    // },

  ],

  Monitor: [
    
    {
      title: "Monitors",
      url: "/monitors",
      icon: Globe,
    },
    {
      title: "Heartbeats",
      url: "/heartbeats",
      icon: Activity,
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
        // {
        //   title: "Billing",
        //   url: "#",
        // },
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
  // const activeTeam = data.teams[0]; // Assuming we want to display the first team
  const LogoToDisplay = CheckIcon;
  const teamName = "Supercheck";
  const teamPlan = "version 1.01";

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="group-data-[collapsible=icon]:px-0">
        {/* <TeamSwitcher teams={data.teams} /> */}
        <div className="flex items-center gap-2 px-2 py-1.5 group-data-[collapsible=icon]:justify-center">
          <LogoToDisplay className="h-8 w-8 flex-shrink-0" /> 
          <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate font-medium">{teamName}</span>
            <span className="truncate text-xs">{teamPlan}</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className="-mb-2 ">
          <SidebarMenu>
            <SidebarMenuItem>
              <Link href="/create" className="flex w-full">
                <SidebarMenuButton
                  tooltip="Quick Create"
                  className="flex items-center justify-center min-w-7 bg-primary text-primary-foreground duration-200 ease-linear hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground cursor-pointer w-[90%] ml-[5%] mr-[5%]"
                >
                  <PlusCircleIcon className="h-4 w-4 ml-2" />
                  <span> Quick Create</span>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
        <NavMain groupLabel="Communicate" items={data.Communicate} />
        <NavMain groupLabel="Detect" items={data.Detect} />
        <NavMain groupLabel="Monitor" items={data.Monitor} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
