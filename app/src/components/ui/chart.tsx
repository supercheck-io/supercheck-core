"use client";

import * as React from "react";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface ChartConfig {
  [key: string]: {
    label: string;
    color?: string;
  };
}

interface ChartContextValue {
  config: ChartConfig;
}

const ChartContext = React.createContext<ChartContextValue | undefined>(
  undefined
);

export function ChartContainer({
  children,
  config,
  className,
}: {
  children: React.ReactNode;
  config: ChartConfig;
  className?: string;
}) {
  const contextValue = React.useMemo(() => ({ config }), [config]);

  return (
    <ChartContext.Provider value={contextValue}>
      <div
        className={cn(
          "w-full overflow-auto rounded-md border bg-background p-1",
          className
        )}
      >
        <TooltipProvider>{children}</TooltipProvider>
      </div>
      <style jsx global>{`
        :root {
          --color-views: var(--chart-1);
          --color-desktop: var(--chart-1);
          --color-mobile: var(--chart-2);
          --color-count: var(--chart-1);
          --color-passed: #22c55e;
          --color-failed: #ef4444;
        }
      `}</style>
    </ChartContext.Provider>
  );
}

export function ChartTooltip({
  content,
  children,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Tooltip content={content} disableHoverableContent>
      {children}
    </Tooltip>
  );
}

interface ChartTooltipContentProps extends React.HTMLAttributes<HTMLDivElement> {
  active?: boolean;
  payload?: Array<{ name?: string; value?: string | number }>;
  nameKey?: string;
  labelFormatter?: (value: any) => string;
  valueFormatter?: (value: any) => string;
}

export function ChartTooltipContent({
  active,
  payload,
  nameKey,
  labelFormatter,
  valueFormatter,
  className,
  ...props
}: ChartTooltipContentProps) {
  const context = React.useContext(ChartContext);

  if (!active || !payload?.length || !context) {
    return null;
  }

  return (
    <div
      className={cn(
        "rounded-md border bg-background px-3 py-1.5 shadow-md",
        className
      )}
      {...props}
    >
      {payload.map((item, index) => {
        const config = context.config[item.name || ""];
        if (!config) return null;

        return (
          <div key={index} className="flex flex-col gap-1">
            {nameKey && labelFormatter && (
              <p className="text-xs text-muted-foreground">
                {labelFormatter(
                  payload[0].payload?.[nameKey] || payload[0].payload
                )}
              </p>
            )}
            <p className="flex items-center gap-2 font-medium">
              {config.color && (
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: `var(${config.color})` }}
                />
              )}
              {config.label}:{" "}
              {valueFormatter
                ? valueFormatter(item.value)
                : item.value?.toString()}
            </p>
          </div>
        );
      })}
    </div>
  );
} 