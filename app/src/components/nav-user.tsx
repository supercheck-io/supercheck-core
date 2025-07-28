"use client";

import { useSession, signOut } from "@/utils/auth-client";
import { useEffect, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

export function NavUser() {
  const { data: session, isPending } = useSession();
  const [isClient, setIsClient] = useState(false);
  const user = session?.user;
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    setIsClient(true);
  }, []);

  const handleLogout = async () => {
    await signOut();
    window.location.href = "/sign-in";
  };

  // Always show skeleton during SSR and initial client render to prevent hydration mismatch
  if (!isClient || isPending) {
    return <Skeleton className="h-8 w-8 rounded-lg" />;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className=" h-8 w-8 rounded-lg focus-visible:ring-ring flex items-center  focus-visible:outline-none">
          <Avatar className="h-8 w-8 rounded-lg">
            <AvatarImage src={user?.image || ""} alt={user?.name || ""} />
            <AvatarFallback className="rounded-lg">
              {user?.name?.charAt(0).toUpperCase()}
              {/* {user?.name?.charAt(1).toUpperCase()} */}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{user?.name}</p>
            <p className="text-xs leading-none text-muted-foreground">
              {user?.email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">Theme</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => setTheme("dark")}> 
          <span className="mr-2 flex items-center"><Moon className="h-4 w-4 mr-2" />Dark</span>
          <span className="ml-auto">{theme === "dark" && <span className="inline-block w-2 h-2 rounded-full bg-primary" />}</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("light")}> 
          <span className="mr-2 flex items-center"><Sun className="h-4 w-4 mr-2" />Light</span>
          <span className="ml-auto">{theme === "light" && <span className="inline-block w-2 h-2 rounded-full bg-primary" />}</span>
        </DropdownMenuItem>
       
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout}>Log out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
