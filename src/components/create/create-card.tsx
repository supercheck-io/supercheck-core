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
        "cursor-pointer hover:border-primary transition-colors w-full h-full ",
        className
      )}
      onClick={onClick}
    >
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 flex flex-col gap-2 h-full border-dashed">
        <div className="text-xl sm:text-2xl text-primary">{icon}</div>
      </CardContent>
    </Card>
  );
}
