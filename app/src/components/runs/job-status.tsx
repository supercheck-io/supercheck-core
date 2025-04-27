"use client";

import { useState, useEffect } from 'react';
import { Badge } from "@/components/ui/badge";
import { runStatuses } from "./data";
import { useRouter } from 'next/navigation';

interface JobStatusProps {
  jobId: string;
  initialStatus: string;
}

export function JobStatus({ jobId, initialStatus }: JobStatusProps) {
  const [status, setStatus] = useState(initialStatus);
  const router = useRouter();

  useEffect(() => {
    // Only set up SSE if the job is running
    if (initialStatus !== 'running') {
      setStatus(initialStatus);
      return;
    }

    console.log(`Setting up SSE for job status: ${jobId}`);
    const eventSource = new EventSource(`/api/job-status/sse/${jobId}`);
    let eventSourceClosed = false;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("SSE job status update:", data);
        
        if (data.status) {
          setStatus(data.status);
          
          // If terminal state, close connection and refresh the page
          if (data.status === 'completed' || data.status === 'failed') {
            eventSource.close();
            eventSourceClosed = true;
            
            // Give a small delay before refreshing to ensure UI updates are visible
            setTimeout(() => {
              router.refresh();
            }, 1000);
          }
        }
      } catch (e) {
        console.error("Error parsing SSE event:", e);
      }
    };

    eventSource.onerror = (error) => {
      console.error("SSE connection error:", error);
      if (!eventSourceClosed) {
        eventSource.close();
        eventSourceClosed = true;
      }
    };

    // Clean up
    return () => {
      if (!eventSourceClosed) {
        eventSource.close();
      }
    };
  }, [jobId, initialStatus, router]);

  const getStatusBadge = (statusValue: string) => {
    const statusInfo = runStatuses.find((s) => s.value === statusValue);
    if (!statusInfo) return null;

    return (
      <Badge
        variant="outline"
        className={`${statusInfo.color}`}
      >
        {statusInfo.icon && <statusInfo.icon className="mr-1 h-3 w-3" />}
        {statusInfo.label}
      </Badge>
    );
  };

  return getStatusBadge(status);
} 