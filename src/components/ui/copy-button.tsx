"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

interface CopyButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onCopy"> {
  value: string;
  onCopy?: (value: string) => void;
  className?: string;
}

export function CopyButton({
  value,
  onCopy,
  className,
  ...props
}: CopyButtonProps) {
  const [copied, setCopied] = React.useState(false);

  const copy = React.useCallback(
    async (e: React.MouseEvent) => {
      // Stop event propagation to prevent row click
      e.stopPropagation();
      e.preventDefault();

      try {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        onCopy?.(value);

        setTimeout(() => {
          setCopied(false);
        }, 2000);
      } catch (error) {
        console.error("Failed to copy text:", error);
      }
    },
    [value, onCopy]
  );

  return (
    <button
      className={cn(
        "inline-flex h-4 w-4 items-center justify-center transition-opacity",
        "opacity-0 group-hover:opacity-100", // Hidden by default, shown on parent hover
        "text-muted-foreground hover:text-foreground focus:opacity-100",
        copied ? "text-green-500" : "",
        className
      )}
      onClick={copy}
      {...props}
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      <span className="sr-only">Copy</span>
    </button>
  );
}
