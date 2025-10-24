"use client";

import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Globe } from "lucide-react";
import { getLocationMetadata } from "@/lib/location-service";
import type { MonitoringLocation } from "@/lib/location-service";

interface LocationFilterDropdownProps {
  selectedLocation: "all" | MonitoringLocation;
  availableLocations: MonitoringLocation[];
  onLocationChange: (location: "all" | MonitoringLocation) => void;
  className?: string;
}

export function LocationFilterDropdown({
  selectedLocation,
  availableLocations,
  onLocationChange,
  className = "",
}: LocationFilterDropdownProps) {
  if (availableLocations.length <= 1) {
    return null; // Don't show dropdown if only one location
  }

  return (
    <Select
      value={selectedLocation}
      onValueChange={(value) =>
        onLocationChange(value as "all" | MonitoringLocation)
      }
    >
      <SelectTrigger className={`w-[200px] ${className}`}>
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4" />
          <SelectValue />
        </div>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Locations</SelectItem>
        {availableLocations.map((location) => {
          const metadata = getLocationMetadata(location);
          return (
            <SelectItem key={location} value={location}>
              <div className="flex items-center gap-2">
                {metadata?.flag && <span>{metadata.flag}</span>}
                <span>{metadata?.name || location}</span>
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
