"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ChartContainer } from "@/components/ui/chart";

interface AvailabilityDataPoint {
  timestamp: number;
  status: 0 | 1; // 0 for down, 1 for up
  label?: string;
}

interface AvailabilityBarChartProps {
  data: AvailabilityDataPoint[];
  monitorType?: string;
}

const chartConfig = {
  up: {
    label: "Up",
    color: "#22c55e", // Explicit green color (Tailwind's green-500)
  },
  down: {
    label: "Down",
    color: "#ef4444", // Explicit red color (Tailwind's red-500)
  },
};

export function AvailabilityBarChart({ data, monitorType }: AvailabilityBarChartProps) {
  // console.log("[AvailabilityBarChart] Received data:", JSON.stringify(data, null, 2)); // Keep for now if user still has issues

  const getEmptyMessage = () => {
    if (monitorType === "heartbeat") {
      return "No heartbeat events to display - waiting for pings.";
    } else {
      return "No availability data to display.";
    }
  };

  if (!data || data.length === 0) {
    // console.log("[AvailabilityBarChart] No data or empty data array."); // Keep for now
    return (
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl">Availability Overview</CardTitle>
          <CardDescription>Availability status for monitor checks.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-[120px]">
          <p className="text-muted-foreground">{getEmptyMessage()}</p>
        </CardContent>
      </Card>
    );
  }

  const processedData = data.map((item, index) => ({
    name: `Run ${index + 1}`, 
    status: item.status === 1 ? "up" : "down",
    fill: item.status === 1 ? chartConfig.up.color : chartConfig.down.color,
    hoverFill: item.status === 1 ? "#16a34a" : "#dc2626", // Darker colors for hover
    value: 1, // All bars will have the same height conceptually
  }));

  // console.log("[AvailabilityBarChart] Processed data:", JSON.stringify(processedData, null, 2)); // Keep for now

  const upCount = data.filter(d => d.status === 1).length;
  const uptimePercentage = data.length > 0 ? ((upCount / data.length) * 100).toFixed(1) : '0.0';

  // Different descriptions based on monitor type
  const getDescription = () => {
    if (monitorType === "heartbeat") {
      return `Heartbeat events (${data.length} pings/failures) - ${uptimePercentage}% success rate`;
    } else {
      return `Status of individual checks (${data.length} data points) - ${uptimePercentage}% uptime`;
    }
  };

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-xl">Availability Overview</CardTitle>
        <CardDescription>
          {getDescription()}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-1 pt-0 h-[120px]"> {/* Adjusted height, remove padding top from content if header has enough */}
        <ChartContainer config={chartConfig} className="w-full h-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={processedData}
              margin={{
                top: 10, // Add some top margin for space from header
                right: 10,
                left: 10,
                bottom: 5,
              }}
              barSize={Math.max(8, Math.min(20, Math.floor(800 / data.length)))} // Dynamic bar size based on data count
              barCategoryGap="2%" // Tighter spacing for better density
            >
              <CartesianGrid vertical={false} horizontal={false} strokeDasharray="3 3" /> {/* Grid lines are already hidden */}
              <XAxis dataKey="name" type="category" hide /> 
              <YAxis type="number" hide /> {/* Y-axis still hidden as values are constant for height */}
              <Tooltip
                cursor={{ 
                  fill: "rgba(255, 255, 0, 0.1)", // Blue overlay
                  stroke: "rgba(255, 255, 0, 1)", // Blue border
                  strokeWidth: 2,
                  strokeDasharray: "none"
                }}
                offset={10}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const point = payload[0].payload;
                    const originalDataItemIndex = processedData.findIndex(p => p.name === point.name);
                    const originalDataItem = data[originalDataItemIndex];
                    const date = originalDataItem ? new Date(originalDataItem.timestamp) : null;
                    const formattedTime = date ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit'}) : point.name;
                    const formattedDate = date ? date.toLocaleDateString([], { month: 'short', day: 'numeric' }) : '';

                    return (
                      <div className="bg-background border rounded-lg p-3 shadow-lg text-sm min-w-[140px] z-50">
                        <p className="font-medium mb-2 text-center">{formattedDate} {formattedTime}</p>
                        <div className="flex items-center justify-center">
                          <div className={`w-3 h-3 rounded-full mr-2`} style={{ backgroundColor: point.fill }}></div>
                          <span className="font-medium">{point.status === "up" ? "Up" : "Down"}</span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar 
                dataKey="value" 
                radius={1}
                onMouseEnter={() => {
                  // This will be handled by the cursor prop in Tooltip
                }}
              > 
                {processedData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.fill}
                    style={{ 
                      transition: 'all 0.2s ease'
                    }}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  );
} 