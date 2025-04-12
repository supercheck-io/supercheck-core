"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Log the error for debugging purposes
  console.error('Application error:', error);
  
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="flex flex-col items-center text-center max-w-md">
        <AlertTriangle className="h-16 w-16 text-amber-500 mb-4" />
        <h1 className="text-3xl font-bold mb-2">Something Went Wrong</h1>
        <p className="text-muted-foreground mb-6">
          An error occurred while trying to load this page.
        </p>
        <div className="flex gap-4">
          <Button
            onClick={() => reset()}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Try Again
          </Button>
          <Link href="/">
            <Button variant="outline">Back to Home</Button>
          </Link>
        </div>
      </div>
    </div>
  );
} 