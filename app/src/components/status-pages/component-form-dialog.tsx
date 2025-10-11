"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { createComponent, type CreateComponentData } from "@/actions/create-component";
import { updateComponent, type UpdateComponentData } from "@/actions/update-component";
import { toast } from "sonner";

type ComponentStatus = "operational" | "degraded_performance" | "partial_outage" | "major_outage" | "under_maintenance";

type Component = {
  id: string;
  name: string;
  description: string | null;
  status: ComponentStatus;
  monitorId: string | null;
  componentGroupId: string | null;
  showcase: boolean;
  onlyShowIfDegraded: boolean;
  position: number;
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

type ComponentFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  statusPageId: string;
  component?: Component;
  monitors: Monitor[];
  componentGroups: ComponentGroup[];
  onSuccess: () => void;
};

const statusOptions: { value: ComponentStatus; label: string; color: string }[] = [
  { value: "operational", label: "Operational", color: "text-green-600" },
  { value: "degraded_performance", label: "Degraded Performance", color: "text-yellow-600" },
  { value: "partial_outage", label: "Partial Outage", color: "text-orange-600" },
  { value: "major_outage", label: "Major Outage", color: "text-red-600" },
  { value: "under_maintenance", label: "Under Maintenance", color: "text-blue-600" },
];

export function ComponentFormDialog({
  open,
  onOpenChange,
  statusPageId,
  component,
  monitors,
  componentGroups,
  onSuccess,
}: ComponentFormDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: component?.name || "",
    description: component?.description || "",
    status: component?.status || "operational" as ComponentStatus,
    monitorId: component?.monitorId || "none",
    componentGroupId: component?.componentGroupId || "none",
  });

  // Reset form when dialog opens with new component data
  useEffect(() => {
    if (open) {
      setFormData({
        name: component?.name || "",
        description: component?.description || "",
        status: component?.status || "operational",
        monitorId: component?.monitorId || "none",
        componentGroupId: component?.componentGroupId || "none",
      });
    }
  }, [open, component]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      if (component) {
        // Update existing component
        const updateData: UpdateComponentData = {
          id: component.id,
          statusPageId,
          name: formData.name,
          description: formData.description || null,
          status: formData.status,
          monitorId: formData.monitorId === "none" ? null : formData.monitorId,
          componentGroupId: formData.componentGroupId === "none" ? null : formData.componentGroupId,
        };

        const result = await updateComponent(updateData);

        if (result.success) {
          toast.success("Component updated successfully");
          onSuccess();
          onOpenChange(false);
        } else {
          toast.error("Failed to update component", {
            description: result.message || "An unexpected error occurred",
          });
        }
      } else {
        // Create new component
        const createData: CreateComponentData = {
          statusPageId,
          name: formData.name,
          description: formData.description || undefined,
          status: formData.status,
          monitorId: formData.monitorId === "none" ? null : formData.monitorId,
          componentGroupId: formData.componentGroupId === "none" ? null : formData.componentGroupId,
          showcase: true,
          onlyShowIfDegraded: false,
          position: 0,
        };

        const result = await createComponent(createData);

        if (result.success) {
          toast.success("Component created successfully");
          onSuccess();
          onOpenChange(false);
        } else {
          toast.error("Failed to create component", {
            description: result.message || "An unexpected error occurred",
          });
        }
      }
    } catch (error) {
      console.error("Failed to submit component:", error);
      toast.error("Failed to save component", {
        description: "An unexpected error occurred",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{component ? "Edit Component" : "Add Component"}</DialogTitle>
          <DialogDescription>
            {component
              ? "Update the component details and status"
              : "Add a new component to track the health of a service or feature"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">Component Name *</Label>
            <Input
              id="name"
              placeholder="API Server"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              disabled={isSubmitting}
            />
            <p className="text-sm text-muted-foreground">
              A descriptive name for this service component
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="RESTful API for client applications"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              disabled={isSubmitting}
            />
            <p className="text-sm text-muted-foreground">
              Optional description of what this component does
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Status *</Label>
            <Select
              value={formData.status}
              onValueChange={(value: ComponentStatus) =>
                setFormData({ ...formData, status: value })
              }
              disabled={isSubmitting}
            >
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <span className={option.color}>{option.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Current operational status of this component
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="monitor">Linked Monitor (Optional)</Label>
            <Select
              value={formData.monitorId}
              onValueChange={(value) =>
                setFormData({ ...formData, monitorId: value })
              }
              disabled={isSubmitting}
            >
              <SelectTrigger id="monitor">
                <SelectValue placeholder="Select a monitor..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No monitor</SelectItem>
                {monitors.map((monitor) => (
                  <SelectItem key={monitor.id} value={monitor.id}>
                    {monitor.name} ({monitor.type})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Link this component to a monitor for reference only (status updates are manual via incidents)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="componentGroup">Component Group (Optional)</Label>
            <Select
              value={formData.componentGroupId}
              onValueChange={(value) =>
                setFormData({ ...formData, componentGroupId: value })
              }
              disabled={isSubmitting}
            >
              <SelectTrigger id="componentGroup">
                <SelectValue placeholder="No group" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No group</SelectItem>
                {componentGroups.map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Organize components into logical groups
            </p>
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSubmitting ? "Saving..." : component ? "Update Component" : "Add Component"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
