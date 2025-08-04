"use client"

import * as React from "react"
import { ChevronsUpDown, Plus, Search } from "lucide-react"
import { CheckIcon } from "@/components/logo/supercheck-logo"
import { useProjectContext } from "@/hooks/use-project-context"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { useRef, useEffect } from "react"
import { toast } from "sonner"

export function ProjectSwitcher() {
  const { isMobile } = useSidebar()
  const { 
    currentProject, 
    projects, 
    loading, 
    switchProject 
  } = useProjectContext()
  
  const [searchQuery, setSearchQuery] = React.useState("")
  const [isOpen, setIsOpen] = React.useState(false)
  const [showNewProjectDialog, setShowNewProjectDialog] = React.useState(false)
  const [newProjectName, setNewProjectName] = React.useState("")
  const [newProjectDescription, setNewProjectDescription] = React.useState("")
  const [creating, setCreating] = React.useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Filter projects based on search query
  const filteredProjects = (projects || []).filter(project =>
    project.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Reset search when dropdown closes
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery("")
    }
  }, [isOpen])

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open)
    if (open) {
      // Focus the search input after the dropdown is rendered
      setTimeout(() => {
        searchInputRef.current?.focus()
      }, 50)
    }
  }

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setSearchQuery(e.target.value)
  }

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setIsOpen(false)
    } else if (e.key === "Enter") {
      e.preventDefault()
      // Select the first filtered project if available
      if (filteredProjects.length > 0) {
        handleProjectSelect(filteredProjects[0])
      }
    }
    // Prevent dropdown from closing on other key presses
    e.stopPropagation()
  }

  const handleProjectSelect = async (project: { id: string; name: string }) => {
    const success = await switchProject(project.id)
    if (success) {
      setIsOpen(false)
    }
  }

  const createProject = async () => {
    if (!newProjectName.trim()) {
      toast.error("Project name is required")
      return
    }

    setCreating(true)
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newProjectName.trim(),
          description: newProjectDescription.trim() || undefined,
        }),
      })

      const data = await response.json()

      if (data.success) {
        const newProject = data.data
        setNewProjectName("")
        setNewProjectDescription("")
        setShowNewProjectDialog(false)
        toast.success(`Created project "${newProject.name}"`)
        
        // Switch to the new project using the context
        await switchProject(newProject.id)
      } else {
        toast.error(data.error || "Failed to create project")
      }
    } catch (error) {
      console.error("Error creating project:", error)
      toast.error("Failed to create project")
    } finally {
      setCreating(false)
    }
  }

  if (loading) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" disabled>
            <div className="text-foreground flex items-center justify-center">
              <CheckIcon className="size-7" />
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">Supercheck</span>
              <span className="truncate text-xs">Loading...</span>
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    )
  }

  return (
    <>
      <Dialog open={showNewProjectDialog} onOpenChange={setShowNewProjectDialog}>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu open={isOpen} onOpenChange={handleOpenChange}>
              <DropdownMenuTrigger asChild className="focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0">
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground group-data-[collapsible=icon]:ml-2.5 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
                >
                  <div className="text-foreground flex items-center justify-center">
                    <CheckIcon className="size-7" />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">Supercheck</span>
                    <span className="truncate text-xs">{currentProject?.name || "No project"}</span>
                  </div>
                  <ChevronsUpDown className="ml-auto" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
                align="start"
                side={isMobile ? "bottom" : "right"}
                sideOffset={4}
              >
                <DropdownMenuLabel className="text-muted-foreground text-xs">
                  Projects
                </DropdownMenuLabel>
                
                {/* Search Bar */}
                <div className="px-2 py-1.5" onMouseDown={(e) => e.stopPropagation()}>
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <Input
                      ref={searchInputRef}
                      placeholder="Search projects..."
                      value={searchQuery}
                      onChange={handleSearchChange}
                      onKeyDown={handleSearchKeyDown}
                      className="h-8 pl-8 text-xs"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                </div>

                {/* Project List */}
                <div className="max-h-48 overflow-y-auto">
                  {filteredProjects.map((project, index) => (
                    <DropdownMenuItem
                      key={project.id}
                      onClick={() => handleProjectSelect(project)}
                      className="gap-2 p-2"
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">{project.name}</span>
                        {project.description && (
                          <span className="text-xs text-muted-foreground truncate">
                            {project.description}
                          </span>
                        )}
                      </div>
                      <DropdownMenuShortcut>⌘{index + 1}</DropdownMenuShortcut>
                    </DropdownMenuItem>
                  ))}
                  {filteredProjects.length === 0 && (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground text-center">
                      No projects found
                    </div>
                  )}
                </div>

                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  className="gap-2 p-2"
                  onClick={() => {
                    setIsOpen(false)
                    setShowNewProjectDialog(true)
                  }}
                >
                  <div className="bg-background flex size-6 items-center justify-center rounded-md border">
                    <Plus className="size-4" />
                  </div>
                  <div className="text-muted-foreground font-medium">Add project</div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create Project</DialogTitle>
            <DialogDescription>
              Create a new project to organize your tests, jobs, and monitors.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Name
              </Label>
              <Input
                id="name"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                className="col-span-3"
                placeholder="Enter project name"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="description" className="text-right">
                Description
              </Label>
              <Input
                id="description"
                value={newProjectDescription}
                onChange={(e) => setNewProjectDescription(e.target.value)}
                className="col-span-3"
                placeholder="Enter project description (optional)"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    createProject()
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="submit"
              onClick={createProject}
              disabled={creating || !newProjectName.trim()}
            >
              {creating ? "Creating..." : "Create Project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
