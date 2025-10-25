import { MONITORING_LOCATIONS } from "@/db/schema/schema";
import type {
  MonitoringLocation,
  LocationMetadata,
  LocationConfig,
} from "@/db/schema/schema";

// Re-export key pieces for UI usage
export { MONITORING_LOCATIONS };
export type { MonitoringLocation, LocationConfig };

/**
 * Location metadata for all available monitoring locations.
 * Includes display names, regions, and geographic coordinates.
 */
export const LOCATION_METADATA: Record<MonitoringLocation, LocationMetadata> = {
  [MONITORING_LOCATIONS.US_EAST]: {
    code: MONITORING_LOCATIONS.US_EAST,
    name: "US East",
    region: "N. Virginia",
    coordinates: { lat: 38.9072, lon: -77.0369 },
    flag: "🇺🇸",
  },
  [MONITORING_LOCATIONS.EU_CENTRAL]: {
    code: MONITORING_LOCATIONS.EU_CENTRAL,
    name: "EU Central",
    region: "Frankfurt",
    coordinates: { lat: 50.1109, lon: 8.6821 },
    flag: "🇪🇺",
  },
  [MONITORING_LOCATIONS.ASIA_PACIFIC]: {
    code: MONITORING_LOCATIONS.ASIA_PACIFIC,
    name: "Asia Pacific",
    region: "Singapore",
    coordinates: { lat: 1.3521, lon: 103.8198 },
    flag: "🇸🇬",
  },
};


const ALL_MONITORING_LOCATIONS = Object.values(
  MONITORING_LOCATIONS
) as MonitoringLocation[];

/**
 * Default location configuration for new monitors.
 */
export const DEFAULT_LOCATION_CONFIG: LocationConfig = {
  enabled: false,
  locations: [MONITORING_LOCATIONS.US_EAST],
  threshold: 50, // Majority must be up
  strategy: "majority",
};

/**
 * Get all available monitoring locations.
 */
export function getAllLocations(): LocationMetadata[] {
  return Object.values(LOCATION_METADATA);
}

/**
 * Get metadata for a specific location.
 */
export function getLocationMetadata(
  location: MonitoringLocation
): LocationMetadata | undefined {
  return LOCATION_METADATA[location];
}

/**
 * Get display name for a location.
 */
export function getLocationDisplayName(location: MonitoringLocation): string {
  return LOCATION_METADATA[location]?.name || location;
}

export function isMonitoringLocation(
  value: unknown
): value is MonitoringLocation {
  if (typeof value !== "string") {
    return false;
  }
  return ALL_MONITORING_LOCATIONS.includes(value as MonitoringLocation);
}

/**
 * Validate location configuration.
 */
export function validateLocationConfig(
  config: Partial<LocationConfig>
): { valid: boolean; error?: string } {
  if (!config) {
    return { valid: false, error: "Location config is required" };
  }

  if (config.enabled && (!config.locations || config.locations.length === 0)) {
    return {
      valid: false,
      error: "At least one location must be selected when enabled",
    };
  }

  if (config.locations) {
    for (const location of config.locations) {
      if (!LOCATION_METADATA[location]) {
        return { valid: false, error: `Invalid location: ${location}` };
      }
    }
  }

  if (
    config.threshold !== undefined &&
    (config.threshold < 0 || config.threshold > 100)
  ) {
    return {
      valid: false,
      error: "Threshold must be between 0 and 100",
    };
  }

  return { valid: true };
}

/**
 * Calculate the overall status based on location results and threshold.
 */
export function calculateAggregatedStatus(
  locationStatuses: Record<MonitoringLocation, boolean>,
  config: LocationConfig
): "up" | "down" | "partial" {
  const locations = config.locations || [];
  if (locations.length === 0) {
    return "down";
  }

  const upCount = locations.filter(
    (loc) => locationStatuses[loc] === true
  ).length;
  const totalCount = locations.length;
  const upPercentage = (upCount / totalCount) * 100;

  // Apply strategy
  switch (config.strategy) {
    case "all":
      return upCount === totalCount ? "up" : "down";
    case "any":
      return upCount > 0 ? "up" : "down";
    case "majority":
      return upPercentage >= 50 ? "up" : "down";
    case "custom":
    default:
      if (upPercentage >= config.threshold) {
        return "up";
      } else if (upCount > 0) {
        return "partial";
      } else {
        return "down";
      }
  }
}

/**
 * Get the effective locations for a monitor (handles legacy and multi-location configs).
 */
export function getEffectiveLocations(
  config?: LocationConfig | null
): MonitoringLocation[] {
  if (!config || !config.enabled) {
    // Single location mode - use default primary location
    return [MONITORING_LOCATIONS.US_EAST];
  }

  return config.locations || [MONITORING_LOCATIONS.US_EAST];
}

/**
 * Format location status for display.
 */
export function formatLocationStatus(
  isUp: boolean,
  responseTimeMs?: number | null
): string {
  if (!isUp) {
    return "Down";
  }

  if (responseTimeMs !== null && responseTimeMs !== undefined) {
    return `${responseTimeMs}ms`;
  }

  return "Up";
}

/**
 * Get location health percentage based on recent results.
 */
export function calculateLocationHealth(
  totalChecks: number,
  upChecks: number
): number {
  if (totalChecks === 0) return 0;
  return Math.round((upChecks / totalChecks) * 100);
}

/**
 * Determine the color class for a location based on its health.
 */
export function getLocationHealthColor(healthPercentage: number): string {
  if (healthPercentage >= 99) return "text-green-600 bg-green-100";
  if (healthPercentage >= 95) return "text-green-600 bg-green-50";
  if (healthPercentage >= 90) return "text-yellow-600 bg-yellow-100";
  if (healthPercentage >= 80) return "text-orange-600 bg-orange-100";
  return "text-red-600 bg-red-100";
}
