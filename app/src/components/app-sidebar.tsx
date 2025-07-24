"use client";

import * as React from "react";
import {
  CalendarClock,
  ChartColumn,
  NotepadText,
  Globe,
  BellRing,
  SquarePlus,
  Settings,
  DatabaseIcon,
  ClipboardListIcon,
  FileIcon,
  Code2,
  BookOpenText,
  History,
  Plus
} from "lucide-react";

import { NavMain } from "@/components/nav-main";
import { ProjectSwitcher } from "@/components/project-switcher";
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
  projects: [
    {
      name: "ABC",
    },
    {
      name: "DEF",
    },
    {
      name: "GHI",
    },
    {
      name: "JKL",
    },
    {
      name: "MNO",
    },
    {
      name: "PQR",
    },
    {
      name: "STU",
    },
    
  ], 

  Communicate: [
    {
      title: "Dashboard",
      url: "/",
      icon: ChartColumn,
      isActive: true,
    },
    
      {
        title: "Alerts",
        url: "/alerts",
        icon: BellRing,
      },

  ],

  Automate: [

    {
      title: "Create",
      url: "#",
      icon: SquarePlus,

      items: [
        {
          title: "Browser Test",
          url: "/playground?scriptType=browser",
        },
        {
          title: "API Test",
          url: "/playground?scriptType=api",
        }, 
        {
          title: "Database Test",
          url: "/playground?scriptType=database",
        },
        {
          title: "Custom Test",
          url: "/playground?scriptType=custom",
        },
      ],
    },
    {
      title: "Tests",
      url: "/tests",
      icon: Code2,
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
  

  ],

  Monitor: [
    
    {
      title: "Create",
      url: "#",
      icon: SquarePlus,
      items: [
        {
          title: "HTTP Monitor",
          url: "/monitors/create?type=http_request",
        },
        {
          title: "Website Monitor",
          url: "/monitors/create?type=website",
        },
        {
          title: "Ping Monitor",
          url: "/monitors/create?type=ping_host",
        },
        {
          title: "Port Monitor",
          url: "/monitors/create?type=port_check",
        },
        {
          title: "Heartbeat Monitor",
          url: "/monitors/create?type=heartbeat",
        },
      ],
      
    },
    {
      title: "Monitors",
      url: "/monitors",
      icon: Globe,
    },
  
  ],

  Settings: [
    {
      title: "Settings",
      url: "/settings",
      icon: Settings,
    },
  ],


  navSecondary: [
    // {
    //   title: "Settings",
    //   url: "/settings",
    //   icon: Settings,
    // },
    {
      title: "Docs",
      url: "#",
      icon: BookOpenText,
    },
    {
      title: "Changelog",
      url: "#",
      icon: History,
    },
  ],
  documents: [
    {
      name: "Data Library",
      url: "#",
      icon: DatabaseIcon,
    },
    {
      name: "Reports",
      url: "#",
      icon: ClipboardListIcon,
    },
    {
      name: "Word Assistant",
      url: "#",
      icon: FileIcon,
    },
  ],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  // const activeTeam = data.teams[0]; // Assuming we want to display the first team

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="group-data-[collapsible=icon]:px-0">
        <ProjectSwitcher projects={data.projects} />
        {/* <div className="flex items-center gap-2 px-2 py-1.5 group-data-[collapsible=icon]:justify-center">
          <LogoToDisplay className="h-7 w-7 flex-shrink-0" /> 
          <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate font-medium">{teamName}</span>
            <span className="truncate text-xs">{teamPlan}</span>
          </div>
        </div> */}
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className="-mb-2 ">
          <SidebarMenu>
            <SidebarMenuItem>
              <Link href="/create" className="flex w-full">
                <SidebarMenuButton
                  tooltip="Quick Create"
                  className="flex items-center justify-center min-w-7 bg-primary text-primary-foreground duration-200 ease-linear hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground  w-[90%] ml-[5%] mr-[5%] group-data-[collapsible=icon]:mt-3 group-data-[collapsible=icon]:mb-2"
                >
                  <Plus className="h-4 w-4 ml-2" />
                  <span> Quick Create</span>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
        <NavMain groupLabel="Communicate" items={data.Communicate} />
        <NavMain groupLabel="Automate" items={data.Automate} />
        <NavMain groupLabel="Monitor" items={data.Monitor} />
        <NavMain groupLabel="Settings" items={data.Settings} />

      </SidebarContent>
      <NavMain groupLabel="" items={data.navSecondary} />
      <SidebarFooter>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
