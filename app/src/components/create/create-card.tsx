"use client";

import React from "react";
import {
  Card,

} from "@/components/ui/card";
import { cn } from "@/lib/utils";


interface CreateCardProps extends React.HTMLAttributes<HTMLDivElement> {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick?: () => void;
  className?: string;
}

export function CreateCard({
  icon,
  title,
  description,
  onClick,
  className,
  ...props
}: CreateCardProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (onClick && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <Card
      className={cn(
        "hover:border-primary hover:shadow-sm transition-all cursor-pointer h-auto",
        className
      )}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? handleKeyDown : undefined}
      {...props}
    >
      <div className="p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="text-primary shrink-0">{icon}</div>
          <div className="font-medium">{title}</div>
        </div>
        <div className="text-xs text-muted-foreground leading-relaxed mt-1">{description}</div>
      </div>
    </Card>
  );
}
