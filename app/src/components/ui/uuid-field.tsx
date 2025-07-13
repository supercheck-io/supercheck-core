"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";

interface UUIDFieldProps {
  value: string;
  className?: string;
  maxLength?: number;
  onCopy?: (value: string) => void;
}

export function UUIDField({
  value,
  className,
  maxLength,
  onCopy,
}: UUIDFieldProps) {
  // Format the UUID for display if it needs to be shortened
  const displayValue =
    maxLength && value.length > maxLength
      ? `${value.substring(0, maxLength)}...`
      : value;

  const isTruncated = maxLength && value.length > maxLength;

  if (!isTruncated) {
    return (
      <div
        className={cn(
          "group relative inline-flex items-center w-full",
          className
        )}
      >
        <code className="font-mono text-xs bg-muted/60 dark:bg-muted px-1.5 p-1 rounded pr-1 truncate ">{displayValue}</code>
        <CopyButton value={value} onCopy={onCopy} className="ml-1" />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "group relative inline-flex items-center w-full",
              className
            )}
          >
            <code className="font-mono text-xs bg-muted/60 dark:bg-muted px-1.5 p-1 rounded pr-1 truncate ">{displayValue}</code>
            <CopyButton value={value} onCopy={onCopy} className="ml-1" />
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[700px]">
          <span className="font-mono text-xs">{value}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
