"use client";

import { useEffect } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

interface RunStatusListenerProps {
  runId: string;
  jobId: string;
  status: string;
  onStatusUpdate?: (status: string, reportUrl?: string) => void;
}

export function RunStatusListener({ 
  runId, 
  jobId, 
  status,
  onStatusUpdate 
}: RunStatusListenerProps) {
  const router = useRouter();

  useEffect(() => {
    // If the run is already completed or failed, don't set up SSE
    if (status === 'completed' || status === 'failed') {
      return;
    }

    // If status is running, set up SSE to get real-time updates
    if (status === 'running') {
      console.log(`Setting up SSE for job ${jobId} and run ${runId}`);
      const eventSource = new EventSource(`/api/job-status/sse/${jobId}`);
      let eventSourceClosed = false;

      // Handle status updates
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log("SSE job status update:", data);

          // Update status in parent component
          if (data.status && onStatusUpdate) {
            onStatusUpdate(data.status, data.s3Url);
          }

          // Handle terminal states
          if (data.status === 'completed' || data.status === 'failed') {
            // Show toast with status
            toast[data.status === 'completed' ? 'success' : 'error'](
              `Job run ${data.status}`,
              { 
                description: data.status === 'completed' 
                  ? 'Job execution completed successfully' 
                  : `Job execution failed: ${data.error || 'Unknown error'}`, 
                duration: 5000 
              }
            );

            // Close connection
            eventSource.close();
            eventSourceClosed = true;

            // Refresh the page data
            router.refresh();
          }
        } catch (e) {
          console.error("Error parsing SSE event:", e);
        }
      };

      // Handle connection errors
      eventSource.onerror = (error) => {
        console.error("SSE connection error:", error);
        
        if (!eventSourceClosed) {
          eventSource.close();
          eventSourceClosed = true;
        }
      };

      // Clean up on unmount
      return () => {
        if (!eventSourceClosed) {
          eventSource.close();
        }
      };
    }
  }, [runId, jobId, status, onStatusUpdate, router]);

  // This component doesn't render anything
  return null;
} 