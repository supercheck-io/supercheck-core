"use client";

import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  XCircle,
  Wrench,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { format, subDays, startOfDay, isToday, isAfter } from "date-fns";

type ComponentStatus =
  | "operational"
  | "degraded_performance"
  | "partial_outage"
  | "major_outage"
  | "under_maintenance";
type IncidentStatus =
  | "investigating"
  | "identified"
  | "monitoring"
  | "resolved"
  | "scheduled";
type IncidentImpact = "none" | "minor" | "major" | "critical";

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

type Component = {
  id: string;
  name: string;
  description: string | null;
  status: ComponentStatus;
  showcase: boolean | null;
  onlyShowIfDegraded: boolean | null;
};

type Incident = {
  id: string;
  name: string;
  status: IncidentStatus;
  impact: IncidentImpact;
  createdAt: Date | null;
  resolvedAt: Date | null;
  latestUpdate: {
    body: string;
    createdAt: Date | null;
  } | null;
};

type PublicStatusPageProps = {
  statusPage: StatusPage;
  components: Component[];
  incidents: Incident[];
};

export function PublicStatusPage({
  statusPage,
  components,
  incidents,
}: PublicStatusPageProps) {
  // Calculate overall system status from components
  const calculateSystemStatus = () => {
    if (components.length === 0) return "operational";

    const statuses = components.map((c) => c.status);

    if (statuses.includes("major_outage")) return "major_outage";
    if (statuses.includes("partial_outage")) return "partial_outage";
    if (statuses.includes("degraded_performance"))
      return "degraded_performance";
    if (statuses.includes("under_maintenance")) return "under_maintenance";

    return "operational";
  };

  const systemStatus = calculateSystemStatus();

  const getSystemStatusDisplay = () => {
    switch (systemStatus) {
      case "operational":
        return {
          icon: CheckCircle2,
          text: "All Systems Operational",
          subtext: "All services are running normally",
          color: "text-white",
          bgColor: "bg-green-600",
          badgeColor: "bg-green-100 text-green-800",
        };
      case "degraded_performance":
        return {
          icon: AlertTriangle,
          text: "Degraded Performance",
          subtext: "Some services are experiencing issues",
          color: "text-white",
          bgColor: "bg-yellow-500",
          badgeColor: "bg-yellow-100 text-yellow-800",
        };
      case "partial_outage":
        return {
          icon: AlertCircle,
          text: "Partial Outage",
          subtext: "Some services are unavailable",
          color: "text-white",
          bgColor: "bg-orange-500",
          badgeColor: "bg-orange-100 text-orange-800",
        };
      case "major_outage":
        return {
          icon: XCircle,
          text: "Major Outage",
          subtext: "Services are currently unavailable",
          color: "text-white",
          bgColor: "bg-red-600",
          badgeColor: "bg-red-100 text-red-800",
        };
      case "under_maintenance":
        return {
          icon: Wrench,
          text: "Scheduled Maintenance",
          subtext: "Services are under maintenance",
          color: "text-white",
          bgColor: "bg-blue-500",
          badgeColor: "bg-blue-100 text-blue-800",
        };
      default:
        return {
          icon: CheckCircle2,
          text: "All Systems Operational",
          subtext: "All services are running normally",
          color: "text-white",
          bgColor: "bg-green-600",
          badgeColor: "bg-green-100 text-green-800",
        };
    }
  };

  const getComponentStatusDisplay = (status: ComponentStatus) => {
    switch (status) {
      case "operational":
        return {
          icon: CheckCircle2,
          text: "Operational",
          color: "text-green-600",
        };
      case "degraded_performance":
        return {
          icon: AlertTriangle,
          text: "Degraded Performance",
          color: "text-yellow-600",
        };
      case "partial_outage":
        return {
          icon: AlertCircle,
          text: "Partial Outage",
          color: "text-orange-600",
        };
      case "major_outage":
        return {
          icon: XCircle,
          text: "Major Outage",
          color: "text-red-600",
        };
      case "under_maintenance":
        return {
          icon: Wrench,
          text: "Under Maintenance",
          color: "text-blue-600",
        };
    }
  };

  const statusDisplay = getSystemStatusDisplay();
  const StatusIcon = statusDisplay.icon;

  // Filter components to show
  const visibleComponents = components.filter((component) => {
    if (!component.showcase) return false;
    if (component.onlyShowIfDegraded && component.status === "operational")
      return false;
    return true;
  });

  // Generate 90 days of uptime data based on incidents
  const generateUptimeData = (): UptimeDayData[] => {
    const days = [];
    const statusPageCreatedDate = statusPage.createdAt
      ? new Date(statusPage.createdAt)
      : new Date();
    const isPageCreatedToday = isToday(statusPageCreatedDate);

    // Group incidents by date
    const incidentsByDate = new Map<string, Incident[]>();
    incidents.forEach((incident) => {
      if (incident.createdAt) {
        const dateKey = format(
          startOfDay(new Date(incident.createdAt)),
          "yyyy-MM-dd"
        );
        if (!incidentsByDate.has(dateKey)) {
          incidentsByDate.set(dateKey, []);
        }
        incidentsByDate.get(dateKey)!.push(incident);
      }
    });

    // Determine highest impact for each day
    const getHighestImpact = (
      dayIncidents: Incident[]
    ): IncidentImpact | null => {
      if (dayIncidents.length === 0) return null;

      const impactOrder: IncidentImpact[] = [
        "critical",
        "major",
        "minor",
        "none",
      ];
      for (const impact of impactOrder) {
        if (dayIncidents.some((inc) => inc.impact === impact)) {
          return impact;
        }
      }
      return "none";
    };

    for (let i = 89; i >= 0; i--) {
      const date = subDays(new Date(), i);
      const dateKey = format(startOfDay(date), "yyyy-MM-dd");
      const dayIncidents = incidentsByDate.get(dateKey) || [];
      const hasIncidents = dayIncidents.length > 0;
      const highestImpact = getHighestImpact(dayIncidents);

      // If page was created today, all bars should be gray
      if (isPageCreatedToday && isAfter(date, statusPageCreatedDate)) {
        days.push({
          date,
          isUp: null, // null indicates no data
          status: "nodata" as const,
          hasIncidents: false,
          highestImpact: null,
          dayIncidents,
        });
      } else {
        days.push({
          date,
          isUp: !hasIncidents,
          status: hasIncidents ? ("incident" as const) : ("up" as const),
          hasIncidents,
          highestImpact,
          dayIncidents,
        });
      }
    }
    return days;
  };

  // Define a type for the uptime day data
  type UptimeDayData = {
    date: Date;
    isUp: boolean | null;
    status: "up" | "incident" | "nodata";
    hasIncidents: boolean;
    highestImpact: IncidentImpact | null;
    dayIncidents: Incident[];
  };

  const UptimeBar = ({
    data,
  }: {
    data: ReturnType<typeof generateUptimeData>;
  }) => {
    const [hoveredDay, setHoveredDay] = useState<number | null>(null);

    const getBarColor = (day: UptimeDayData) => {
      if (day.status === "nodata") {
        return "bg-gray-400 hover:bg-gray-500";
      }

      if (!day.hasIncidents) {
        return "bg-green-500 hover:bg-green-600";
      }

      // Color based on incident impact
      switch (day.highestImpact) {
        case "critical":
          return "bg-red-600 hover:bg-red-700";
        case "major":
          return "bg-orange-500 hover:bg-orange-600";
        case "minor":
          return "bg-yellow-500 hover:bg-yellow-600";
        default:
          return "bg-gray-500 hover:bg-gray-600";
      }
    };

    const getTooltipColor = (day: UptimeDayData) => {
      if (day.status === "nodata") {
        return "bg-gray-700";
      }

      if (!day.hasIncidents) {
        return "bg-green-700";
      }

      // Color based on incident impact
      switch (day.highestImpact) {
        case "critical":
          return "bg-red-700";
        case "major":
          return "bg-orange-600";
        case "minor":
          return "bg-yellow-600";
        default:
          return "bg-gray-600";
      }
    };

    return (
      <div className="relative">
        <div className="flex gap-1 items-center">
          {data.map((day, index) => (
            <div
              key={index}
              className={`h-10 flex-1 ${getBarColor(
                day
              )} relative cursor-pointer transition-all duration-200`}
              onMouseEnter={() => setHoveredDay(index)}
              onMouseLeave={() => setHoveredDay(null)}
            />
          ))}
        </div>

        {/* Tooltip positioned below the bar */}
        {hoveredDay !== null && (
          <div
            className={`absolute top-full left-0 mt-2 p-2 ${getTooltipColor(
              data[hoveredDay]
            )} text-white text-xs rounded shadow-lg z-10 max-w-xs`}
            style={{
              left: `${(hoveredDay / data.length) * 100}%`,
              transform: "translateX(-50%)",
            }}
          >
            <div className="font-medium mb-1">
              {format(data[hoveredDay].date, "MMMM d, yyyy")}
            </div>
            <div>
              {data[hoveredDay].status === "nodata"
                ? "No data available"
                : !data[hoveredDay].hasIncidents
                ? "No incidents recorded"
                : data[hoveredDay].dayIncidents.map(
                    (inc: Incident, i: number) => (
                      <div key={i} className="mb-1">
                        <span className="font-medium">{inc.name}</span>
                        <span className="ml-2 text-gray-200">
                          ({inc.impact})
                        </span>
                      </div>
                    )
                  )}
            </div>
            <div className="absolute -top-1 left-1/2 transform -translate-x-1/2">
              <div
                className={`border-4 border-transparent border-b-${getTooltipColor(
                  data[hoveredDay]
                ).replace("bg-", "")}`}
              ></div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-semibold text-gray-900">
                {statusPage.headline || statusPage.name}
              </h1>
              {statusPage.pageDescription && (
                <p className="text-gray-600 mt-2">
                  {statusPage.pageDescription}
                </p>
              )}
            </div>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white">
              SUBSCRIBE TO UPDATES
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Current Status Banner */}
        <div className={`${statusDisplay.bgColor} rounded-lg p-6`}>
          <div className="flex items-center gap-3">
            <StatusIcon className={`h-6 w-6 ${statusDisplay.color}`} />
            <span className="text-2xl font-medium text-white">
              {statusDisplay.text}
            </span>
          </div>
        </div>

        {/* Components Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
            <span>Uptime over the past 90 days.</span>
            <span>View historical uptime.</span>
          </div>

          {visibleComponents.length === 0 ? (
            <div className="bg-white border rounded-lg p-8 text-center">
              <p className="text-gray-500">No components configured yet</p>
            </div>
          ) : (
            <div className="space-y-0 bg-white border rounded-lg divide-y">
              {visibleComponents.map((component) => {
                const componentStatus = getComponentStatusDisplay(
                  component.status
                );
                const uptimeData = generateUptimeData();
                const uptimePercentage = (
                  (uptimeData.filter((d) => d.isUp).length /
                    uptimeData.length) *
                  100
                ).toFixed(1);

                return (
                  <div key={component.id} className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="font-medium text-gray-900">
                          {component.name}
                        </h3>
                        {component.description && (
                          <p className="text-sm text-gray-600 mt-1">
                            {component.description}
                          </p>
                        )}
                      </div>
                      <span
                        className={`text-sm font-medium ${componentStatus.color}`}
                      >
                        {componentStatus.text}
                      </span>
                    </div>

                    {/* 90-day uptime bar */}
                    <div className="space-y-2">
                      <UptimeBar data={uptimeData} />
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>90 days ago</span>
                        <span>{uptimePercentage}% uptime</span>
                        <span>Today</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Past Incidents Section */}
        <div className="space-y-6">
          <h2 className="text-2xl font-semibold text-gray-900">
            Past Incidents
          </h2>

          <div className="space-y-6">
            {/* Show only the 5 most recent incidents */}
            {incidents.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  No incidents reported
                </h3>
                <p className="text-gray-600">
                  All systems have been operational.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {incidents.slice(0, 5).map((incident) => (
                  <div key={incident.id} className="border-b pb-6">
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="text-lg font-medium text-gray-900">
                        {incident.name}
                      </h3>
                      <div className="flex items-center gap-2">
                        {/* Impact badge */}
                        <Badge
                          variant={
                            incident.impact === "critical"
                              ? "destructive"
                              : "secondary"
                          }
                          className="text-xs"
                        >
                          {incident.impact}
                        </Badge>
                        {/* Status badge */}
                        <Badge
                          variant={
                            incident.status === "resolved"
                              ? "default"
                              : "outline"
                          }
                          className="text-xs"
                        >
                          {incident.status.replace(/_/g, " ")}
                        </Badge>
                      </div>
                    </div>

                    <div className="text-sm text-gray-600 mb-3">
                      {incident.createdAt &&
                        format(
                          new Date(incident.createdAt),
                          "EEEE, MMMM d, yyyy 'at' HH:mm 'UTC'"
                        )}
                    </div>

                    {/* Incident updates */}
                    {incident.latestUpdate && (
                      <div className="bg-gray-50 rounded p-4 mt-3">
                        <p className="text-sm text-gray-700">
                          {incident.latestUpdate.body}
                        </p>
                        {incident.resolvedAt &&
                          incident.status === "resolved" && (
                            <p className="text-sm text-green-600 mt-2 font-medium">
                              ✓ Issue has been resolved
                            </p>
                          )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bottom pagination */}
          {incidents.length > 5 && (
            <div className="flex items-center justify-between bg-white border rounded-lg p-4">
              <Button
                variant="outline"
                size="sm"
                disabled
                className="flex items-center gap-2"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <span className="text-sm text-gray-600">
                Showing 1-5 of {incidents.length} incidents
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled
                className="flex items-center gap-2"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center py-8 text-sm text-gray-600 border-t">
          <p>
            Powered by{" "}
            <a
              href="https://supercheck.io"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              Supercheck
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
