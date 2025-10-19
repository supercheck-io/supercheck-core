"use client";

import * as React from "react";
import {
  CalendarClock,
  ChartColumn,
  NotepadText,
  Globe,
  BellRing,
  SquarePlus,
  DatabaseIcon,
  ClipboardListIcon,
  FileIcon,
  Code,
  BookOpenText,
  // History,
  Plus,
  Chrome,
  ArrowLeftRight,
  Database,
  SquareFunction,
  LaptopMinimal,
  ChevronsLeftRightEllipsis,
  EthernetPort,
  Variable,
  UserCog,
  Tally4,
  type LucideIcon,
} from "lucide-react";
import { PlaywrightLogo } from "@/components/logo/playwright-logo";

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
    email: "test@example.com",
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

    {
      title: "Status Pages",
      url: "/status-pages",
      icon: Tally4,
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
          icon: Chrome,
          color: "!text-sky-600",
        },
        {
          title: "API Test",
          url: "/playground?scriptType=api",
          icon: ArrowLeftRight,
          color: "!text-teal-600",
        },
        {
          title: "Database Test",
          url: "/playground?scriptType=database",
          icon: Database,
          color: "!text-cyan-600",
        },
        {
          title: "Custom Test",
          url: "/playground?scriptType=custom",
          icon: SquareFunction,
          color: "!text-blue-600",
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
      title: "Variables",
      url: "/variables",
      icon: Variable,
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
          icon: ArrowLeftRight,
          color: "!text-teal-600",
        },
        {
          title: "Website Monitor",
          url: "/monitors/create?type=website",
          icon: LaptopMinimal,
          color: "!text-sky-600",
        },
        {
          title: "Ping Monitor",
          url: "/monitors/create?type=ping_host",
          icon: ChevronsLeftRightEllipsis,
          color: "!text-cyan-600",
        },
        {
          title: "Port Monitor",
          url: "/monitors/create?type=port_check",
          icon: EthernetPort,
          color: "!text-blue-600",
        },
        {
          title: "Synthetic Monitor",
          url: "/monitors/create?type=synthetic_test",
          icon: PlaywrightLogo,
          color: "!text-purple-600",
        },
      ],
    },
    {
      title: "Monitors",
      url: "/monitors",
      icon: Globe,
    },
  ],

  SuperAdmin: [
    {
      title: "Super Admin",
      url: "/super-admin",
      icon: UserCog,
    },
  ],
  OrgAdmin: [
    {
      title: "Organization Admin",
      url: "/org-admin",
      icon: UserCog,
    },
  ],

  navSecondary: [
    {
      title: "Docs",
      url: "https://github.com/supercheck-io/supercheck",
      icon: BookOpenText,
      badge: "v1.1.5-beta.15",
    },
    // {
    //   title: "Changelog",
    //   url: "#",
    //   icon: History,
    // },
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
  const [isAdminStatusLoaded, setIsAdminStatusLoaded] = React.useState(false);

  React.useEffect(() => {
    // Check if user is admin
    const checkAdminStatus = async () => {
      try {
        const response = await fetch("/api/admin/check");
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
        const response = await fetch("/api/organizations/stats");
        // Only set org admin if response is successful (200)
        // 403 means user is not org admin, which is expected
        setIsOrgAdmin(response.status === 200);
      } catch {
        // Network errors or other issues - assume not org admin
        setIsOrgAdmin(false);
      }
    };

    Promise.all([checkAdminStatus(), checkOrgAdminStatus()]).finally(() => {
      setIsAdminStatusLoaded(true);
    });
  }, []);

  // Create combined admin items based on admin status
  const adminItems = React.useMemo(() => {
    // Don't show admin items until status is loaded to prevent hydration issues
    if (!isAdminStatusLoaded) {
      return [];
    }

    type IconComponent =
      | LucideIcon
      | React.ComponentType<{ className?: string }>;

    type AdminItem = {
      title: string;
      url: string;
      icon: IconComponent;
      isActive?: boolean;
      items?: Array<{
        title: string;
        url: string;
        icon?: IconComponent;
        color?: string;
      }>;
    };

    const baseSettings: AdminItem[] = [];

    if (isAdmin) {
      baseSettings.push(...(data.SuperAdmin as AdminItem[]));
    } else if (isOrgAdmin) {
      baseSettings.push(...(data.OrgAdmin as AdminItem[]));
    }

    return baseSettings;
  }, [isAdmin, isOrgAdmin, isAdminStatusLoaded]);

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
        {adminItems.length > 0 && (
          <NavMain groupLabel="Admin" items={adminItems} />
        )}
      </SidebarContent>
      <NavMain groupLabel="" items={data.navSecondary} />
      <SidebarFooter>
        <ImpersonationCard />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
