"use client"

import * as React from "react"
import { ChevronsUpDown, Plus, Search, Edit3 } from "lucide-react"
import { CheckIcon } from "@/components/logo/supercheck-logo"
import { useProjectContext } from "@/hooks/use-project-context"
import { createProjectSchema, updateProjectSchema, type CreateProjectFormData, type UpdateProjectFormData } from "@/lib/validations/project"
import { FormInput } from "@/components/ui/form-input"
import { useFormValidation } from "@/hooks/use-form-validation"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
// import { Label } from "@/components/ui/label"
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
  const [showEditProjectDialog, setShowEditProjectDialog] = React.useState(false)
  const [editingProjectId, setEditingProjectId] = React.useState<string | null>(null)
  const [editingProjectName, setEditingProjectName] = React.useState("")
  const [editingProjectDescription, setEditingProjectDescription] = React.useState("")
  const [updating, setUpdating] = React.useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Form validation hooks
  const {
    errors: createErrors,
    isValidating: isCreatingValidating,
    validate: validateCreateForm,
    clearErrors: clearCreateErrors,
  } = useFormValidation({
    schema: createProjectSchema,
    onSuccess: async (data) => {
      await handleCreateProject(data)
    },
  })

  const {
    errors: updateErrors,
    isValidating: isUpdatingValidating,
    validate: validateUpdateForm,
    clearErrors: clearUpdateErrors,
  } = useFormValidation({
    schema: updateProjectSchema,
    onSuccess: async (data) => {
      await handleUpdateProject(editingProjectId!, data)
    },
  })

  // Filter and sort projects based on search query
  const filteredProjects = (projects || [])
    .filter(project =>
      project.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => a.name.localeCompare(b.name))

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

  const startEditingProject = (project: { id: string; name: string; description?: string }) => {
    setEditingProjectId(project.id)
    setEditingProjectName(project.name)
    setEditingProjectDescription(project.description || "")
    setShowEditProjectDialog(true)
  }



  // const cancelEditingProject = () => {
  //   setEditingProjectId(null)
  //   setEditingProjectName("")
  //   setEditingProjectDescription("")
  //   clearUpdateErrors()
  // }

  // const cancelEditDialog = () => {
  //   setShowEditProjectDialog(false)
  //   setEditingProjectId(null)
  //   setEditingProjectName("")
  //   setEditingProjectDescription("")
  //   clearUpdateErrors()
  // }

  const handleUpdateProject = async (projectId: string, formData: UpdateProjectFormData) => {
    setUpdating(true)
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      })

      const data = await response.json()

      if (data.success) {
        toast.success(`Updated project "${formData.name}"`)
        setEditingProjectId(null)
        setEditingProjectName("")
        setEditingProjectDescription("")
        setShowEditProjectDialog(false)
        clearUpdateErrors()
        // Refresh the page to update all components with new project data
        window.location.reload()
      } else {
        toast.error(data.error || "Failed to update project")
      }
    } catch (error) {
      console.error("Error updating project:", error)
      toast.error("Failed to update project")
    } finally {
      setUpdating(false)
    }
  }

  const updateProject = async () => {
    const formData = {
      name: editingProjectName.trim(),
      description: editingProjectDescription.trim(),
    }

    await validateUpdateForm(formData)
  }

  const handleCreateProject = async (formData: CreateProjectFormData) => {
    setCreating(true)
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      })

      const data = await response.json()

      if (data.success) {
        const newProject = data.data
        setNewProjectName("")
        setNewProjectDescription("")
        clearCreateErrors()
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

  const createProject = async () => {
    const formData = {
      name: newProjectName.trim(),
      description: newProjectDescription.trim(),
    }

    await validateCreateForm(formData)
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
                  {filteredProjects.map((project) => (
                    <DropdownMenuItem
                      key={project.id}
                      className="gap-2 p-2 flex items-center justify-between group"
                    >
                      <div className="flex items-center justify-between flex-1" onClick={() => handleProjectSelect(project)}>
                        <span className="font-medium truncate">{project.name}</span>
                        {currentProject?.id === project.id && (
                          <div className="h-2.5 w-2.5 rounded-full bg-primary flex-shrink-0 ml-2" />
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation()
                          startEditingProject(project)
                        }}
                      >
                        <Edit3 className="h-3 w-3" />
                      </Button>
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
                  <div className="font-medium">Add project</div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create Project</DialogTitle>
            <DialogDescription>
              Create a new project to organize your tests, jobs, and monitors. Both name and description are required.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <FormInput
              id="name"
              label="Name"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="Enter project name"
              maxLength={20}
              showCharacterCount={true}
              error={createErrors.name}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  createProject()
                }
              }}
            />
            <FormInput
              id="description"
              label="Description"
              value={newProjectDescription}
              onChange={(e) => setNewProjectDescription(e.target.value)}
              placeholder="Enter project description"
              maxLength={100}
              showCharacterCount={true}
              error={createErrors.description}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  createProject()
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button
              type="submit"
              onClick={createProject}
              disabled={creating || isCreatingValidating || !newProjectName.trim() || !newProjectDescription.trim()}
            >
              {creating ? "Creating..." : "Create Project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Project Dialog */}
      <Dialog open={showEditProjectDialog} onOpenChange={setShowEditProjectDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
            <DialogDescription>
              Update your project details. Both name and description are required.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <FormInput
              id="edit-name"
              label="Name"
              value={editingProjectName}
              onChange={(e) => setEditingProjectName(e.target.value)}
              placeholder="Enter project name"
              maxLength={20}
              showCharacterCount={true}
              error={updateErrors.name}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  updateProject()
                }
              }}
            />
            <FormInput
              id="edit-description"
              label="Description"
              value={editingProjectDescription}
              onChange={(e) => setEditingProjectDescription(e.target.value)}
              placeholder="Enter project description"
              maxLength={100}
              showCharacterCount={true}
              error={updateErrors.description}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  updateProject()
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button
              type="submit"
              onClick={updateProject}
              disabled={updating || isUpdatingValidating || !editingProjectName.trim() || !editingProjectDescription.trim()}
            >
              {updating ? "Updating..." : "Update Project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
