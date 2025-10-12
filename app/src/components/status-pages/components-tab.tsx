"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Settings, Plus, Pencil, Trash2, Activity, Link as LinkIcon, Group, FolderPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { getComponents } from "@/actions/get-components";
import { deleteComponent } from "@/actions/delete-component";
import { ComponentFormDialog } from "./component-form-dialog";
import { ComponentGroupFormDialog } from "./component-group-form-dialog";

type ComponentStatus = "operational" | "degraded_performance" | "partial_outage" | "major_outage" | "under_maintenance";

type Component = {
  id: string;
  statusPageId: string;
  name: string;
  description: string | null;
  status: ComponentStatus;
  monitorId: string | null;
  componentGroupId: string | null;
  showcase: boolean;
  onlyShowIfDegraded: boolean;
  position: number;
  createdAt: Date | null;
  updatedAt: Date | null;
  monitor: {
    id: string;
    name: string;
    type: string;
    status: string;
  } | null;
};

type Monitor = {
  id: string;
  name: string;
  type: string;
};

type ComponentGroup = {
  id: string;
  name: string;
};

type ComponentsTabProps = {
  statusPageId: string;
  monitors: Monitor[];
  componentGroups: ComponentGroup[];
};

export function ComponentsTab({ statusPageId, monitors, componentGroups }: ComponentsTabProps) {
  const [components, setComponents] = useState<Component[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingComponent, setEditingComponent] = useState<Component | undefined>();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletingComponent, setDeletingComponent] = useState<Component | null>(null);
  const [isGroupFormOpen, setIsGroupFormOpen] = useState(false);
  const [showGroupsSection, setShowGroupsSection] = useState(false);

  const loadComponents = useCallback(async () => {
    try {
      setLoading(true);
      const result = await getComponents(statusPageId);

      if (result.success) {
        setComponents(result.components as Component[]);
      } else {
        console.error('Failed to fetch components:', result.message);
        toast.error("Failed to load components", {
          description: result.message,
        });
      }
    } catch (error) {
      console.error('Error loading components:', error);
      toast.error("Failed to load components", {
        description: "An unexpected error occurred",
      });
    } finally {
      setLoading(false);
    }
  }, [statusPageId]);

  useEffect(() => {
    loadComponents();
  }, [loadComponents]);

  const handleAddComponent = () => {
    setEditingComponent(undefined);
    setIsFormOpen(true);
  };

  const handleEditComponent = (component: Component) => {
    setEditingComponent(component);
    setIsFormOpen(true);
  };

  const handleDeleteClick = (component: Component) => {
    setDeletingComponent(component);
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingComponent) return;

    try {
      const result = await deleteComponent(deletingComponent.id, statusPageId);

      if (result.success) {
        setComponents(prev => prev.filter(c => c.id !== deletingComponent.id));
        toast.success("Component deleted successfully");
      } else {
        toast.error("Failed to delete component", {
          description: result.message,
        });
      }
    } catch (error) {
      console.error('Error deleting component:', error);
      toast.error("Failed to delete component", {
        description: "An unexpected error occurred",
      });
    } finally {
      setIsDeleteDialogOpen(false);
      setDeletingComponent(null);
    }
  };

  const getStatusBadgeColor = (status: ComponentStatus) => {
    switch (status) {
      case 'operational':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'degraded_performance':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'partial_outage':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
      case 'major_outage':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'under_maintenance':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
    }
  };

  const getStatusLabel = (status: ComponentStatus) => {
    switch (status) {
      case 'operational':
        return 'Operational';
      case 'degraded_performance':
        return 'Degraded Performance';
      case 'partial_outage':
        return 'Partial Outage';
      case 'major_outage':
        return 'Major Outage';
      case 'under_maintenance':
        return 'Under Maintenance';
      default:
        return status;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-muted rounded"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Group components by componentGroupId
  const groupedComponents = components.reduce((acc, component) => {
    const groupId = component.componentGroupId || 'ungrouped';
    if (!acc[groupId]) {
      acc[groupId] = [];
    }
    acc[groupId].push(component);
    return acc;
  }, {} as Record<string, Component[]>);

  // Get group name for a groupId
  const getGroupName = (groupId: string) => {
    if (groupId === 'ungrouped') return 'Ungrouped Components';
    const group = componentGroups.find(g => g.id === groupId);
    return group ? group.name : 'Unknown Group';
  };

  return (
    <>
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold">Service Components</h3>
            <p className="text-sm text-muted-foreground">
              Manage the components that make up your service
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowGroupsSection(!showGroupsSection)}>
              <Group className="h-4 w-4 mr-2" />
              {showGroupsSection ? 'Hide' : 'Manage'} Groups
            </Button>
            <Button onClick={handleAddComponent}>
              <Plus className="h-4 w-4 mr-2" />
              Add Component
            </Button>
          </div>
        </div>

        {/* Component Groups Section */}
        {showGroupsSection && (
          <div className="mb-6 p-4 bg-muted/30 rounded-lg border">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Group className="h-4 w-4" />
                Component Groups
              </h4>
              <Button size="sm" variant="outline" onClick={() => setIsGroupFormOpen(true)}>
                <FolderPlus className="h-3.5 w-3.5 mr-1.5" />
                Add Group
              </Button>
            </div>
            {componentGroups.length === 0 ? (
              <div className="text-center py-6 px-4 bg-background/50 rounded-md border border-dashed">
                <Group className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                <p className="text-xs text-muted-foreground">No groups created yet</p>
              </div>
            ) : (
              <div className="grid gap-2 md:grid-cols-3">
                {componentGroups.map((group) => (
                  <div
                    key={group.id}
                    className="p-3 bg-background rounded-md border hover:border-primary/50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-sm truncate flex-1">{group.name}</div>
                      <Badge variant="secondary" className="text-xs ml-2">
                        {components.filter(c => c.componentGroupId === group.id).length}
                      </Badge>
                    </div>
                    {group.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                        {group.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {components.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed rounded-lg">
            <Settings className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h4 className="text-lg font-semibold mb-2">No components yet</h4>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
              Add components to represent the different parts of your service
            </p>
            <Button onClick={handleAddComponent}>
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Component
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedComponents).map(([groupId, groupComponents]) => (
              <div key={groupId} className="space-y-3">
                {/* Group Header */}
                {groupId !== 'ungrouped' && (
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground border-b pb-2">
                    <Group className="h-4 w-4" />
                    <span>{getGroupName(groupId)}</span>
                    <Badge variant="secondary" className="text-xs">
                      {groupComponents.length}
                    </Badge>
                  </div>
                )}

                {/* Components in this group */}
                <div className="space-y-3">
                  {groupComponents.map((component) => (
                    <div
                      key={component.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:border-primary transition-colors"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <Activity className="h-4 w-4 text-muted-foreground" />
                          <h4 className="font-semibold">{component.name}</h4>
                          <Badge className={`${getStatusBadgeColor(component.status)} text-xs`}>
                            {getStatusLabel(component.status)}
                          </Badge>
                        </div>
                        {component.description && (
                          <p className="text-sm text-muted-foreground ml-7 mb-2">
                            {component.description}
                          </p>
                        )}
                        <div className="flex items-center gap-3 ml-7">
                          {component.monitor && (
                            <Badge variant="outline" className="text-xs gap-1">
                              <LinkIcon className="h-3 w-3" />
                              <span>{component.monitor.name}</span>
                            </Badge>
                          )}
                          {component.showcase && (
                            <Badge variant="secondary" className="text-xs">
                              Visible on status page
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditComponent(component)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteClick(component)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      </Card>

      <ComponentFormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        statusPageId={statusPageId}
        component={editingComponent}
        monitors={monitors}
        componentGroups={componentGroups}
        onSuccess={loadComponents}
      />

      <ComponentGroupFormDialog
        open={isGroupFormOpen}
        onOpenChange={setIsGroupFormOpen}
        statusPageId={statusPageId}
        onSuccess={() => {
          // Reload the page to refresh component groups
          window.location.reload();
        }}
      />

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Component</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deletingComponent?.name}&quot;?
              <br />
              <br />
              This will remove the component from your status page and any incidents
              associated with it. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setIsDeleteDialogOpen(false);
              setDeletingComponent(null);
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
