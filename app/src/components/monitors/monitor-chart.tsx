"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, XAxis, ResponsiveContainer, Tooltip } from "recharts";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface MonitorChartProps {
  monitorId?: string;
  uptime?: number;
  responseTime?: number;
}

// Generate some sample monitoring data (in a real app, this would come from the API)
const generateChartData = (days = 14) => {
  const data = [];
  const now = new Date();
  let successRate = 92; // Starting success rate
  let responseTime = 342; // Starting response time
  
  for (let i = days; i >= 0; i--) {
    const date = new Date();
    date.setDate(now.getDate() - i);
    
    // Create some natural variation in the data
    const randomChange = Math.random() * 10 - 5; // -5 to +5
    successRate = Math.min(100, Math.max(70, successRate + randomChange));
    
    // Create some variation in response time (300-400ms)
    responseTime = Math.max(300, Math.min(400, responseTime + (Math.random() * 40 - 20)));
    
    // Calculate passed and failed values
    const passed = Math.round(successRate);
    const failed = 100 - passed;
    
    data.push({
      date: date.toISOString().split('T')[0],
      passed,
      failed,
      responseTime: Math.round(responseTime)
    });
  }
  
  return data;
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const date = new Date(label);
    const formattedDate = date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric"
    });
    
    return (
      <div className="bg-background border rounded-md p-2 shadow-sm text-xs">
        <p className="font-medium mb-1">{formattedDate}</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          <div className="flex items-center">
            <div className="w-2 h-2 bg-green-500 rounded-full mr-1"></div>
            <span className="text-muted-foreground">Passed:</span>
          </div>
          <span>{payload[0].value}%</span>
          
          <div className="flex items-center">
            <div className="w-2 h-2 bg-red-500 rounded-full mr-1"></div>
            <span className="text-muted-foreground">Failed:</span>
          </div>
          <span>{payload[1]?.value || 0}%</span>
          
          <div className="flex items-center">
            <div className="w-2 h-2 bg-blue-500 rounded-full mr-1"></div>
            <span className="text-muted-foreground">Response:</span>
          </div>
          <span>{payload[2]?.value || 0} ms</span>
        </div>
      </div>
    );
  }

  return null;
};

export function MonitorChart({ monitorId, uptime = 99, responseTime }: MonitorChartProps) {
  // In a real app, we would fetch data based on monitorId
  const chartData = React.useMemo(() => generateChartData(), []);
  const [activeTab, setActiveTab] = React.useState<"uptime" | "response">("uptime");

  return (
    <Card>
      <CardHeader className="pb-0 pt-4 px-4">
        <div className="flex justify-between items-center">
          <CardTitle className="text-sm font-medium">Performance History</CardTitle>
          <div className="flex text-xs">
            <button
              className={`px-3 py-1.5 rounded-t-md transition-colors ${
                activeTab === "uptime" 
                  ? "bg-background border border-b-0 font-medium" 
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setActiveTab("uptime")}
            >
              Uptime
            </button>
            <button
              className={`px-3 py-1.5 rounded-t-md transition-colors ${
                activeTab === "response" 
                  ? "bg-background border border-b-0 font-medium" 
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setActiveTab("response")}
            >
              Response Time
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        <div className="h-[240px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            {activeTab === "uptime" ? (
              <BarChart
                data={chartData}
                margin={{ top: 20, right: 20, left: 20, bottom: 20 }}
                barGap={0}
                barCategoryGap={4}
              >
                <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.2} />
                <XAxis 
                  dataKey="date" 
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => {
                    const date = new Date(value);
                    return date.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    });
                  }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar 
                  dataKey="passed" 
                  stackId="status" 
                  fill="rgba(34, 197, 94, 0.8)" 
                  radius={[4, 4, 0, 0]} 
                />
                <Bar 
                  dataKey="failed" 
                  stackId="status" 
                  fill="rgba(239, 68, 68, 0.8)" 
                  radius={[4, 4, 0, 0]} 
                />
              </BarChart>
            ) : (
              <BarChart
                data={chartData}
                margin={{ top: 20, right: 20, left: 20, bottom: 20 }}
              >
                <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.2} />
                <XAxis 
                  dataKey="date" 
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => {
                    const date = new Date(value);
                    return date.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    });
                  }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar 
                  dataKey="responseTime" 
                  fill="rgba(59, 130, 246, 0.8)" 
                  radius={[4, 4, 0, 0]} 
                />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
} 