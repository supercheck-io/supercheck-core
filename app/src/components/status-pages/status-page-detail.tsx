"use client";

import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Globe, Settings, Tally4, AlertCircle, ExternalLink, Upload, EyeOff, Loader2 } from "lucide-react";
import Link from "next/link";
import { ComponentsTab } from "./components-tab";
import { IncidentsTab } from "./incidents-tab";
import { publishStatusPage, unpublishStatusPage } from "@/actions/publish-status-page";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

type StatusPage = {
  id: string;
  name: string;
  subdomain: string;
  status: string;
  pageDescription: string | null;
  headline: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

type Monitor = {
  id: string;
  name: string;
  type: string;
  status?: string;
};

type ComponentGroup = {
  id: string;
  name: string;
  description: string | null;
  position: number | null;
  statusPageId: string;
  createdAt: Date | null;
  updatedAt: Date | null;
};

type Component = {
  id: string;
  name: string;
};

type StatusPageDetailProps = {
  statusPage: StatusPage;
  monitors: Monitor[];
  componentGroups: ComponentGroup[];
  components: Component[];
};

export function StatusPageDetail({ statusPage, monitors, componentGroups, components }: StatusPageDetailProps) {
  const router = useRouter();
  const [isPublishing, setIsPublishing] = useState(false);

  const handlePublish = async () => {
    setIsPublishing(true);
    try {
      const result = await publishStatusPage(statusPage.id);
      if (result.success) {
        toast.success("Status page published successfully", {
          description: `Your status page is now publicly accessible at ${statusPage.subdomain}.supercheck.io`,
        });
        router.refresh();
      } else {
        toast.error("Failed to publish status page", {
          description: result.message,
        });
      }
    } catch (error) {
      console.error("Error publishing status page:", error);
      toast.error("Failed to publish status page", {
        description: "An unexpected error occurred",
      });
    } finally {
      setIsPublishing(false);
    }
  };

  const handleUnpublish = async () => {
    setIsPublishing(true);
    try {
      const result = await unpublishStatusPage(statusPage.id);
      if (result.success) {
        toast.success("Status page unpublished successfully", {
          description: "Your status page is no longer publicly accessible",
        });
        router.refresh();
      } else {
        toast.error("Failed to unpublish status page", {
          description: result.message,
        });
      }
    } catch (error) {
      console.error("Error unpublishing status page:", error);
      toast.error("Failed to unpublish status page", {
        description: "An unexpected error occurred",
      });
    } finally {
      setIsPublishing(false);
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "published":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "draft":
        return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
      case "archived":
        return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <Card className="shadow-sm">
        <CardContent className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-semibold">{statusPage.name}</h1>
                <Badge className={getStatusBadgeColor(statusPage.status)}>
                  {statusPage.status}
                </Badge>
              </div>
              {statusPage.headline && (
                <p className="text-lg text-muted-foreground mb-2">
                  {statusPage.headline}
                </p>
              )}
              {statusPage.pageDescription && (
                <p className="text-sm text-muted-foreground">
                  {statusPage.pageDescription}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button asChild variant="outline">
                <Link href={`/status-pages/${statusPage.id}/public`}>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Preview
                </Link>
              </Button>
              {statusPage.status === "published" ? (
                <Button
                  variant="outline"
                  onClick={handleUnpublish}
                  disabled={isPublishing}
                >
                  {isPublishing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <EyeOff className="h-4 w-4 mr-2" />
                  )}
                  Unpublish
                </Button>
              ) : (
                <Button
                  onClick={handlePublish}
                  disabled={isPublishing}
                >
                  {isPublishing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  Publish
                </Button>
              )}
              <Button variant="outline">
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 bg-muted rounded-lg">
            <Globe className="h-4 w-4 flex-shrink-0" />
            <span className="font-mono text-xs">
              https://{statusPage.subdomain}.supercheck.io
            </span>
            <span className="text-muted-foreground">
              (Local preview: /status-pages/{statusPage.id}/public)
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Tabs Section */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">
            <Tally4 className="h-4 w-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="components">
            <Settings className="h-4 w-4 mr-2" />
            Components
          </TabsTrigger>
          <TabsTrigger value="incidents">
            <AlertCircle className="h-4 w-4 mr-2" />
            Incidents
          </TabsTrigger>
          <TabsTrigger value="subscribers">
            <Globe className="h-4 w-4 mr-2" />
            Subscribers
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card className="shadow-sm">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold mb-4">Status Page Overview</h3>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="p-4 border rounded-lg">
                  <div className="text-2xl font-bold">0</div>
                  <div className="text-sm text-muted-foreground">Components</div>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="text-2xl font-bold">0</div>
                  <div className="text-sm text-muted-foreground">Active Incidents</div>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="text-2xl font-bold">0</div>
                  <div className="text-sm text-muted-foreground">Subscribers</div>
                </div>
              </div>

              <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                <h4 className="font-medium mb-2">Getting Started</h4>
                <ul className="text-sm text-muted-foreground space-y-2">
                  <li>1. Add components to track your services</li>
                  <li>2. Link monitors to components for automated status updates</li>
                  <li>3. Create incidents when issues occur</li>
                  <li>4. Customize branding and colors in settings</li>
                  <li>5. Publish your status page when ready</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="components">
          <Card className="shadow-sm">
            <CardContent className="p-0">
              <ComponentsTab
                statusPageId={statusPage.id}
                monitors={monitors}
                componentGroups={componentGroups}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="incidents">
          <Card className="shadow-sm">
            <CardContent className="p-0">
              <IncidentsTab
                statusPageId={statusPage.id}
                components={components.map(c => ({ id: c.id, name: c.name }))}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="subscribers">
          <Card className="shadow-sm">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold mb-4">Subscribers</h3>
              <div className="text-center py-12 border-2 border-dashed rounded-lg">
                <Globe className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h4 className="text-lg font-semibold mb-2">No subscribers yet</h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Users can subscribe to receive notifications about incidents and updates
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
