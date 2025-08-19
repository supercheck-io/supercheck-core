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

interface ProcessedDataPoint extends ResponseTimeChartDataPoint {
    originalTime: number;
    isFailed: boolean;
}

interface ResponseTimeBarChartProps {
    data: ResponseTimeChartDataPoint[];
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{
    value: number;
    payload: ProcessedDataPoint;
  }>;
  label?: string;
}

const CustomTooltip = ({ active, payload, label }: TooltipProps) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const displayDate = data.fullDate || label;
    const isFailed = data.isFailed || false;
    const originalTime = data.originalTime || data.time; // Original time before processing
    
    return (
      <div className="bg-background border rounded-lg p-3 shadow-lg text-sm min-w-[160px]">
        <p className="font-medium mb-2 text-center">{displayDate}</p>
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Status:</span>
            <div className="flex items-center">
              <div className={`w-2 h-2 rounded-full mr-2 ${!isFailed ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className={`font-medium ${!isFailed ? 'text-green-600' : 'text-red-600'}`}>
                {!isFailed ? 'Up' : 'Down'}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Response:</span>
            <span className="font-medium">
              {originalTime > 0 ? `${originalTime} ms` : 'N/A'}
            </span>
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
  
  const [visiblePoints, setVisiblePoints] = React.useState(0);

  // Input validation
  const validatedData = React.useMemo(() => {
    if (!Array.isArray(data)) {
      console.warn('[ResponseTimeBarChart] Invalid data: not an array');
      return [];
    }
    
    return data.filter(point => {
      // Validate each data point
      if (!point || typeof point !== 'object') {
        console.warn('[ResponseTimeBarChart] Invalid data point:', point);
        return false;
      }
      
      if (typeof point.name !== 'string' || !point.name.trim()) {
        console.warn('[ResponseTimeBarChart] Invalid name in data point:', point);
        return false;
      }
      
      if (typeof point.time !== 'number' || point.time < 0) {
        console.warn('[ResponseTimeBarChart] Invalid time in data point:', point);
        return false;
      }
      
      return true;
    });
  }, [data]);

  // Data is already sorted by validatedData

  // Only show data points up to the current visible point for animation
  const animatedData = React.useMemo(() => {
    return validatedData.slice(0, visiblePoints);
  }, [validatedData, visiblePoints]);

  // Process data to show failed checks - preserve actual response times
  const processedData: ProcessedDataPoint[] = React.useMemo(() => {
    const processed = animatedData.map(point => {
      // A check is considered failed if:
      // 1. isUp is explicitly false, OR
      // 2. status indicates failure (down, error, timeout, etc.)
      const isFailed = point.isUp === false || 
                      point.status === 'down' || 
                      point.status === 'error' ||
                      point.status === 'timeout';
      
      return {
        ...point,
        originalTime: point.time, // Preserve original time for tooltip
        time: Math.max(0, point.time), // Keep actual response time, just ensure non-negative
        isFailed
      };
    });
    
    const failedCount = processed.filter(p => p.isFailed).length;
    console.log('[ResponseTimeBarChart] Processed data:', processed);
    console.log('[ResponseTimeBarChart] Failed checks:', failedCount);
    console.log('[ResponseTimeBarChart] Response times preserved for failed checks');
    
    return processed;
  }, [animatedData]);

  React.useEffect(() => {
    if (!data || data.length === 0) return;
    
    let currentPoint = 0;
    const interval = setInterval(() => {
      currentPoint++;
      setVisiblePoints(currentPoint);
      
      if (currentPoint >= data.length) {
        clearInterval(interval);
      }
    }, 10); // 10ms delay between each point for smooth line drawing

    return () => clearInterval(interval);
  }, [data]);

  if (!validatedData || validatedData.length === 0) {
    console.log('[ResponseTimeBarChart] No valid data available');
    return (
        <Card className="h-full flex flex-col min-h-[320px]">
            <CardHeader className="pb-4">
                <CardTitle className="text-lg">Response Time</CardTitle>
                <CardDescription>Performance metrics will appear here once monitoring begins.</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-center flex-1 min-h-[220px]">
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

  // Get all response times for Y-axis domain calculation (including failed checks)
  const allResponseTimes = processedData
    .map(d => d.time)
    .filter(time => time >= 0); // Only filter out negative values, keep 0ms responses
  
  if (allResponseTimes.length === 0) {
    // If no valid response times at all
    return (
      <Card className="h-full flex flex-col h-[415px]">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Response Time</CardTitle>
          <CardDescription className="text-sm">No response data available</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center flex-1 min-h-[200px]">
            <div className="text-center space-y-3">
                <div className="w-16 h-16 mx-auto rounded-full bg-muted flex items-center justify-center">
                    <svg className="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.732 12.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                </div>
                <div>
                    <p className="text-muted-foreground font-medium">No Response Data</p>
                    <p className="text-sm text-muted-foreground mt-1">No response time data available.</p>
                </div>
            </div>
        </CardContent>
      </Card>
    );
  }

  const minValue = Math.min(...allResponseTimes);
  const maxValue = Math.max(...allResponseTimes);
  const padding = Math.max(10, (maxValue - minValue) * 0.1);
  
  // Only start from 0 if there are actual 0ms responses or if min is very close to 0
  const yAxisMin = minValue === 0 || minValue < 20 ? 0 : Math.max(0, minValue - padding);
  const yAxisDomain = [yAxisMin, maxValue + padding];

  return (
    <Card className="h-full flex flex-col shadow-sm min-h-[335px]">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold">Response Time</CardTitle>
        <CardDescription className="text-sm">
          Recent response times in milliseconds ({data.length} data points)
        </CardDescription>
      </CardHeader>
      <CardContent className="p-3 pl-0 pr-8 flex-1">
        <ChartContainer
          config={chartConfig}
          className="w-full h-[300px]"
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={processedData}
              margin={{
                left: 5,
                right: 5,
                top: 5,
                bottom: 5
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
                dot={(props: { cx?: number; cy?: number; payload?: { name: string; isFailed: boolean }; index?: number }) => {
                  const { cx, cy, payload, index } = props;
                  
                  // Validate required props
                  if (typeof cx !== 'number' || typeof cy !== 'number' || !payload) {
                    return <circle key={`dot-empty-${index || 0}`} cx={0} cy={0} r={0} fill="transparent" />;
                  }
                  
                  // Show red dot for failed checks at their actual response time
                  if (payload.isFailed) {
                    return (
                      <circle 
                        key={`dot-failed-${payload.name}-${index || 0}`}
                        cx={cx} 
                        cy={cy} 
                        r={4} 
                        fill="#ef4444" 
                        stroke="#ffffff" 
                        strokeWidth={2}
                        className="drop-shadow-sm filter"
                      />
                    );
                  }
                  
                  // Show green dot for successful checks
                  return (
                    <circle 
                      key={`dot-success-${payload.name}-${index || 0}`}
                      cx={cx} 
                      cy={cy} 
                      r={4} 
                      fill="#22c55e" 
                      stroke="#ffffff" 
                      strokeWidth={2}
                      className="drop-shadow-sm filter"
                    />
                  );
                }}
                activeDot={(props: { cx?: number; cy?: number; payload?: { name: string; isFailed: boolean }; index?: number }) => {
                  const { cx, cy, payload, index } = props;
                  if (typeof cx !== 'number' || typeof cy !== 'number') {
                    return <circle key={`active-dot-empty-${index || 0}`} cx={0} cy={0} r={0} fill="transparent" />;
                  }
                  
                  const color = payload?.isFailed ? "#ef4444" : "#1e90ff";
                  return (
                    <circle
                      key={`active-dot-${payload?.name || 'unknown'}-${index || 0}`}
                      cx={cx}
                      cy={cy}
                      r={5}
                      stroke={color}
                      strokeWidth={2}
                      fill="#ffffff"
                      className="drop-shadow-md filter"
                    />
                  );
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