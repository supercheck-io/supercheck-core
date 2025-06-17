"use client"

import * as React from "react"
import { Line, LineChart, CartesianGrid, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartConfig,
  ChartContainer,
} from "@/components/ui/chart"

const chartConfig = {
  time: {
    label: "Response Time (ms)",
    color: "#1e90ff",
  },
} satisfies ChartConfig

interface ResponseTimeChartDataPoint {
    name: string;
    time: number;
    fullDate?: string;
}

interface ResponseTimeBarChartProps {
    data: ResponseTimeChartDataPoint[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const displayDate = data.fullDate || label;
    return (
      <div className="bg-background border rounded-md p-2 shadow-sm text-xs">
        <p className="font-medium mb-1">{displayDate}</p>
        <div className="flex items-center">
          <div className="w-2 h-2 bg-primary rounded-full mr-1.5"></div>
          <span className="font-medium">{payload[0].value} ms</span>
        </div>
      </div>
    );
  }
  return null;
};

export function ResponseTimeBarChart({ data }: ResponseTimeBarChartProps) {
  console.log('[ResponseTimeBarChart] Rendering with data:', data);
  console.log('[ResponseTimeBarChart] Data length:', data?.length);
  console.log('[ResponseTimeBarChart] First few items:', data?.slice(0, 3));

  if (!data || data.length === 0) {
    console.log('[ResponseTimeBarChart] No data available');
    return (
        <Card className="h-full flex flex-col">
            <CardHeader className="pb-4">
                <CardTitle>Response Time</CardTitle>
                <CardDescription>No response time data available to display.</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-center flex-1 min-h-[280px]">
                <p className="text-muted-foreground">No data</p>
            </CardContent>
        </Card>
    );
  }

  // Sort data by time to ensure latest data is properly ordered
  const sortedData = [...data].sort((a, b) => {
    // Extract time from name (assuming format like "HH:mm")
    const timeA = a.name;
    const timeB = b.name;
    return timeA.localeCompare(timeB);
  });

  // Get the Y-axis domain with some padding
  const values = sortedData.map(d => d.time);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const padding = (maxValue - minValue) * 0.1;
  const yAxisDomain = [
    Math.max(0, minValue - padding),
    maxValue + padding
  ];

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-2xl">Response Time</CardTitle>
        <CardDescription className="text-sm">Recent response times in milliseconds</CardDescription>
      </CardHeader>
      <CardContent className="px-2 pb-3 flex-1">
        <ChartContainer
          config={chartConfig}
          className="h-full w-full min-h-[280px]"
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={sortedData}
              margin={{
                left: 4,
                right: 12,
                top: 8,
                bottom: 8
              }}
            >
              <CartesianGrid 
                strokeDasharray="2 2"
                stroke="#e5e7eb"
                opacity={0.3}
                vertical={false}
              />
              <XAxis
                dataKey="name"
                tickLine={false}
                axisLine={true}
                tickMargin={6}
                minTickGap={40}
                fontSize={9}
                tick={{ fontSize: 9, fill: "#6b7280" }} 
                interval="preserveStartEnd"
              />
              <YAxis 
                tickLine={false} 
                axisLine={true} 
                tickMargin={6}
                fontSize={9}
                tick={{ fontSize: 9, fill: "#6b7280" }} 
                domain={yAxisDomain}
                tickFormatter={(value) => `${Math.round(value)}`}
              />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ stroke: "hsl(var(--primary))", strokeWidth: 1, opacity: 0.5 }}
              />
              <Line 
                type="linear"
                dataKey="time" 
                stroke="#1e90ff" 
                strokeWidth={2}
                dot={{ 
                  fill: "#1e90ff", 
                  stroke: "#1e90ff", 
                  strokeWidth: 1, 
                  r: 2.5,
                  className: "drop-shadow-sm"
                }}
                activeDot={{ 
                  r: 4, 
                  stroke: "#1e90ff",
                  strokeWidth: 2,
                  fill: "#1e90ff",
                  className: "drop-shadow-md"
                }}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  )
} 