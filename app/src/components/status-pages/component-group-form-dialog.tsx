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
import { Loader2 } from "lucide-react";
import { createComponentGroup, type CreateComponentGroupData } from "@/actions/create-component-group";
import { toast } from "sonner";

type ComponentGroup = {
  id: string;
  name: string;
  description: string | null;
  position: number | null;
};

type ComponentGroupFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  statusPageId: string;
  componentGroup?: ComponentGroup;
  onSuccess: () => void;
};

export function ComponentGroupFormDialog({
  open,
  onOpenChange,
  statusPageId,
  componentGroup,
  onSuccess,
}: ComponentGroupFormDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: componentGroup?.name || "",
    description: componentGroup?.description || "",
  });

  // Reset form when dialog opens with new component group data
  useEffect(() => {
    if (open) {
      setFormData({
        name: componentGroup?.name || "",
        description: componentGroup?.description || "",
      });
    }
  }, [open, componentGroup]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // For now, we only support creating component groups
      // Updating can be added later if needed
      const createData: CreateComponentGroupData = {
        statusPageId,
        name: formData.name,
        description: formData.description || undefined,
        position: 0,
      };

      const result = await createComponentGroup(createData);

      if (result.success) {
        toast.success("Component group created successfully");
        onSuccess();
        onOpenChange(false);
      } else {
        toast.error("Failed to create component group", {
          description: result.message || "An unexpected error occurred",
        });
      }
    } catch (error) {
      console.error("Failed to submit component group:", error);
      toast.error("Failed to save component group", {
        description: "An unexpected error occurred",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {componentGroup ? "Edit Component Group" : "Add Component Group"}
          </DialogTitle>
          <DialogDescription>
            {componentGroup
              ? "Update the component group details"
              : "Create a new group to organize related components"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">Group Name *</Label>
            <Input
              id="name"
              placeholder="Core Services"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              disabled={isSubmitting}
            />
            <p className="text-sm text-muted-foreground">
              A descriptive name for this component group
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Essential services that power our platform"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              disabled={isSubmitting}
            />
            <p className="text-sm text-muted-foreground">
              Optional description of this group
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
              {isSubmitting ? "Saving..." : componentGroup ? "Update Group" : "Add Group"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
