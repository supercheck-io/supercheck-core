"use client";

import React from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface CreateCardProps {
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
}: CreateCardProps) {
  return (
    <Card
      className={cn(
        "hover:border-primary transition-colors w-full",
        className
      )}
      onClick={onClick}
    >
      <CardHeader className="p-4">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
        <CardDescription className="text-sm">{description}</CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0 flex flex-col gap-2">
        <div className="text-xl text-primary">{icon}</div>
      </CardContent>
    </Card>
  );
}
