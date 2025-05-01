"use client";

import { useEffect, useRef } from 'react';
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
  const eventSourceRef = useRef<EventSource | null>(null);
  const hasShownToastRef = useRef<boolean>(false);

  useEffect(() => {
    // If the run is already in a terminal state, don't set up SSE
    if (status === 'completed' || status === 'failed' || status === 'passed' || status === 'error') {
      console.log(`[RunStatusListener] Run ${runId} is already in terminal state: ${status}, not setting up SSE`);
      return;
    }

    // Clean up function
    const cleanupSSE = () => {
      if (eventSourceRef.current) {
        console.log(`[RunStatusListener] Cleaning up SSE connection for run ${runId}`);
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };

    // Establish SSE connection
    // Using runId instead of jobId for the SSE connection
    console.log(`[RunStatusListener] Setting up SSE connection for run ${runId}`);
    const eventSource = new EventSource(`/api/job-status/sse/${runId}`);
    eventSourceRef.current = eventSource;
    
    // Reset toast flag on new connection
    hasShownToastRef.current = false;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log(`[RunStatusListener] Status update for run ${runId}:`, data);
        
        // Notify parent component of status updates
        if (data.status && onStatusUpdate) {
          onStatusUpdate(data.status, data.s3Url);
        }
        
        // Handle terminal statuses (show toast only once per connection)
        if ((data.status === 'completed' || data.status === 'failed' || 
            data.status === 'passed' || data.status === 'error') && !hasShownToastRef.current) {
          
          // Mark as shown to prevent duplicates
          hasShownToastRef.current = true;
          
          // Determine success or failure
          const passed = data.status === 'completed' || data.status === 'passed';
          
          // Show toast
          toast[passed ? 'success' : 'error'](
            passed ? "Run completed successfully" : "Run failed",
            {
              description: passed 
                ? "All tests passed successfully." 
                : `One or more tests failed. ${data.error || ''}`,
              duration: 5000
            }
          );
          
          // Close SSE connection after terminal status
          cleanupSSE();
          
          // Refresh page data to show updated statuses
          setTimeout(() => router.refresh(), 500);
        }
      } catch (error) {
        console.error(`[RunStatusListener] Error parsing message:`, error);
      }
    };

    eventSource.onerror = (error) => {
      console.error(`[RunStatusListener] SSE error:`, error);
      cleanupSSE();
    };

    // Clean up on unmount
    return cleanupSSE;
  }, [runId, status, onStatusUpdate, router]);

  // Component doesn't render anything visible
  return null;
} 