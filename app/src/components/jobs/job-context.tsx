"use client";

import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { jobStatuses } from "./data";

interface JobRunState {
  runId: string | null;
  jobId: string | null;
  jobName: string | null;
  toastId: string | number | null;
}

// Simple map to track job statuses within the session
interface JobStatuses {
  [jobId: string]: string;
}

interface JobContextType {
  isAnyJobRunning: boolean;
  runningJobs: Set<string>;
  isJobRunning: (jobId: string) => boolean;
  getJobStatus: (jobId: string) => string | null;
  setJobRunning: (isRunning: boolean, jobId?: string) => void;
  setJobStatus: (jobId: string, status: string) => void;
  activeRun: JobRunState | null;
  startJobRun: (runId: string, jobId: string, jobName: string) => void;
  completeJobRun: (success: boolean, reportUrl?: string) => void;
}

const JobContext = createContext<JobContextType | undefined>(undefined);

// React component to display job status by reading from context
export function JobStatusDisplay({ jobId, dbStatus }: { jobId: string, dbStatus: string }) {
  const { isJobRunning, getJobStatus } = useJobContext();
  const [effectiveStatus, setEffectiveStatus] = useState(dbStatus);
  
  // Determine status priority: running > context status > db status
  useEffect(() => {
    if (isJobRunning(jobId)) {
      setEffectiveStatus('running');
    } else {
      const contextStatus = getJobStatus(jobId);
      setEffectiveStatus(contextStatus || dbStatus);
    }
  }, [jobId, dbStatus, isJobRunning, getJobStatus]);
  
  const statusInfo = jobStatuses.find(
    (status) => status.value === effectiveStatus
  ) || jobStatuses[0];
  
  const StatusIcon = statusInfo.icon;
  
  return (
    <div className="flex w-[120px] items-center">
      <StatusIcon className={`mr-2 h-4 w-4 ${statusInfo.color}`} />
      <span>{statusInfo.label}</span>
    </div>
  );
}

export function JobProvider({ children }: { children: React.ReactNode }) {
  const [isAnyJobRunning, setIsAnyJobRunning] = useState(false);
  const [runningJobs, setRunningJobs] = useState<Set<string>>(new Set());
  // Simple in-memory job status tracking (not persisted)
  const [jobStatuses, setJobStatuses] = useState<JobStatuses>({});
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

  // Check if a specific job is running
  const isJobRunning = (jobId: string): boolean => {
    return runningJobs.has(jobId);
  };
  
  // Get the status of a job from context
  const getJobStatus = (jobId: string): string | null => {
    return jobStatuses[jobId] || null;
  };
  
  // Set the status of a job in context
  const setJobStatus = (jobId: string, status: string) => {
    console.log(`[JobContext] Setting job ${jobId} status to ${status}`);
    
    setJobStatuses(prev => ({
      ...prev,
      [jobId]: status
    }));
    
    // If status is running, add to running jobs
    if (status === 'running') {
      setRunningJobs(prev => {
        const newSet = new Set(prev);
        newSet.add(jobId);
        return newSet;
      });
      setIsAnyJobRunning(true);
    } 
    // If status is terminal, remove from running jobs
    else if (['passed', 'failed', 'error', 'completed'].includes(status)) {
      setRunningJobs(prev => {
        const newSet = new Set(prev);
        newSet.delete(jobId);
        // Update global state if no more jobs are running
        if (newSet.size === 0) {
          setIsAnyJobRunning(false);
        }
        return newSet;
      });
    }
  };

  const setJobRunning = (isRunning: boolean, jobId?: string) => {
    if (isRunning && jobId) {
      // Add job to running jobs
      setRunningJobs(prev => {
        const newSet = new Set(prev);
        newSet.add(jobId);
        return newSet;
      });
      setIsAnyJobRunning(true);
      
      // Update job status in context
      setJobStatus(jobId, 'running');
    } else if (!isRunning) {
      // If no job is running, clean up active run state
      if (activeRun?.toastId) {
        toast.dismiss(activeRun.toastId);
      }
      
      if (jobId) {
        // Remove specific job from running jobs
        setRunningJobs(prev => {
          const newSet = new Set(prev);
          newSet.delete(jobId);
          // Update global state if no more jobs are running
          if (newSet.size === 0) {
            setIsAnyJobRunning(false);
          }
          return newSet;
        });
        
        // Reset active run if it matches this job
        if (activeRun?.jobId === jobId) {
          setActiveRun(null);
        }
      } else {
        // Clear all running jobs
        setRunningJobs(new Set());
        setIsAnyJobRunning(false);
        setActiveRun(null);
      }
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
    
    // Mark this job as running
    setRunningJobs(prev => {
      const newSet = new Set(prev);
      newSet.add(jobId);
      return newSet;
    });
    
    // Update job status
    setJobStatus(jobId, 'running');
    
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
          
          // Update the job status
          setJobStatus(jobId, statusData.status);
          
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
          
          // Remove this job from running jobs
          setRunningJobs(prev => {
            const newSet = new Set(prev);
            if (jobId) newSet.delete(jobId);
            // Update global running state based on remaining jobs
            if (newSet.size === 0) {
              setIsAnyJobRunning(false);
            }
            return newSet;
          });
          
          // Reset active run if this specific job finished
          if (jobId && activeRun?.jobId === jobId) {
            setActiveRun(null);
          }
          
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
      
      // Set error status
      setJobStatus(jobId, 'error');
      
      // Remove this job from running jobs
      setRunningJobs(prev => {
        const newSet = new Set(prev);
        if (jobId) newSet.delete(jobId);
        // Update global running state based on remaining jobs
        if (newSet.size === 0) {
          setIsAnyJobRunning(false);
        }
        return newSet;
      });
      
      // Reset active run if this specific job finished
      if (jobId && activeRun?.jobId === jobId) {
        setActiveRun(null);
      }
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
    
    // Update job status
    if (activeRun.jobId) {
      setJobStatus(activeRun.jobId, success ? 'passed' : 'failed');
    }
    
    // Remove this job from running jobs
    if (activeRun.jobId) {
      setRunningJobs(prev => {
        const newSet = new Set(prev);
        if (activeRun.jobId) newSet.delete(activeRun.jobId);
        // Update global running state based on remaining jobs
        if (newSet.size === 0) {
          setIsAnyJobRunning(false);
        }
        return newSet;
      });
    }
    
    // Reset active run state
    setActiveRun(null);
    
    // Refresh the page
    router.refresh();
  };

  return (
    <JobContext.Provider value={{ 
      isAnyJobRunning, 
      runningJobs,
      isJobRunning,
      getJobStatus,
      setJobRunning, 
      setJobStatus,
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