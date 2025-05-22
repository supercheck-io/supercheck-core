"use client";

import * as React from "react";
import { Bar, BarChart } from "recharts";
import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface MonitorStatusIndicatorProps {
  monitorId: string;
  status: string;
  uptime?: number;
}

// Generate sample data with uptime percentage determining the ratio of passes
const generateStatusData = (uptime = 95) => {
  // Create an array of 7 days with status checks
  const data = [];
  
  for (let i = 0; i < 7; i++) {
    const passed = uptime;
    const failed = 100 - passed;
    
    data.push({
      day: i,
      passed,
      failed,
    });
  }
  
  return data;
};

export function MonitorStatusIndicator({ monitorId, status, uptime = 95 }: MonitorStatusIndicatorProps) {
  // Generate random data for demonstration
  const data = React.useMemo(() => generateStatusData(uptime), [uptime]);
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="w-full h-8 flex items-center gap-1">
            <BarChart
              width={100}
              height={24}
              data={data}
              barGap={0}
              barCategoryGap={1}
              margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
            >
              <Bar
                dataKey="passed"
                stackId="status"
                fill="var(--color-passed)"
                radius={0}
              />
              <Bar
                dataKey="failed"
                stackId="status"
                fill="var(--color-failed)"
                radius={0}
              />
            </BarChart>
            <Info className="h-3 w-3 text-muted-foreground" />
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="space-y-1">
            <p className="font-medium">Monitor Health</p>
            <p className="text-xs text-muted-foreground">
              {uptime.toFixed(1)}% uptime over the last 7 days
            </p>
            <div className="flex items-center gap-2 text-xs pt-1">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-[var(--color-passed)]"></div>
                <span>Passed</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-[var(--color-failed)]"></div>
                <span>Failed</span>
              </div>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
} 