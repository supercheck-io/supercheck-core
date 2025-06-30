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
    isUp?: boolean;
    status?: string;
}

interface ResponseTimeBarChartProps {
    data: ResponseTimeChartDataPoint[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const displayDate = data.fullDate || label;
    const isUp = data.isUp !== undefined ? data.isUp : true;
    const responseTime = payload[0].value;
    
    return (
      <div className="bg-background border rounded-lg p-3 shadow-lg text-sm min-w-[160px]">
        <p className="font-medium mb-2 text-center">{displayDate}</p>
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Status:</span>
            <div className="flex items-center">
              <div className={`w-2 h-2 rounded-full mr-2 ${isUp ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className={`font-medium ${isUp ? 'text-green-600' : 'text-red-600'}`}>
                {isUp ? 'Up' : 'Down'}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Response:</span>
            <span className="font-medium">{responseTime > 0 ? `${responseTime} ms` : 'N/A'}</span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

export function ResponseTimeBarChart({ data }: ResponseTimeBarChartProps) {
  console.log('[ResponseTimeBarChart] Rendering with data:', data);
  console.log('[ResponseTimeBarChart] Data length:', data?.length);

  if (!data || data.length === 0) {
    console.log('[ResponseTimeBarChart] No data available');
    return (
        <Card className="h-full flex flex-col min-h-[400px]">
            <CardHeader className="pb-4">
                <CardTitle className="text-2xl">Response Time</CardTitle>
                <CardDescription>Performance metrics will appear here once monitoring begins.</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-center flex-1 min-h-[300px]">
                <div className="text-center space-y-3">
                    <div className="w-16 h-16 mx-auto rounded-full bg-muted flex items-center justify-center">
                        <svg className="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                    </div>
                    <div>
                        <p className="text-muted-foreground font-medium">No Response Data</p>
                        <p className="text-sm text-muted-foreground mt-1">Response time data will be displayed here after the first successful check.</p>
                    </div>
                </div>
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
  const values = sortedData.map(d => d.time).filter(t => t > 0);
  if (values.length === 0) {
    // If no valid response times, show a flat line at 0
    return (
      <Card className="h-full flex flex-col min-h-[400px]">
        <CardHeader className="pb-3">
          <CardTitle className="text-2xl">Response Time</CardTitle>
          <CardDescription className="text-sm">No successful responses recorded</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center flex-1 min-h-[280px]">
            <div className="text-center space-y-3">
                <div className="w-16 h-16 mx-auto rounded-full bg-muted flex items-center justify-center">
                    <svg className="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.732 12.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                </div>
                <div>
                    <p className="text-muted-foreground font-medium">All Requests Failed</p>
                    <p className="text-sm text-muted-foreground mt-1">No successful responses were recorded during monitoring attempts.</p>
                </div>
            </div>
        </CardContent>
      </Card>
    );
  }

  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const padding = Math.max(10, (maxValue - minValue) * 0.1);
  const yAxisDomain = [
    Math.max(0, minValue - padding),
    maxValue + padding
  ];

  return (
    <Card className="h-full flex flex-col shadow-sm min-h-[400px]">
      <CardHeader className="pb-3">
        <CardTitle className="text-xl">Response Time</CardTitle>
        <CardDescription className="text-sm">
          Recent response times in milliseconds ({data.length} data points)
        </CardDescription>
      </CardHeader>
      <CardContent className="pl-1 pr-2 pb-3 flex-1">
        <ChartContainer
          config={chartConfig}
          className="h-full w-full"
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={sortedData}
              margin={{
                left: -1,
                right: 12,
                top: 12,
                bottom: 8
              }}
            >
              <defs>
                <linearGradient id="responseTimeGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1e90ff" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#1e90ff" stopOpacity={0.05}/>
                </linearGradient>
              </defs>
              <CartesianGrid 
                strokeDasharray="2 2"
                stroke="#e5e7eb"
                opacity={0.4}
                vertical={false}
              />
              <XAxis
                dataKey="name"
                tickLine={false}
                axisLine={true}
                tickMargin={8}
                minTickGap={30}
                fontSize={10}
                tick={{ fontSize: 10, fill: "#6b7280" }} 
                interval="preserveStartEnd"
                stroke="#d1d5db"
              />
              <YAxis 
                tickLine={false} 
                axisLine={true} 
                tickMargin={8}
                fontSize={10}
                tick={{ fontSize: 10, fill: "#6b7280" }} 
                domain={yAxisDomain}
                tickFormatter={(value) => `${Math.round(value)}ms`}
                stroke="#d1d5db"
              />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ 
                  stroke: "hsl(var(--primary))", 
                  strokeWidth: 1, 
                  opacity: 0.3,
                  strokeDasharray: "3 3"
                }}
              />
              <Line 
                type="monotone"
                dataKey="time" 
                stroke="#1e90ff" 
                strokeWidth={2.5}
                dot={false}
                activeDot={{ 
                  r: 5, 
                  stroke: "#1e90ff",
                  strokeWidth: 2,
                  fill: "#ffffff",
                  className: "drop-shadow-md filter"
                }}
                connectNulls={false}
                fill="url(#responseTimeGradient)"
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  )
} 