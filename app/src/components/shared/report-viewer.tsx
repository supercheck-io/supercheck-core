import { useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2Icon, FileText } from "lucide-react";
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
  isFailedTest?: boolean;
  hideEmptyMessage?: boolean;
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
  isFailedTest = false,
  hideEmptyMessage = false,
}: ReportViewerProps) {
  const [isReportLoading, setIsReportLoading] = useState(!!reportUrl);
  const [reportError, setReportError] = useState<string | null>(null);
  const [iframeError, setIframeError] = useState(false);
  const [currentReportUrl, setCurrentReportUrl] = useState<string | null>(reportUrl);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  console.log("--- REPORT VIEWER RENDERING ---", { reportUrl, isRunning, isReportLoading, iframeError });

  // Update URL when prop changes
  useEffect(() => {
    console.log("ReportViewer: reportUrl changed:", reportUrl);
    if (reportUrl) {
      // Always ensure we have a timestamp parameter to prevent caching issues
      const formattedUrl = reportUrl.includes('?') ? 
        (reportUrl.includes('t=') ? reportUrl : `${reportUrl}&t=${Date.now()}`) : 
        `${reportUrl}?t=${Date.now()}`;
      
      const finalUrl = formattedUrl; // Use the timestamped URL directly
      
      console.log("ReportViewer: Setting currentReportUrl to:", finalUrl);
      setCurrentReportUrl(finalUrl);
      setIsReportLoading(true);
      setIframeError(false);
      setReportError(null);
    } else {
      console.log("ReportViewer: reportUrl is null or empty");
      setCurrentReportUrl(null);
    }
  }, [reportUrl]);

  // Safety timeout to prevent loading state from getting stuck
  useEffect(() => {
    if (isReportLoading) {
      console.log("ReportViewer: Setting safety timeout for report loading");
      const safetyTimeout = setTimeout(() => {
        console.log("ReportViewer: Safety timeout triggered - report still loading after timeout");
        setIsReportLoading(false);
        
        // If the iframe failed silently, set error state
        if (currentReportUrl && !iframeError) {
          console.log("ReportViewer: Setting iframe error due to timeout");
          setIframeError(true);
          setReportError("Report loading timed out. The report server might be unreachable.");
        }
      }, 10000); // 10 second timeout

      return () => {
        console.log("ReportViewer: Clearing safety timeout");
        clearTimeout(safetyTimeout);
      };
    }
  }, [isReportLoading, currentReportUrl, iframeError]);

  // Add new effect to force retry if report is stuck loading
  useEffect(() => {
    if (isReportLoading && currentReportUrl) {
      // Set a shorter timeout for initial retry
      const retryTimeout = setTimeout(() => {
        console.log("ReportViewer: Attempting auto-retry of report loading");
        // Add timestamp to force reload and bypass cache
        const refreshedUrl = `${currentReportUrl.split('?')[0]}?retry=true&t=${Date.now()}`;
        console.log("ReportViewer: Auto-retrying with URL:", refreshedUrl);
        setCurrentReportUrl(refreshedUrl);
      }, 5000); // 5 second timeout before retry

      return () => clearTimeout(retryTimeout);
    }
  }, [isReportLoading, currentReportUrl]);

  // Static error page component
  const StaticErrorPage = ({ title, message }: { title: string; message: string }) => (
    <div className={`flex flex-col items-center justify-center w-full h-full p-8 ${darkMode ? 'bg-[#1e1e1e]' : 'bg-background'}`}>
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
                console.log("ReportViewer: Reloading with URL:", refreshedUrl);
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
    console.log("ReportViewer: Test is running, showing running state");
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
  if (!currentReportUrl && !isRunning) {
    console.log("ReportViewer: No reportUrl and not running, showing empty state");
    return (
      <div className={containerClassName}>
        <div className={`w-full h-full flex items-center justify-center ${darkMode ? 'bg-[#1e1e1e]' : 'bg-background'}`}>
          <div className="flex flex-col items-center gap-3 text-muted-foreground -mt-[70px]">
            {!hideEmptyMessage && (
              <>
                <FileText className="h-10 w-10" />
                <p>Run the script to view the report</p>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (iframeError && !isRunning) {
    console.log("ReportViewer: Showing error state:", reportError);
    return (
      <div className={containerClassName}>
        <StaticErrorPage
          title="Report Not Found"
          message={reportError || "Test results not found or have been removed."}
        />
      </div>
    );
  }

  // Main report iframe with loading state
  console.log("ReportViewer: Rendering iframe with URL:", currentReportUrl);
  return (
    <div className={containerClassName}>
      {isReportLoading && (
        <div className={`absolute inset-0 z-10 flex flex-col items-center justify-center text-muted-foreground  ${darkMode ? 'bg-[#1e1e1e]' : 'bg-background'}`}>
          <Loader2Icon className={`h-12 w-12 animate-spin mb-3`} />
          <p className="text-lg">{loadingMessage}</p>
        </div>
      )}
      
      {!isRunning && currentReportUrl && (
        <iframe
          ref={iframeRef}
          key={currentReportUrl}
          src={currentReportUrl}
          className={`${iframeClassName} ${isReportLoading ? 'opacity-0' : ''}`}
          style={{ backgroundColor: darkMode ? '#1e1e1e' : undefined }}
          sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-downloads"
          title="Playwright Test Report"
          onLoad={(e) => {
            console.log("ReportViewer: iframe onLoad triggered for URL:", currentReportUrl);
            const iframe = e.target as HTMLIFrameElement;
            try {
              // Verify we can access the contentWindow - if not, it's likely a CORS issue
              if (!iframe.contentWindow) {
                console.error("ReportViewer: Cannot access iframe contentWindow - likely CORS issue");
                setReportError("Cannot load report due to security restrictions. The report may be on a different domain.");
                setIframeError(true);
                setIsReportLoading(false);
                return;
              }
              
              // Check for JSON error response by examining body content
              if (iframe.contentWindow?.document.body.textContent) {
                const bodyText = iframe.contentWindow.document.body.textContent;
                console.log("ReportViewer: iframe content body text:", bodyText.substring(0, 100) + (bodyText.length > 100 ? '...' : ''));
                
                // Check for error status codes in the URL or HTML
                if (iframe.contentDocument?.title?.includes("Error") || 
                    iframe.contentDocument?.title?.includes("404") ||
                    iframe.contentDocument?.title?.includes("Not Found")) {
                  console.error("ReportViewer: Error page detected in iframe");
                  setReportError("The test report could not be found. It may have been deleted or not generated properly.");
                  setIframeError(true);
                  setIsReportLoading(false);
                  return;
                }
                
                // Check for JSON error response
                if (bodyText.includes('"error"') && (bodyText.includes('"message"') || bodyText.includes('"details"'))) {
                  try {
                    const errorData = JSON.parse(bodyText);
                    const errorMessage = errorData.message || errorData.details || errorData.error || "Unknown error";
                    console.log("ReportViewer: Error in iframe content:", errorMessage);
                    setReportError(errorMessage);
                    setIframeError(true);
                    setIsReportLoading(false);
                    return;
                  } catch (e) {
                    // Not valid JSON, continue with normal display
                    console.error("ReportViewer: Error parsing JSON:", e);
                  }
                }
              }
              
              // Always clear loading state, even if we think there might be an issue
              console.log("ReportViewer: Load complete, clearing loading state");
              setIsReportLoading(false);
              
            } catch (loadError) {
              console.error("ReportViewer: Error in onLoad event:", loadError);
              setIsReportLoading(false);
              // Set error state on any unexpected error
              setReportError("Failed to load test report. Please try refreshing the page.");
              setIframeError(true);
            }
          }}
          onError={(e) => {
            console.error("ReportViewer: iframe onError triggered", e);
            setIsReportLoading(false);
            setReportError("Failed to load test report. The report server might be unreachable.");
            setIframeError(true);
          }}
        />
      )}
    </div>
  );
}