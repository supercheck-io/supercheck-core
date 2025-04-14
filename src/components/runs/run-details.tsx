"use client";

import React, { useState } from "react";
import { RunResponse } from "@/actions/get-runs";
import { Badge } from "@/components/ui/badge";
import { runStatuses } from "./data";
import { AlertTriangleIcon, AlertCircle, Loader2Icon } from "lucide-react";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { UUIDField } from "@/components/ui/uuid-field";
import { toast } from "sonner";
import Link from "next/link";

interface RunDetailsProps {
  run: RunResponse;
}

export function RunDetails({ run }: RunDetailsProps) {
  const [isReportLoading, setIsReportLoading] = useState(!!run.reportUrl);
  const [isTraceLoading, setIsTraceLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [iframeError, setIframeError] = useState(false);
  const [timestamp] = useState(() => Date.now());

  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Runs", href: "/runs" },
    { label: run.id, isCurrentPage: true },
  ];

  const getStatusBadge = (status: string) => {
    const statusInfo = runStatuses.find((s) => s.value === status);
    if (!statusInfo) return null;

    return (
      <Badge
        variant="outline"
        className={`${statusInfo.color} border-${statusInfo.color.replace(
          "text-",
          ""
        )}`}
      >
        {statusInfo.icon && <statusInfo.icon className="mr-1 h-3 w-3" />}
        {statusInfo.label}
      </Badge>
    );
  };

  return (
    <div className="w-full py-2 px-4">
      <div className="flex flex-col space-y-2">
        {/* Breadcrumbs */}
        <PageBreadcrumbs items={breadcrumbs} />

        {/* Ultra Compact Header Card */}
        <div className="bg-card p-3 rounded-lg border border-border/40 mb-4">
          {/* Two-column layout with title on left and details on right */}
          <div className="flex flex-wrap justify-between items-start">
            {/* Title and subtitle */}
            <div className="mr-4">
              <h1 className="text-2xl font-bold tracking-tight">Run Details</h1>
              <p className="text-muted-foreground text-md mt-1">Job execution results</p>
            </div>
            
            {/* Right-aligned sections */}
            <div className="flex flex-wrap gap-6 items-start">
              {/* Status */}
              <div>
                <span className="text-xs font-medium text-muted-foreground block">Status</span>
                <div className="mt-1">{getStatusBadge(run.status)}</div>
              </div>
              
              {/* Run ID */}
              <div>
                <span className="text-xs font-medium text-muted-foreground block">Run ID</span>
                <UUIDField 
                  value={run.id} 
                  className="text-sm font-mono"
                  onCopy={() => toast.success("Run ID copied to clipboard")}
                />
              </div>
              
              {/* Job details */}
              <div>
                <span className="text-xs font-medium text-muted-foreground block">Job</span>
                <div className="font-medium max-w-[300px] truncate overflow-hidden text-ellipsis whitespace-nowrap">{run.jobName || "Unknown Job"}</div>
                <UUIDField 
                  value={run.jobId} 
                  className="text-xs text-muted-foreground font-mono"
                  onCopy={() => toast.success("Job ID copied to clipboard")}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Main content - Playwright Report with adjusted height */}
        {run.reportUrl ? (
          iframeError ? (
            <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 border rounded-md mb-4">
              <div className="flex flex-col items-center text-center max-w-md">
                <AlertCircle className="h-16 w-16 text-red-500 mb-4" />
                <h1 className="text-3xl font-bold mb-2">Report Not Found</h1>
                <p className="text-muted-foreground mb-6">
                  {reportError || "Test results not found for this run ID."}
                </p>
                <div className="flex gap-4">
                  <Link
                    href="/runs"
                    className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
                  >
                    Back to Runs
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <div className="w-full h-[calc(100vh-210px)] overflow-hidden border rounded-md mb-4 relative">
              {isReportLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-background z-10">
                  <Loader2Icon className="h-12 w-12 animate-spin text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">Loading report...</p>
                </div>
              )}
              {isTraceLoading && !isReportLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#252526] z-10">
                  <Loader2Icon className="h-12 w-12 animate-spin text-white mb-3" />
                  <p className="text-white">Loading trace viewer...</p>
                </div>
              )}
              <iframe
                src={`${run.reportUrl}?t=${timestamp}`}
                className={`w-full h-full border-0 ${isReportLoading ? 'opacity-0' : 'opacity-100 transition-opacity duration-300'}`}
                title="Playwright Test Report"
                onLoad={(e) => {
                  const iframe = e.target as HTMLIFrameElement;
                  try {
                    if (iframe.contentWindow?.document.body.textContent) {
                      const bodyText = iframe.contentWindow.document.body.textContent;
                      
                      // Check for "File not found" error in plaintext response
                      if (bodyText.includes("File not found:") || bodyText.includes("report/index.html")) {
                        setReportError("Execution report is not available yet. The job might still be running...");
                        setIframeError(true);
                        return;
                      }
                      
                      if (bodyText.includes('"error"') && bodyText.includes('"message"')) {
                        try {
                          const errorData = JSON.parse(bodyText);
                          if (errorData.message) {
                            setReportError(errorData.message);
                            setIframeError(true);
                            return;
                          }
                        } catch (e) {
                          // Not valid JSON, continue with normal display
                        }
                      }
                    }
                    
                    setIsReportLoading(false);
                    setReportError(null);
                    
                    // Add event listener to the iframe to detect trace viewer loading
                    if (iframe.contentWindow) {
                      const setupTraceDetection = () => {
                        try {
                          // Listen for clicks on trace links
                          iframe.contentWindow?.document.body.addEventListener('click', (event) => {
                            const target = event.target as HTMLElement;
                            const traceLink = target.closest('a[href*="trace"]') || 
                                            target.closest('button[data-testid*="trace"]') ||
                                            (target.textContent?.toLowerCase().includes('trace') ? target : null);
                            
                            if (traceLink) {
                              setIsTraceLoading(true);
                              
                              // Function to check if trace is loaded and hide spinner
                              const checkTraceLoaded = () => {
                                try {
                                  // Check for trace elements in the iframe
                                  const traceElements = [
                                    '.pw-no-select', 
                                    '[data-testid="trace-page"]',
                                    '[data-testid="action-list"]',
                                    '[data-testid="trace-viewer"]',
                                    'iframe[src*="trace"]',
                                    '.react-calendar-timeline',
                                    '.timeline-overlay' // Playwright specific trace element
                                  ];
                                  
                                  // Check document title for trace
                                  const title = iframe.contentWindow?.document.title || '';
                                  if (title.toLowerCase().includes('trace')) {
                                    setIsTraceLoading(false);
                                    return true;
                                  }
                                  
                                  // Check URL for trace
                                  const url = iframe.contentWindow?.location.href || '';
                                  if (url.includes('trace')) {
                                    setIsTraceLoading(false);
                                    return true;
                                  }
                                  
                                  // Check for any of the trace elements
                                  for (const selector of traceElements) {
                                    const element = iframe.contentWindow?.document.querySelector(selector);
                                    if (element) {
                                      setIsTraceLoading(false);
                                      return true;
                                    }
                                  }
                                } catch (err) {
                                  console.error("Error checking for trace:", err);
                                  setIsTraceLoading(false);
                                  return true; // Hide spinner on error
                                }
                                
                                return false;
                              };
                              
                              // Check immediately
                              if (checkTraceLoaded()) {
                                return; // Already loaded
                              }
                              
                              // Set a safety timeout - necessary to prevent indefinite spinning
                              const safetyTimeout = setTimeout(() => {
                                console.log("Safety timeout triggered - hiding trace spinner");
                                setIsTraceLoading(false);
                              }, 3000); // 3 second safety timeout
                              
                              // Set up regular checks
                              let checkCount = 0;
                              const intervalCheck = setInterval(() => {
                                checkCount++;
                                if (checkTraceLoaded() || checkCount > 20) { // Check up to 20 times (4 seconds)
                                  clearInterval(intervalCheck);
                                  clearTimeout(safetyTimeout);
                                }
                              }, 200); // Check every 200ms
                            }
                          }, true);
                          
                          // Also detect navigation using hashchange
                          iframe.contentWindow?.addEventListener('hashchange', () => {
                            if (iframe.contentWindow?.location.hash.includes('trace')) {
                              setIsTraceLoading(true);
                              
                              // Safety timeout for hashchange
                              setTimeout(() => {
                                setIsTraceLoading(false);
                              }, 2000);
                            }
                          });
                        } catch (err) {
                          console.error("Error setting up trace detection:", err);
                        }
                      };
                      
                      // Setup detection after a small delay to ensure the report is fully loaded
                      setTimeout(setupTraceDetection, 1000);
                    }
                  } catch (err) {
                    console.error("Error processing iframe content:", err);
                    setIsReportLoading(false);
                  }
                }}
                onError={(e) => {
                  console.error("Error loading iframe:", e);
                  setIsReportLoading(false);
                  setReportError("Test results not found for this run ID.");
                  setIframeError(true);
                  
                  fetch(`${run.reportUrl}?t=${timestamp}`)
                    .then(response => {
                      if (!response.ok) {
                        return response.json().catch(() => null);
                      }
                      return null;
                    })
                    .then(data => {
                      if (data && data.message) {
                        setReportError(data.message);
                      }
                    })
                    .catch(err => {
                      console.error("Error fetching report details:", err);
                    });
                }}
              />
            </div>
          )
        ) : (
          <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 border rounded-md mb-4">
            <div className="flex flex-col items-center text-center max-w-md">
              <AlertCircle className="h-16 w-16 text-red-500 mb-4" />
              <h1 className="text-3xl font-bold mb-2">Report Not Found</h1>
              <p className="text-muted-foreground mb-6">
                There is no Playwright report available for this test run.
              </p>
              <div className="flex gap-4">
                <Link
                  href="/runs"
                  className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
                >
                  Back to Runs
                </Link>
              </div>
            </div>
            {run.logs && (
              <div className="mt-6 rounded-md bg-black text-white p-3 text-sm font-mono h-[calc(100vh-400px)] w-full overflow-auto">
                <pre>{run.logs}</pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
