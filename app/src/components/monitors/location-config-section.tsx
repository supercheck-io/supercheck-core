"use client";

import React, { useState, useEffect } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Globe, MapPin } from "lucide-react";
import {
  MONITORING_LOCATIONS,
  LOCATION_METADATA,
  LocationConfig,
  MonitoringLocation,
  DEFAULT_LOCATION_CONFIG,
} from "@/lib/location-service";

interface LocationConfigSectionProps {
  value?: LocationConfig | null;
  onChange: (config: LocationConfig) => void;
  disabled?: boolean;
}

export function LocationConfigSection({
  value,
  onChange,
  disabled = false,
}: LocationConfigSectionProps) {
  const [config, setConfig] = useState<LocationConfig>(
    value || DEFAULT_LOCATION_CONFIG
  );

  // Update internal state when value prop changes
  useEffect(() => {
    if (value) {
      setConfig(value);
    }
  }, [value]);

  const handleEnabledChange = (enabled: boolean) => {
    const newConfig = { ...config, enabled };
    // If enabling and no locations selected, default to US East
    if (enabled && (!config.locations || config.locations.length === 0)) {
      newConfig.locations = [MONITORING_LOCATIONS.US_EAST];
    }
    setConfig(newConfig);
    onChange(newConfig);
  };

  const handleLocationToggle = (location: MonitoringLocation) => {
    const currentLocations = config.locations || [];
    const newLocations = currentLocations.includes(location)
      ? currentLocations.filter((l) => l !== location)
      : [...currentLocations, location];

    // Require at least one location when enabled
    if (newLocations.length === 0) {
      return;
    }

    const newConfig = { ...config, locations: newLocations };
    setConfig(newConfig);
    onChange(newConfig);
  };

  const handleThresholdChange = (value: number[]) => {
    const newConfig = { ...config, threshold: value[0] };
    setConfig(newConfig);
    onChange(newConfig);
  };

  const handleStrategyChange = (strategy: "all" | "majority" | "any" | "custom") => {
    const newConfig = { ...config, strategy };
    // Auto-adjust threshold based on strategy
    if (strategy === "all") {
      newConfig.threshold = 100;
    } else if (strategy === "majority") {
      newConfig.threshold = 50;
    } else if (strategy === "any") {
      newConfig.threshold = 1;
    }
    setConfig(newConfig);
    onChange(newConfig);
  };

  const selectedLocationCount = config.locations?.length || 0;
  const upRequired = Math.ceil((selectedLocationCount * config.threshold) / 100);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-blue-600" />
            <CardTitle>Multi-Location Monitoring</CardTitle>
          </div>
          <Switch
            checked={config.enabled}
            onCheckedChange={handleEnabledChange}
            disabled={disabled}
          />
        </div>
        <CardDescription>
          Monitor from multiple geographic locations for better reliability and
          global coverage
        </CardDescription>
      </CardHeader>

      {config.enabled && (
        <CardContent className="space-y-6">
          {/* Location Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">
              Select Locations ({selectedLocationCount} selected)
            </Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Object.values(MONITORING_LOCATIONS).map((location) => {
                const metadata = LOCATION_METADATA[location];
                const isSelected = config.locations?.includes(location) || false;

                return (
                  <div
                    key={location}
                    className={cn(
                      "flex items-center space-x-3 rounded-lg border p-3 cursor-pointer transition-colors",
                      isSelected
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                        : "border-gray-200 hover:border-gray-300",
                      disabled && "opacity-50 cursor-not-allowed"
                    )}
                    onClick={() => !disabled && handleLocationToggle(location)}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => !disabled && handleLocationToggle(location)}
                      disabled={disabled}
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        {metadata.flag && <span className="text-lg">{metadata.flag}</span>}
                        <span className="font-medium">{metadata.name}</span>
                      </div>
                      <div className="text-xs text-gray-500 flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {metadata.region}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Aggregation Strategy */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Aggregation Strategy</Label>
            <Select
              value={config.strategy || "custom"}
              onValueChange={(value) =>
                handleStrategyChange(value as "all" | "majority" | "any" | "custom")
              }
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  All Locations Up - Status is UP only if all locations are up
                </SelectItem>
                <SelectItem value="majority">
                  Majority Up - Status is UP if more than 50% are up
                </SelectItem>
                <SelectItem value="any">
                  Any Location Up - Status is UP if at least one location is up
                </SelectItem>
                <SelectItem value="custom">
                  Custom Threshold - Set a custom percentage
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Threshold Slider (shown for custom strategy) */}
          {config.strategy === "custom" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Success Threshold</Label>
                <span className="text-sm text-gray-600 font-medium">
                  {config.threshold}%
                </span>
              </div>
              <Slider
                value={[config.threshold]}
                onValueChange={handleThresholdChange}
                min={1}
                max={100}
                step={1}
                disabled={disabled}
                className="w-full"
              />
              <p className="text-xs text-gray-500">
                Monitor status will be "UP" when at least {upRequired} of{" "}
                {selectedLocationCount} location{selectedLocationCount !== 1 ? "s" : ""}{" "}
                report UP status
              </p>
            </div>
          )}

          {/* Summary */}
          <div className="rounded-lg bg-gray-50 dark:bg-gray-900 p-4 space-y-2">
            <h4 className="text-sm font-medium">Configuration Summary</h4>
            <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
              <li>
                • Monitoring from <strong>{selectedLocationCount}</strong> location
                {selectedLocationCount !== 1 ? "s" : ""}
              </li>
              <li>
                • Status "UP" requires{" "}
                <strong>
                  {upRequired}/{selectedLocationCount}
                </strong>{" "}
                locations reporting UP
              </li>
              <li>
                • Each location check runs independently in parallel
              </li>
            </ul>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// Helper function for cn utility (if not already in your utils)
function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
