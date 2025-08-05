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
  Plus,
  Building2,
  BarChart3
} from "lucide-react";

import { NavMain } from "@/components/nav-main";
import { ProjectSwitcher } from "@/components/project-switcher";
import { ImpersonationCard } from "@/components/impersonation-card";
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

  Admin: [
    {
      title: "Super Admin",
      url: "/super-admin",
      icon: BarChart3,
    },
  ],
  OrgAdmin: [
    {
      title: "Org Admin",
      url: "/org-admin",
      icon: Building2,
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
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [isOrgAdmin, setIsOrgAdmin] = React.useState(false);

  React.useEffect(() => {
    // Check if user is admin
    const checkAdminStatus = async () => {
      try {
        const response = await fetch('/api/admin/check');
        if (response.ok) {
          const data = await response.json();
          setIsAdmin(data.isAdmin || false);
        } else {
          setIsAdmin(false);
        }
      } catch {
        // Network errors or other issues - assume not admin
        setIsAdmin(false);
      }
    };

    // Check if user is organization admin
    const checkOrgAdminStatus = async () => {
      try {
        const response = await fetch('/api/organizations/stats');
        // Only set org admin if response is successful (200)
        // 403 means user is not org admin, which is expected
        setIsOrgAdmin(response.status === 200);
      } catch {
        // Network errors or other issues - assume not org admin
        setIsOrgAdmin(false);
      }
    };

    checkAdminStatus();
    checkOrgAdminStatus();
  }, []);

  // Create combined settings items based on admin status
  const getSettingsItems = () => {
    const baseSettings = [...data.Settings];
    
    if (isAdmin) {
      baseSettings.push(...data.Admin);
    } else if (isOrgAdmin) {
      baseSettings.push(...data.OrgAdmin);
    }
    
    return baseSettings;
  };

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="group-data-[collapsible=icon]:px-0">
        <ProjectSwitcher />
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
        <NavMain groupLabel="Settings" items={getSettingsItems()} />
      </SidebarContent>
      <NavMain groupLabel="" items={data.navSecondary} />
      <SidebarFooter>
        <ImpersonationCard />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
