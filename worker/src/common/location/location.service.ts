import { Injectable, Logger } from '@nestjs/common';

/**
 * Available monitoring locations for multi-location monitoring.
 */
export const MONITORING_LOCATIONS = {
  US_EAST: 'us-east',
  US_WEST: 'us-west',
  EU_WEST: 'eu-west',
  EU_CENTRAL: 'eu-central',
  ASIA_PACIFIC: 'asia-pacific',
  SOUTH_AMERICA: 'south-america',
} as const;

export type MonitoringLocation =
  (typeof MONITORING_LOCATIONS)[keyof typeof MONITORING_LOCATIONS];

/**
 * Location metadata including display name and geographic information.
 */
export type LocationMetadata = {
  code: MonitoringLocation;
  name: string;
  region: string;
  coordinates?: { lat: number; lon: number };
};

/**
 * Configuration for multi-location monitoring.
 */
export type LocationConfig = {
  enabled: boolean;
  locations: MonitoringLocation[];
  threshold: number;
  strategy?: 'all' | 'majority' | 'any' | 'custom';
};

@Injectable()
export class LocationService {
  private readonly logger = new Logger(LocationService.name);

  /**
   * Location metadata for all available monitoring locations.
   */
  private readonly locationMetadata: Record<
    MonitoringLocation,
    LocationMetadata
  > = {
    [MONITORING_LOCATIONS.US_EAST]: {
      code: MONITORING_LOCATIONS.US_EAST,
      name: 'US East',
      region: 'N. Virginia',
      coordinates: { lat: 38.9072, lon: -77.0369 },
    },
    [MONITORING_LOCATIONS.US_WEST]: {
      code: MONITORING_LOCATIONS.US_WEST,
      name: 'US West',
      region: 'Oregon',
      coordinates: { lat: 45.5231, lon: -122.6765 },
    },
    [MONITORING_LOCATIONS.EU_WEST]: {
      code: MONITORING_LOCATIONS.EU_WEST,
      name: 'EU West',
      region: 'Ireland',
      coordinates: { lat: 53.3498, lon: -6.2603 },
    },
    [MONITORING_LOCATIONS.EU_CENTRAL]: {
      code: MONITORING_LOCATIONS.EU_CENTRAL,
      name: 'EU Central',
      region: 'Frankfurt',
      coordinates: { lat: 50.1109, lon: 8.6821 },
    },
    [MONITORING_LOCATIONS.ASIA_PACIFIC]: {
      code: MONITORING_LOCATIONS.ASIA_PACIFIC,
      name: 'Asia Pacific',
      region: 'Singapore',
      coordinates: { lat: 1.3521, lon: 103.8198 },
    },
    [MONITORING_LOCATIONS.SOUTH_AMERICA]: {
      code: MONITORING_LOCATIONS.SOUTH_AMERICA,
      name: 'South America',
      region: 'São Paulo',
      coordinates: { lat: -23.5505, lon: -46.6333 },
    },
  };

  /**
   * Get all available monitoring locations.
   */
  getAllLocations(): LocationMetadata[] {
    return Object.values(this.locationMetadata);
  }

  /**
   * Get metadata for a specific location.
   */
  getLocationMetadata(
    location: MonitoringLocation,
  ): LocationMetadata | undefined {
    return this.locationMetadata[location];
  }

  /**
   * Get display name for a location.
   */
  getLocationDisplayName(location: MonitoringLocation): string {
    return this.locationMetadata[location]?.name || location;
  }

  /**
   * Validate location configuration.
   */
  validateLocationConfig(config: Partial<LocationConfig>): {
    valid: boolean;
    error?: string;
  } {
    if (!config) {
      return { valid: false, error: 'Location config is required' };
    }

    if (
      config.enabled &&
      (!config.locations || config.locations.length === 0)
    ) {
      return {
        valid: false,
        error: 'At least one location must be selected when enabled',
      };
    }

    if (config.locations) {
      for (const location of config.locations) {
        if (!this.locationMetadata[location]) {
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
        error: 'Threshold must be between 0 and 100',
      };
    }

    return { valid: true };
  }

  /**
   * Get the effective locations for a monitor (handles legacy and multi-location configs).
   */
  getEffectiveLocations(config?: LocationConfig | null): MonitoringLocation[] {
    if (!config || !config.enabled) {
      // Single location mode - use default primary location
      return [MONITORING_LOCATIONS.US_EAST];
    }

    return config.locations || [MONITORING_LOCATIONS.US_EAST];
  }

  /**
   * Get simulated delay for a location (for testing without real distributed infrastructure).
   * This adds realistic latency based on geographic distance.
   */
  getSimulatedLocationDelay(location: MonitoringLocation): number {
    // Simulated network delays in milliseconds
    const delays: Record<MonitoringLocation, number> = {
      [MONITORING_LOCATIONS.US_EAST]: 50,
      [MONITORING_LOCATIONS.US_WEST]: 80,
      [MONITORING_LOCATIONS.EU_WEST]: 100,
      [MONITORING_LOCATIONS.EU_CENTRAL]: 90,
      [MONITORING_LOCATIONS.ASIA_PACIFIC]: 150,
      [MONITORING_LOCATIONS.SOUTH_AMERICA]: 120,
    };

    return delays[location] || 50;
  }

  /**
   * Calculate the overall status based on location results and threshold.
   */
  calculateAggregatedStatus(
    locationStatuses: Record<MonitoringLocation, boolean>,
    config: LocationConfig,
  ): 'up' | 'down' | 'partial' {
    const locations = config.locations || [];
    if (locations.length === 0) {
      return 'down';
    }

    const upCount = locations.filter(
      (loc) => locationStatuses[loc] === true,
    ).length;
    const totalCount = locations.length;
    const upPercentage = (upCount / totalCount) * 100;

    this.logger.debug(
      `Aggregating status: ${upCount}/${totalCount} locations up (${upPercentage.toFixed(1)}%), threshold: ${config.threshold}%, strategy: ${config.strategy}`,
    );

    // Apply strategy
    switch (config.strategy) {
      case 'all':
        return upCount === totalCount ? 'up' : 'down';
      case 'any':
        return upCount > 0 ? 'up' : 'down';
      case 'majority':
        return upPercentage >= 50 ? 'up' : 'down';
      case 'custom':
      default:
        if (upPercentage >= config.threshold) {
          return 'up';
        } else if (upCount > 0) {
          return 'partial';
        } else {
          return 'down';
        }
    }
  }
}
