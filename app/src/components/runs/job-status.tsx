"use client";

import { useState, useEffect, useRef } from 'react';
import { Badge } from "@/components/ui/badge";
import { runStatuses } from "./data";
import { useRouter } from "next/navigation";
import { toast } from 'sonner';

interface JobStatusProps {
  jobId: string;
  initialStatus: string;
}

export function JobStatus({ jobId, initialStatus }: JobStatusProps) {
  const [status, setStatus] = useState(initialStatus);
  const router = useRouter();
  const eventSourceRef = useRef<EventSource | null>(null);
  const hasShownToastRef = useRef<boolean>(false);

  useEffect(() => {
    // Only set up SSE if the job is running
    if (initialStatus !== 'running') {
      setStatus(initialStatus);
      return;
    }

    // Clean up function
    const cleanupSSE = () => {
      if (eventSourceRef.current) {
        console.log(`[JobStatus] Cleaning up SSE connection for job ${jobId}`);
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };

    console.log(`[JobStatus] Setting up SSE for job status: ${jobId}, initial status: ${initialStatus}`);
    
    // Create new EventSource connection
    const eventSource = new EventSource(`/api/job-status/sse/${jobId}`);
    eventSourceRef.current = eventSource;
    
    // Reset toast flag on new connection
    hasShownToastRef.current = false;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log(`[JobStatus] Status update received:`, data);
        
        if (data.status) {
          // Update the displayed status
          setStatus(data.status);
          
          // Handle terminal statuses with toast notifications
          // Only show toast if we haven't shown one for this SSE connection
          if ((data.status === 'completed' || data.status === 'passed' || 
              data.status === 'failed' || data.status === 'error') && !hasShownToastRef.current) {
            
            // Mark that we've shown a toast to prevent duplicates
            hasShownToastRef.current = true;
            
            // Determine if job passed or failed
            const passed = data.status === 'completed' || data.status === 'passed';
            
            // Show toast message for status change
            toast[passed ? 'success' : 'error'](
              passed ? "Job execution passed" : "Job execution failed",
              {
                description: passed 
                  ? "All tests executed successfully." 
                  : `One or more tests failed. ${data.error || ''}`,
                duration: 5000
              }
            );
            
            // Close the connection after terminal status
            cleanupSSE();
            
            // Refresh the page data to show updated job statuses
            setTimeout(() => {
              router.refresh();
            }, 500);
          }
        }
      } catch (error) {
        console.error(`[JobStatus] Error parsing SSE message:`, error);
      }
    };

    eventSource.onerror = (error) => {
      console.error(`[JobStatus] SSE error:`, error);
      cleanupSSE();
    };

    // Clean up on unmount
    return cleanupSSE;
  }, [jobId, initialStatus, router]);

  // Find the status object based on current status
  const statusInfo = runStatuses.find((s) => s.value === status) || runStatuses[0];
  const StatusIcon = statusInfo.icon;

  return (
    <Badge variant="outline" className={`flex items-center gap-1 ${statusInfo.color}`}>
      <StatusIcon className="h-3 w-3" />
      <span>{statusInfo.label}</span>
    </Badge>
  );
} 