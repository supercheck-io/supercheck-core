"use client"

import * as React from "react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

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
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"

const chartConfig = {
  responseTime: {
    label: "Response Time (ms)",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig

interface ResponseTimeChartDataPoint {
    name: string;
    time: number;
}

interface ResponseTimeBarChartProps {
    data: ResponseTimeChartDataPoint[];
}

export function ResponseTimeBarChart({ data }: ResponseTimeBarChartProps) {
  if (!data || data.length === 0) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Response Time</CardTitle>
                <CardDescription>No response time data available to display.</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-center h-[250px]">
                <p className="text-muted-foreground">No data</p>
            </CardContent>
        </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Response Time</CardTitle>
        <CardDescription>Recent response times in milliseconds.</CardDescription>
      </CardHeader>
      <CardContent className="px-2 sm:p-6">
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-[250px] w-full"
        >
          <BarChart
            accessibilityLayer
            data={data}
            margin={{
              left: 12,
              right: 12,
              top: 5,
              bottom: 5
            }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="name"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
            />
            <YAxis tickLine={false} axisLine={false} tickMargin={8} />
            <ChartTooltip
              cursor={false}
              content={(<ChartTooltipContent hideLabel />)}
            />
            <Bar dataKey="time" fill={`var(--color-responseTime)`} radius={4} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
} 