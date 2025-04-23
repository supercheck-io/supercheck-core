import { useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface ReportViewerProps {
  reportUrl: string | null;
  isRunning?: boolean;
  backToLabel?: string;
  backToUrl?: string;
  containerClassName?: string;
  iframeClassName?: string;
  loadingMessage?: string;
  darkMode?: boolean;
}

export function ReportViewer({
  reportUrl,
  isRunning = false,
  backToLabel,
  backToUrl,
  containerClassName = "w-full h-full relative",
  iframeClassName = "w-full h-full",
  loadingMessage = "Loading report...",
  darkMode = true,
}: ReportViewerProps) {
  const [isReportLoading, setIsReportLoading] = useState(!!reportUrl);
  const [isTraceLoading, setIsTraceLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [iframeError, setIframeError] = useState(false);
  const [currentReportUrl, setCurrentReportUrl] = useState<string | null>(reportUrl);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Update URL when prop changes
  useEffect(() => {
    if (reportUrl) {
      setCurrentReportUrl(reportUrl.includes('?') ? reportUrl : `${reportUrl}?t=${Date.now()}`);
      setIsReportLoading(true);
      setIframeError(false);
      setReportError(null);
    } else {
      setCurrentReportUrl(null);
    }
  }, [reportUrl]);

  // Safety timeout to prevent loading state from getting stuck
  useEffect(() => {
    if (isReportLoading) {
      const safetyTimeout = setTimeout(() => {
        console.log("Safety timeout triggered - report still loading after timeout");
        setIsReportLoading(false);
      }, 10000); // 10 second timeout

      return () => clearTimeout(safetyTimeout);
    }
  }, [isReportLoading]);

  // Static error page component
  const StaticErrorPage = ({ title, message }: { title: string; message: string }) => (
    <div className={`flex flex-col items-center justify-center h-full p-8 ${darkMode ? 'bg-[#1e1e1e]' : 'bg-background'}`}>
      <div className="flex flex-col items-center text-center max-w-md">
        <AlertCircle className="h-16 w-16 text-red-500 mb-4" />
        <h1 className={`text-3xl font-bold mb-2 ${darkMode ? 'text-[#d4d4d4]' : ''}`}>{title}</h1>
        <p className="text-muted-foreground mb-6">{message}</p>
        <div className="flex gap-4">
          {backToUrl && (
            <Link
              href={backToUrl}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
            >
              {backToLabel || "Back"}
            </Link>
          )}
          <Button
            onClick={() => {
              // Reset error state and try again
              setIframeError(false);
              setReportError(null);
              
              // Add a timestamp to force reload
              if (currentReportUrl) {
                const refreshedUrl = `${currentReportUrl}${currentReportUrl.includes('?') ? '&' : '?'}retry=true&t=${Date.now()}`;
                setCurrentReportUrl(refreshedUrl);
              }
            }}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Reload Report
          </Button>
        </div>
      </div>
    </div>
  );

  // Loading state when the test is running - prioritize this check
  if (isRunning) {
    return (
      <div className={containerClassName}>
        <div className={`w-full h-full flex items-center justify-center ${darkMode ? 'bg-[#1e1e1e]' : 'bg-background'}`}>
          <div className="flex flex-col items-center gap-2 text-muted-foreground -mt-20">
            <Loader2Icon className="h-12 w-12 animate-spin" />
            <p className="text-muted-foreground text-lg">Please wait, running test...</p>
          </div>
        </div>
      </div>
    );
  }

  // Empty state when no report is available - check this after isRunning
  if (!currentReportUrl) {
    return (
      <div className={`${containerClassName} flex items-center justify-center ${darkMode ? 'bg-[#1e1e1e]' : 'bg-background'}`}>
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <AlertCircle className="h-8 w-8" />
          <p>No report available</p>
        </div>
      </div>
    );
  }

  // Error state
  if (iframeError) {
    return (
      <StaticErrorPage
        title="Report Not Found"
        message={reportError || "Test results not found or have been removed."}
      />
    );
  }

  // Main report iframe with loading state
  return (
    <div className={containerClassName}>
      {isReportLoading && (
        <div className={`absolute inset-0 z-10 flex flex-col items-center justify-center -mt-16 text-muted-foreground ${darkMode ? 'bg-[#1e1e1e]' : 'bg-background'}`}>
          <Loader2Icon className={`h-12 w-12 animate-spin mb-3`} />
          <p className="text-lg">{loadingMessage}</p>
        </div>
      )}
      
      {isTraceLoading && !isReportLoading && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-muted-foreground bg-[#252526]">
          <Loader2Icon className="h-12 w-12 animate-spin mb-3" />
          <p className=" text-lg">Loading trace viewer...</p>
        </div>
      )}
      
      <iframe
        ref={iframeRef}
        key={currentReportUrl}
        src={currentReportUrl}
        className={`${iframeClassName} ${isReportLoading ? 'opacity-0' : ''}`}
        style={{ backgroundColor: darkMode ? '#1e1e1e' : undefined }}
        sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-downloads"
        allow="cross-origin-isolated"
        title="Playwright Test Report"
        onLoad={(e) => {
          const iframe = e.target as HTMLIFrameElement;
          try {
            // Check for JSON error response by examining body content
            if (iframe.contentWindow?.document.body.textContent) {
              const bodyText = iframe.contentWindow.document.body.textContent;
              
              // Check for JSON error response
              if (bodyText.includes('"error"') && bodyText.includes('"message"')) {
                try {
                  const errorData = JSON.parse(bodyText);
                  if (errorData.message) {
                    setReportError(errorData.message);
                    setIframeError(true);
                    setIsReportLoading(false);
                    return;
                  }
                } catch (e) {
                  // Not valid JSON, continue with normal display
                  console.error("Error parsing JSON:", e);
                }
              }
            }
            
            // Clear loading state
            setIsReportLoading(false);
            
            // Setup trace viewer detection
            const setupTraceDetection = () => {
              try {
                // Function to check if trace viewer is loaded
                const checkTraceLoaded = () => {
                  const traceViewerLoaded = iframe.contentWindow?.document.querySelector(
                    ".film-strip, .timeline-view, .network-request-grid"
                  );
                  
                  if (traceViewerLoaded) {
                    setIsTraceLoading(false);
                    return true;
                  }
                  return false;
                };
                
                // For the main HTML report, detect when trace viewer is clicked
                iframe.contentWindow?.document.addEventListener("click", (event) => {
                  // @ts-ignore - target property exists on the event
                  const target = event.target as HTMLElement;
                  
                  // Check if a trace link was clicked
                  const isTraceLink = target.closest("a[href*='trace']") || 
                                     (target.tagName === "A" && target.getAttribute("href")?.includes("trace"));
                  
                  if (isTraceLink) {
                    setIsTraceLoading(true);
                    
                    // Check frequently for the trace viewer to load
                    const quickCheck = setInterval(() => {
                      if (checkTraceLoaded()) {
                        clearInterval(quickCheck);
                      }
                    }, 100);
                    
                    // Safety timeout - assume loaded after 3 seconds
                    setTimeout(() => {
                      clearInterval(quickCheck);
                      setIsTraceLoading(false);
                    }, 3000);
                  }
                });
                
                // Also detect navigation using hashchange
                iframe.contentWindow?.addEventListener('hashchange', () => {
                  if (iframe.contentWindow?.location.hash.includes('trace')) {
                    setIsTraceLoading(true);
                    
                    // Use the same check mechanism for hashchange
                    const quickCheck = setInterval(() => {
                      if (checkTraceLoaded()) {
                        clearInterval(quickCheck);
                      }
                    }, 100);
                    
                    // Safety timeout
                    setTimeout(() => {
                      clearInterval(quickCheck);
                      setIsTraceLoading(false);
                    }, 2000);
                  }
                });
              } catch (err) {
                console.error("Error setting up trace detection:", err);
              }
            };
            
            // Run setup
            if (!isTraceLoading) {
              setupTraceDetection();
            }
          } catch (err) {
            console.error("Error processing iframe onLoad:", err);
            setIframeError(true);
            setReportError("An error occurred while displaying the report.");
            setIsReportLoading(false);
          }
        }}
        onError={(e) => {
          console.error("Error loading iframe:", e);
          setIframeError(true);
          
          // Try to fetch the URL to get a more specific error message
          const iframe = e.target as HTMLIFrameElement;
          if (iframe.src) {
            fetch(iframe.src)
              .then(response => {
                if (!response.ok) {
                  // Attempt to parse JSON error response
                  return response.json().catch(() => ({
                    message: `Failed to load report (${response.status} ${response.statusText})`
                  }));
                }
                return { message: "An unexpected error occurred while loading the report." };
              })
              .then(errorData => {
                setReportError(errorData.message || "Failed to load test report.");
              })
              .catch(() => {
                setReportError("Failed to load test report due to a network error.");
              });
          } else {
            setReportError("Test report URL is missing.");
          }
          
          setIsReportLoading(false);
        }}
      />
    </div>
  );
} 