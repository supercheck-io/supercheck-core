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
import { AlertCircle, Plus, MessageSquare, Trash2, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { getIncidents } from "@/actions/get-incidents";
import { deleteIncident } from "@/actions/delete-incident";
import { IncidentFormDialog } from "./incident-form-dialog";
import { IncidentUpdateDialog } from "./incident-update-dialog";
import { formatDistanceToNow } from "date-fns";

type IncidentStatus = "investigating" | "identified" | "monitoring" | "resolved" | "scheduled";
type IncidentImpact = "none" | "minor" | "major" | "critical";

type Incident = {
  id: string;
  name: string;
  status: IncidentStatus;
  impact: IncidentImpact;
  body: string | null;
  createdAt: Date | null;
  resolvedAt: Date | null;
  affectedComponentsCount: number;
  affectedComponents: Array<{ id: string; name: string }>;
  latestUpdate: {
    body: string;
    createdAt: Date | null;
  } | null;
};

type Component = {
  id: string;
  name: string;
};

type IncidentsTabProps = {
  statusPageId: string;
  components: Component[];
};

export function IncidentsTab({ statusPageId, components }: IncidentsTabProps) {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [deletingIncident, setDeletingIncident] = useState<Incident | null>(null);

  const loadIncidents = useCallback(async () => {
    try {
      setLoading(true);
      const result = await getIncidents(statusPageId);

      if (result.success) {
        setIncidents(result.incidents as Incident[]);
      } else {
        console.error('Failed to fetch incidents:', result.message);
        toast.error("Failed to load incidents", {
          description: result.message,
        });
      }
    } catch (error) {
      console.error('Error loading incidents:', error);
      toast.error("Failed to load incidents", {
        description: "An unexpected error occurred",
      });
    } finally {
      setLoading(false);
    }
  }, [statusPageId]);

  useEffect(() => {
    loadIncidents();
  }, [loadIncidents]);

  const handleUpdateClick = (incident: Incident) => {
    setSelectedIncident(incident);
    setIsUpdateDialogOpen(true);
  };

  const handleDeleteClick = (incident: Incident) => {
    setDeletingIncident(incident);
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingIncident) return;

    try {
      const result = await deleteIncident(deletingIncident.id, statusPageId);

      if (result.success) {
        setIncidents(prev => prev.filter(i => i.id !== deletingIncident.id));
        toast.success("Incident deleted successfully");
      } else {
        toast.error("Failed to delete incident", {
          description: result.message,
        });
      }
    } catch (error) {
      console.error('Error deleting incident:', error);
      toast.error("Failed to delete incident", {
        description: "An unexpected error occurred",
      });
    } finally {
      setIsDeleteDialogOpen(false);
      setDeletingIncident(null);
    }
  };

  const getStatusBadgeColor = (status: IncidentStatus) => {
    switch (status) {
      case 'investigating':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
      case 'identified':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'monitoring':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'resolved':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'scheduled':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
    }
  };

  const getImpactBadgeColor = (impact: IncidentImpact) => {
    switch (impact) {
      case 'critical':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'major':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
      case 'minor':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'none':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-muted rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold">Incidents</h3>
          <p className="text-sm text-muted-foreground">
            Manage incidents to communicate service disruptions
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)} disabled={components.length === 0}>
          <Plus className="h-4 w-4 mr-2" />
          Create Incident
        </Button>
      </div>

      {components.length === 0 && (
        <div className="mb-4 p-4 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            You need to create components before you can create incidents.
          </p>
        </div>
      )}

      {incidents.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed rounded-lg">
          <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
          <h4 className="text-lg font-semibold mb-2">No incidents reported</h4>
          <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
            {components.length === 0
              ? "Create components first, then create incidents to communicate service disruptions"
              : "Create incidents to communicate service disruptions to your users"}
          </p>
          {components.length > 0 && (
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create First Incident
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {incidents.map((incident) => (
            <div
              key={incident.id}
              className="border rounded-lg p-4 hover:border-primary transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="h-5 w-5 text-muted-foreground" />
                    <h4 className="font-semibold text-lg">{incident.name}</h4>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className={`${getStatusBadgeColor(incident.status)} text-xs`}>
                      {incident.status.replace(/_/g, ' ')}
                    </Badge>
                    <Badge className={`${getImpactBadgeColor(incident.impact)} text-xs`}>
                      {incident.impact} impact
                    </Badge>
                  </div>
                  {incident.latestUpdate && (
                    <p className="text-sm text-muted-foreground mt-2">
                      {incident.latestUpdate.body}
                    </p>
                  )}
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                    <span>
                      {incident.affectedComponentsCount} component{incident.affectedComponentsCount !== 1 ? 's' : ''} affected
                    </span>
                    {incident.createdAt && (
                      <span>
                        Created {formatDistanceToNow(new Date(incident.createdAt), { addSuffix: true })}
                      </span>
                    )}
                    {incident.resolvedAt && (
                      <span className="text-green-600">
                        Resolved {formatDistanceToNow(new Date(incident.resolvedAt), { addSuffix: true })}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleUpdateClick(incident)}
                  >
                    <MessageSquare className="h-4 w-4 mr-1" />
                    Update
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteClick(incident)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {incident.affectedComponents && incident.affectedComponents.length > 0 && (
                <div className="mt-3 pt-3 border-t">
                  <p className="text-xs text-muted-foreground mb-2">Affected components:</p>
                  <div className="flex flex-wrap gap-2">
                    {incident.affectedComponents.map((component) => (
                      <Badge key={component.id} variant="secondary" className="text-xs">
                        {component.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <IncidentFormDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        statusPageId={statusPageId}
        components={components}
        onSuccess={loadIncidents}
      />

      <IncidentUpdateDialog
        open={isUpdateDialogOpen}
        onOpenChange={setIsUpdateDialogOpen}
        statusPageId={statusPageId}
        incident={selectedIncident}
        onSuccess={loadIncidents}
      />

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Incident</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deletingIncident?.name}&quot;?
              <br />
              <br />
              This will permanently delete the incident and all its updates. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setIsDeleteDialogOpen(false);
              setDeletingIncident(null);
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
    </div>
  );
}
