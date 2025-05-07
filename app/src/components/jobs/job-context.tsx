"use client";

import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface JobRunState {
  runId: string | null;
  jobId: string | null;
  jobName: string | null;
  toastId: string | number | null;
}

interface JobContextType {
  isAnyJobRunning: boolean;
  setJobRunning: (isRunning: boolean) => void;
  activeRun: JobRunState | null;
  startJobRun: (runId: string, jobId: string, jobName: string) => void;
  completeJobRun: (success: boolean, reportUrl?: string) => void;
}

const JobContext = createContext<JobContextType | undefined>(undefined);

export function JobProvider({ children }: { children: React.ReactNode }) {
  const [isAnyJobRunning, setIsAnyJobRunning] = useState(false);
  const [activeRun, setActiveRun] = useState<JobRunState | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const router = useRouter();
  
  // Clean up event source on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  const setJobRunning = (isRunning: boolean) => {
    setIsAnyJobRunning(isRunning);
    if (!isRunning) {
      // If no job is running, clean up active run state
      if (activeRun?.toastId) {
        toast.dismiss(activeRun.toastId);
      }
      setActiveRun(null);
    }
  };

  const startJobRun = (runId: string, jobId: string, jobName: string) => {
    // Clean up any existing SSE connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    
    // Clean up any existing toast
    if (activeRun?.toastId) {
      toast.dismiss(activeRun.toastId);
    }
    
    // Show a loading toast
    const toastId = toast.loading(`Executing job: ${jobName.length > 25 ? jobName.substring(0, 25) + '...' : jobName}`, {
      description: "Job execution is in progress...",
      duration: Infinity,
    });
    
    // Set up SSE to get real-time job status
    const eventSource = new EventSource(`/api/job-status/sse/${runId}`);
    eventSourceRef.current = eventSource;
    let hasShownFinalToast = false;
    
    eventSource.onmessage = (event) => {
      try {
        const statusData = JSON.parse(event.data);
        console.log(`[JobContext] SSE status update for run ${runId}:`, statusData);

        // Handle terminal statuses with final toast
        if ((statusData.status === 'completed' || statusData.status === 'failed' || 
             statusData.status === 'passed' || statusData.status === 'error') && !hasShownFinalToast) {
          
          // Only show the toast once
          hasShownFinalToast = true;
          
          // Determine if job passed or failed
          const passed = statusData.status === 'completed' || statusData.status === 'passed';
          
          // Dismiss the loading toast
          toast.dismiss(toastId);
          
          // Update with final status toast
          toast[passed ? 'success' : 'error'](
            passed ? 'Job execution passed' : 'Job execution failed',
            {
              description: (
                <>
                  {passed 
                    ? 'All tests executed successfully.' 
                    : 'One or more tests did not complete successfully.'}{" "}
                  <a href={`/runs/${runId}`} className="underline font-medium">
                    View Run Report
                  </a>
                </>
              ),
              duration: 10000,
            }
          );

          // Clean up SSE connection
          if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
          }
          
          // Reset states
          setIsAnyJobRunning(false);
          setActiveRun(null);
          
          // Refresh the page to show updated job status
          router.refresh();
        }
      } catch (e) {
        console.error("[JobContext] Error parsing SSE event:", e);
      }
    };
    
    eventSource.onerror = (error) => {
      console.error("[JobContext] SSE connection error:", error);
      
      if (!hasShownFinalToast) {
        hasShownFinalToast = true;
        
        // Dismiss loading toast on error
        toast.dismiss(toastId);
        
        // Show error toast
        toast.error("Job execution error", {
          description: "Connection to job status updates was lost. Check job status in the runs page.",
        });
      }
      
      // Clean up SSE connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      
      // Reset states
      setIsAnyJobRunning(false);
      setActiveRun(null);
    };
    
    // Update the state
    setIsAnyJobRunning(true);
    setActiveRun({
      runId,
      jobId,
      jobName,
      toastId
    });
  };
  
  const completeJobRun = (success: boolean, reportUrl?: string) => {
    // This can be called manually if needed
    if (!activeRun) return;
    
    // Dismiss the loading toast
    if (activeRun.toastId) {
      toast.dismiss(activeRun.toastId);
    }
    
    // Show success/error toast
    toast[success ? 'success' : 'error'](
      success ? 'Job execution passed' : 'Job execution failed',
      {
        description: (
          <>
            {success 
              ? 'All tests executed successfully.' 
              : 'One or more tests did not complete successfully.'}{" "}
            {reportUrl && (
              <a href={`/runs/${activeRun.runId}`} className="underline font-medium">
                View Run Report
              </a>
            )}
          </>
        ),
        duration: 10000,
      }
    );
    
    // Clean up SSE connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    
    // Reset states
    setIsAnyJobRunning(false);
    setActiveRun(null);
    
    // Refresh the page
    router.refresh();
  };

  return (
    <JobContext.Provider value={{ 
      isAnyJobRunning, 
      setJobRunning, 
      activeRun,
      startJobRun,
      completeJobRun
    }}>
      {children}
    </JobContext.Provider>
  );
}

export function useJobContext() {
  const context = useContext(JobContext);
  if (context === undefined) {
    throw new Error("useJobContext must be used within a JobProvider");
  }
  return context;
} 