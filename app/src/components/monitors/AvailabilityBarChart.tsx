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

export function AvailabilityBarChart({ data }: AvailabilityBarChartProps) {
  // console.log("[AvailabilityBarChart] Received data:", JSON.stringify(data, null, 2)); // Keep for now if user still has issues

  if (!data || data.length === 0) {
    // console.log("[AvailabilityBarChart] No data or empty data array."); // Keep for now
    return (
      <Card>
        <CardHeader>
          <CardTitle>Availability Overview</CardTitle>
          <CardDescription>Status of individual checks (each bar is one check run).</CardDescription>
        </CardHeader>
                    <CardContent className="flex items-center justify-center h-[100px]">
          <p className="text-muted-foreground">No availability data to display.</p>
        </CardContent>
      </Card>
    );
  }

  const processedData = data.map((item, index) => ({
    name: `Run ${index + 1}`, 
    status: item.status === 1 ? "up" : "down",
    fill: item.status === 1 ? chartConfig.up.color : chartConfig.down.color, 
    value: 1, // All bars will have the same height conceptually
  }));

  // console.log("[AvailabilityBarChart] Processed data:", JSON.stringify(processedData, null, 2)); // Keep for now

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Availability Overview</CardTitle>
        <CardDescription>Status of individual checks (each bar is one check run).</CardDescription>
      </CardHeader>
      <CardContent className="p-1 pt-0 h-[100px]"> {/* Adjusted height, remove padding top from content if header has enough */}
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
              barSize={15} // Increase bar width significantly
              barCategoryGap="5%" // Decrease gap between bars for a denser look
            >
              <CartesianGrid vertical={false} horizontal={false} strokeDasharray="3 3" /> {/* Grid lines are already hidden */}
              <XAxis dataKey="name" type="category" hide /> 
              <YAxis type="number" hide /> {/* Y-axis still hidden as values are constant for height */}
              <Tooltip
                cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.1 }}
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
                      <div className="bg-background border rounded-md p-2 shadow-lg text-xs min-w-[120px]">
                        <p className="font-medium mb-1 text-center">{formattedDate} {formattedTime}</p>
                        <div className="flex items-center justify-center">
                          <div className={`w-2 h-2 rounded-full mr-1.5`} style={{ backgroundColor: point.fill }}></div>
                          <span>{point.status === "up" ? "Up" : "Down"}</span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="value" radius={0}> {/* No radius for sharp-edged bars */}
                {processedData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  );
} 