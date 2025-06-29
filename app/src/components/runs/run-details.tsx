"use client";

import { useEffect, useState } from "react";
import { RunResponse } from "@/actions/get-runs";
import { runStatuses } from "./data";
import { toast } from "sonner";
import { ReportViewer } from "@/components/shared/report-viewer";
import { formatDistanceToNow } from "date-fns";
import { 
  ClockIcon, 
  ChevronLeft,
  CalendarClock,
  Copy,
  FileText,
  Calendar,
  Trash2
} from "lucide-react";
import { RunStatusListener } from "./run-status-listener";
import { TestRunStatus } from "@/db/schema/schema";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface RunDetailsProps {
  run: RunResponse;
}

export function RunDetails({ run }: RunDetailsProps) {
  const router = useRouter();
  const [reportUrl, setReportUrl] = useState('');
  const [duration, setDuration] = useState<string | undefined>(run.duration || undefined);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Helper to validate status is one of the allowed values
  const mapStatusForDisplay = (status: string): TestRunStatus => {
    const statusLower = status.toLowerCase();
    
    switch(statusLower) {
      case 'running':
        return 'running';
      case 'passed':
        return 'passed';
      case 'failed':
        return 'failed';
      case 'error':
        return 'error';
      default:
        console.warn(`Unknown status: ${status}, defaulting to running`);
        return 'running';
    }
  };
  
  const [currentStatus, setCurrentStatus] = useState<TestRunStatus>(mapStatusForDisplay(run.status as TestRunStatus));
  
  useEffect(() => {
    if (run.reportUrl) {
      // Use the API proxy with direct UUID format instead of /jobs/ prefix
      const apiUrl = `/api/test-results/${run.id}/report/index.html?t=${Date.now()}`;
      console.log(`Setting report URL to API proxy: ${apiUrl} (original: ${run.reportUrl})`);
      setReportUrl(apiUrl);
    } else {
      // If no report URL, still try to use the test-results API with direct UUID
      const apiUrl = `/api/test-results/${run.id}/report/index.html?t=${Date.now()}`;
      console.log(`No direct reportUrl, trying API proxy path: ${apiUrl}`);
      setReportUrl(apiUrl);
    }
    
    // Always update status and duration regardless of reportUrl
    setCurrentStatus(mapStatusForDisplay(run.status as TestRunStatus));
    setDuration(run.duration || undefined);
    
    // No need for refresh timer since we're using SSE for real-time updates
  }, [run.reportUrl, run.status, run.id, run.duration]);

  // Format the duration for display
  const formatDuration = (durationStr?: string) => {
    if (!durationStr) return "Unknown";
    
    // If it's already a nicely formatted string like "3s" or "1m 30s", just return it
    if (typeof durationStr === 'string' && (durationStr.includes('s') || durationStr.includes('m'))) {
      return durationStr;
    }
    
    // Try to parse as number of seconds
    const seconds = parseInt(durationStr, 10);
    if (!isNaN(seconds)) {
      if (seconds === 0) return "< 1s"; // Show something meaningful for zero seconds
      
      // Format seconds into a readable string
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      
      if (minutes > 0) {
        return `${minutes}m ${remainingSeconds > 0 ? `${remainingSeconds}s` : ''}`.trim();
      } else {
        return `${seconds}s`;
      }
    }
    
    // If we can't parse it, just return the original string
    return durationStr;
  };

 

  // Handle status updates from SSE
  const handleStatusUpdate = (status: string, newReportUrl?: string, newDuration?: string) => {
    console.log(`Status update: ${status}, reportUrl: ${newReportUrl}, duration: ${newDuration}`);
    
    if (status !== currentStatus) {
      setCurrentStatus(mapStatusForDisplay(status as TestRunStatus));
    }
    
    if (newReportUrl) {
      // Regardless of the reportUrl from SSE, use our API proxy with direct UUID
      const apiUrl = `/api/test-results/${run.id}/report/index.html?t=${Date.now()}`;
      console.log(`Setting report URL after SSE update: ${apiUrl}`);
      setReportUrl(apiUrl);
    }

    // Update duration if it changed
    if (newDuration && newDuration !== duration) {
      console.log(`Updating duration from ${duration} to ${newDuration}`);
      setDuration(newDuration);
    }
  };

  const statusInfo = runStatuses.find((s) => s.value === currentStatus);
  
  // Helper function to truncate ID
  const truncateId = (id: string) => {
    if (!id) return '';
    return id;  // No longer truncating
  };

  const handleDeleteRun = async () => {
    setIsDeleting(true);
    try {
      // Use a simpler direct DELETE request to the [id] route
      const response = await fetch(`/api/runs/${encodeURIComponent(run.id)}`, {
        method: 'DELETE',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error response:', errorText);
        throw new Error(`Failed to delete run (status ${response.status})`);
      }
      
      toast.success('Run deleted successfully');
      
      // Close dialog first
      setShowDeleteDialog(false);
      
      // Use router for navigation without full page refresh
      router.push('/runs');
    } catch (error) {
      console.error('Error deleting run:', error);
      toast.error('Failed to delete run', {
        description: error instanceof Error ? error.message : 'An unknown error occurred'
      });
      setShowDeleteDialog(false);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="container py-4 px-4 h-full overflow-hidden">
      {/* Status listener for real-time updates */}
      <RunStatusListener 
        runId={run.id} 
        status={run.status}
        onStatusUpdate={handleStatusUpdate}
      />
      
      {/* Main header similar to monitor details */}
      <div className="border rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="icon"
              className="h-7 w-7"
              asChild
            >
              <Link href="/runs">
                <ChevronLeft className="h-3.5 w-3.5" />
                <span className="sr-only">Back to runs</span>
              </Link>
            </Button>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                {run.jobName || "Unknown Job"}
              </h1>
              {run.testCount !== undefined && (
                <div className="text-sm text-muted-foreground">
                  {run.testCount} {run.testCount === 1 ? 'test' : 'tests'}
                </div>
              )}
            </div>
          </div>
          <Button 
            variant="destructive"
            size="sm"
            className=""
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete
          </Button>
        </div>

        {/* Status cards - similar to monitor details but with appropriate content */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mt-2">
          <div className="bg-muted/30 rounded-lg p-2 border flex items-center overflow-hidden">
            {statusInfo && (
              <statusInfo.icon className={`h-6 w-6 min-w-6 mr-2 ${statusInfo.color}`} />
            )}
            <div className="min-w-0 w-full">
              <div className="text-xs font-medium text-muted-foreground">Status</div>
              <div className="text-sm font-semibold truncate">{statusInfo?.label || 'Unknown'}</div>
            </div>
          </div>
          
          <div className="bg-muted/30 rounded-lg p-2 border flex items-center overflow-hidden">
            <ClockIcon className="h-6 w-6 min-w-6 mr-2 text-blue-500" />
            <div className="min-w-0 w-full">
              <div className="text-xs font-medium text-muted-foreground">Duration</div>
              <div className="text-sm font-semibold truncate">{formatDuration(duration)}</div>
            </div>
          </div>
          
   
          
          <div className="bg-muted/30 rounded-lg p-2 border flex items-center overflow-hidden">
            <CalendarClock className="h-6 w-6 min-w-6 mr-2 text-purple-500" />
            <div className="min-w-0 w-full">
              <div className="text-xs font-medium text-muted-foreground">Completed</div>
              <div className="text-sm font-semibold truncate">
                {run.completedAt ? 
                  formatDistanceToNow(new Date(run.completedAt), { addSuffix: true }) : 
                  currentStatus === "running" ? "In Progress" : "Unknown"}
              </div>
            </div>
          </div>

          <div className="bg-muted/30 rounded-lg p-2 border flex items-center overflow-hidden">
            <Calendar className="h-6 w-6 min-w-6 mr-2 text-amber-500" />
            <div className="min-w-0 w-full">
              <div className="text-xs font-medium text-muted-foreground">Run Date</div>
              <div className="text-sm font-semibold truncate">
                {run.startedAt ? new Date(run.startedAt).toLocaleString('en-US', {
                  year: 'numeric',
                  month: 'numeric',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: true,
                }) : "Unknown"}
              </div>
            </div>
          </div>
          
          <div className="bg-muted/30 rounded-lg p-2 border flex items-center overflow-hidden">
            <FileText className="h-6 w-6 min-w-6 mr-2 text-orange-500" />
            <div className="min-w-0 w-full">
              <div className="flex justify-between items-center">
                <div className="text-xs font-medium text-muted-foreground">Job ID</div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-5 w-5 p-0 ml-1"
                  onClick={() => {
                    navigator.clipboard.writeText(run.jobId);
                    toast.success("Job ID copied");
                  }}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
              <div className="text-xs font-mono truncate">{run.jobId}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Report viewer */}
      <div className="bg-card rounded-lg border overflow-hidden">
        <div className="w-full h-full">
          <ReportViewer
            reportUrl={reportUrl}
            isRunning={currentStatus === "running"}
            backToLabel="Back to Runs"
            backToUrl="/runs"
            containerClassName="w-full h-[calc(100vh-280px)] relative"
            iframeClassName="w-full h-full border-0 rounded-lg"
            darkMode={false}
            hideEmptyMessage={true}
          />
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the run. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDeleteRun();
              }}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
} 