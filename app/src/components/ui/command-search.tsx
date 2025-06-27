"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  Calendar,
  Settings,
  Monitor,
  Play,
  Activity,
  Globe,
  Clock,
  Code,
  Terminal,
  SearchIcon,
  Home,
  BellRing,
  TestTube,
  Network,
  LaptopMinimal,
  RefreshCw,
} from "lucide-react"

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface CommandSearchProps {
  className?: string
}

export function CommandSearch({ className }: CommandSearchProps) {
  const [open, setOpen] = React.useState(false)
  const router = useRouter()

  const handleCommand = (command: string) => {
    setOpen(false)
    
    const routes: Record<string, string> = {
      // Navigation
      "home": "/",
      "dashboard": "/",
      "monitors": "/monitors",
      "tests": "/tests",
      "jobs": "/jobs",
      "runs": "/runs",
      "alerts": "/alerts",
      "settings": "/settings",
      
      // Create Actions
      "create-monitor-http": "/monitors/create?type=http_request",
      "create-monitor-website": "/monitors/create?type=website",
      "create-monitor-ping": "/monitors/create?type=ping_host",
      "create-monitor-port": "/monitors/create?type=port_check",
      "create-monitor-heartbeat": "/monitors/create?type=heartbeat",
      "create-test-browser": "/playground?scriptType=browser",
      "create-test-api": "/playground?scriptType=api",
      "create-test-multistep": "/playground?scriptType=multistep",
      "create-test-database": "/playground?scriptType=database",
      "create-job": "/jobs/create",
      
      // Quick Actions
      "view-critical-alerts": "/monitors?filter=down",
      "view-running-jobs": "/jobs?status=running",
      "view-recent-runs": "/runs?sort=recent",
      "view-failed-tests": "/tests?status=failed",
      
      // System
      "queue-stats": "/api/queue-stats",
      "system-health": "/api/dashboard",
    }
    
    const route = routes[command]
    if (route) {
      if (route.startsWith('/api/')) {
        window.open(route, '_blank')
      } else {
        router.push(route)
      }
    }
  }

  // Enhanced keyboard shortcuts
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0
      const metaKey = isMac ? e.metaKey : e.ctrlKey
      
      // Command palette toggle
      if (e.key === "k" && metaKey) {
        e.preventDefault()
        setOpen((open) => !open)
        return
      }
      
      // Individual shortcuts - only when command palette is closed
      if (!open && metaKey && !e.shiftKey) {
        switch (e.key.toLowerCase()) {
          case "d":
            e.preventDefault()
            handleCommand("home")
            break
          case "m":
            e.preventDefault()
            handleCommand("monitors")
            break
          case "t":
            e.preventDefault()
            handleCommand("tests")
            break
          case "j":
            e.preventDefault()
            handleCommand("jobs")
            break
          case "r":
            e.preventDefault()
            handleCommand("runs")
            break
          case "a":
            e.preventDefault()
            handleCommand("alerts")
            break
          case "s":
            e.preventDefault()
            handleCommand("settings")
            break
        }
      }
      
      // Shift + Cmd shortcuts for creation - only when command palette is closed
      if (!open && metaKey && e.shiftKey) {
        switch (e.key.toLowerCase()) {
          case "h":
            e.preventDefault()
            handleCommand("create-monitor-http")
            break
          case "w":
            e.preventDefault()
            handleCommand("create-monitor-website")
            break
          case "p":
            e.preventDefault()
            handleCommand("create-monitor-ping")
            break
          case "o":
            e.preventDefault()
            handleCommand("create-monitor-port")
            break
          case "b":
            e.preventDefault()
            handleCommand("create-monitor-heartbeat")
            break
          case "t":
            e.preventDefault()
            handleCommand("create-test-browser")
            break
          case "a":
            e.preventDefault()
            handleCommand("create-test-api")
            break
          case "j":
            e.preventDefault()
            handleCommand("create-job")
            break
        }
      }
    }

    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [open])

  return (
    <div className={className}>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="h-8 px-2 min-w-[96px] justify-between mr-2 hover:bg-accent/50 transition-colors"
      >
        <div className="flex items-center space-x-1">
          <SearchIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground">CMD</span>
        </div>
        <kbd className="inline-flex h-4 items-center rounded border bg-muted px-1 text-[9px] font-mono text-muted-foreground">
          ⌘K
        </kbd>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-0 max-w-[500px] top-[35%] translate-y-[-35%] [&>button]:hidden">
          <Command className="rounded-lg border-0 shadow-md">
            <CommandInput placeholder="Type a command or search..." />
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>
              
              <CommandGroup heading="Navigation">
                <CommandItem onSelect={() => handleCommand("home")}>
                  <Home className="mr-2 h-4 w-4 text-slate-500" />
                  <span>Dashboard</span>
                  <CommandShortcut>⌘D</CommandShortcut>
                </CommandItem>
                <CommandItem onSelect={() => handleCommand("monitors")}>
                  <Monitor className="mr-2 h-4 w-4 text-blue-500" />
                  <span>Monitors</span>
                  <CommandShortcut>⌘M</CommandShortcut>
                </CommandItem>
                <CommandItem onSelect={() => handleCommand("tests")}>
                  <TestTube className="mr-2 h-4 w-4 text-green-500" />
                  <span>Tests</span>
                  <CommandShortcut>⌘T</CommandShortcut>
                </CommandItem>
                <CommandItem onSelect={() => handleCommand("jobs")}>
                  <Clock className="mr-2 h-4 w-4 text-orange-500" />
                  <span>Jobs</span>
                  <CommandShortcut>⌘J</CommandShortcut>
                </CommandItem>
                <CommandItem onSelect={() => handleCommand("runs")}>
                  <Play className="mr-2 h-4 w-4 text-purple-500" />
                  <span>Runs</span>
                  <CommandShortcut>⌘R</CommandShortcut>
                </CommandItem>
                <CommandItem onSelect={() => handleCommand("alerts")}>
                  <BellRing className="mr-2 h-4 w-4 text-red-500" />
                  <span>Alerts</span>
                  <CommandShortcut>⌘A</CommandShortcut>
                </CommandItem>
              </CommandGroup>

              <CommandSeparator />

              <CommandGroup heading="Create Monitors">
                <CommandItem onSelect={() => handleCommand("create-monitor-http")}>
                  <Globe className="mr-2 h-4 w-4 text-cyan-500" />
                  <span>HTTP Monitor</span>
                  <CommandShortcut>⌘⇧H</CommandShortcut>
                </CommandItem>
                <CommandItem onSelect={() => handleCommand("create-monitor-website")}>
                  <LaptopMinimal className="mr-2 h-4 w-4 text-blue-500" />
                  <span>Website Monitor</span>
                  <CommandShortcut>⌘⇧W</CommandShortcut>
                </CommandItem>
                <CommandItem onSelect={() => handleCommand("create-monitor-ping")}>
                  <RefreshCw className="mr-2 h-4 w-4 text-sky-500" />
                  <span>Ping Monitor</span>
                  <CommandShortcut>⌘⇧P</CommandShortcut>
                </CommandItem>
                <CommandItem onSelect={() => handleCommand("create-monitor-port")}>
                  <Network className="mr-2 h-4 w-4 text-indigo-500" />
                  <span>Port Monitor</span>
                  <CommandShortcut>⌘⇧O</CommandShortcut>
                </CommandItem>
                <CommandItem onSelect={() => handleCommand("create-monitor-heartbeat")}>
                  <Activity className="mr-2 h-4 w-4 text-blue-300" />
                  <span>Heartbeat Monitor</span>
                  <CommandShortcut>⌘⇧B</CommandShortcut>
                </CommandItem>
              </CommandGroup>

              <CommandSeparator />

              <CommandGroup heading="Create Tests & Jobs">
                <CommandItem onSelect={() => handleCommand("create-test-browser")}>
                  <Code className="mr-2 h-4 w-4 text-emerald-500" />
                  <span>Browser Test</span>
                  <CommandShortcut>⌘⇧T</CommandShortcut>
                </CommandItem>
                <CommandItem onSelect={() => handleCommand("create-test-api")}>
                  <Terminal className="mr-2 h-4 w-4 text-teal-500" />
                  <span>API Test</span>
                  <CommandShortcut>⌘⇧A</CommandShortcut>
                </CommandItem>
                <CommandItem onSelect={() => handleCommand("create-job")}>
                  <Calendar className="mr-2 h-4 w-4 text-amber-500" />
                  <span>Scheduled Job</span>
                  <CommandShortcut>⌘⇧J</CommandShortcut>
                </CommandItem>
              </CommandGroup>

              <CommandSeparator />

              <CommandGroup heading="Settings">
                <CommandItem onSelect={() => handleCommand("settings")}>
                  <Settings className="mr-2 h-4 w-4 text-gray-500" />
                  <span>Settings</span>
                  <CommandShortcut>⌘S</CommandShortcut>
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </div>
  )
} 