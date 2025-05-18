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
  hideEmptyMessage = false,
}: ReportViewerProps) {
  const [isReportLoading, setIsReportLoading] = useState(!!reportUrl);
  const [reportError, setReportError] = useState<string | null>(null);
  const [iframeError, setIframeError] = useState(false);
  const [currentReportUrl, setCurrentReportUrl] = useState<string | null>(reportUrl);
  const [isValidationError, setIsValidationError] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  console.log("--- REPORT VIEWER RENDERING ---", { reportUrl, isRunning, isReportLoading, iframeError, isValidationError });

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

      // Check if the URL exists, but don't call the callback here
      // The onReportError callback will be called by the safety timeout or iframe error handlers
      fetch(finalUrl, { method: 'HEAD' })
        .then(response => {
          if (!response.ok) {
            console.log("ReportViewer: Report URL returned status:", response.status);
            if (response.status === 404) {
              console.log("ReportViewer: Report not found (404), setting error state");
              setIsReportLoading(false);
              setIframeError(true);
              setReportError("The test report could not be found.");
              // Don't call onReportError here to prevent redirect loops
            }
          }
        })
        .catch(error => {
          console.error("ReportViewer: Error pre-checking report URL:", error);
          setIsReportLoading(false);
          setIframeError(true);
          setReportError("Failed to load test report. The report server might be unreachable.");
          // Don't call onReportError here to prevent redirect loops
        });
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
              // Reload the entire page instead of just adding parameters to a broken URL
              window.location.reload();
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
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Loader2Icon className="h-12 w-12 animate-spin" />
            <p className="text-muted-foreground text-lg">Please wait, running script...</p>
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

  // Error state - only show if it's not a validation error
  if (iframeError && !isRunning && !isValidationError) {
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
      
      <div className="flex flex-col h-full w-full">
        {!isRunning && currentReportUrl && (
          <iframe
            ref={iframeRef}
            key={currentReportUrl}
            src={currentReportUrl}
            className={`${iframeClassName} ${isReportLoading ? 'opacity-0' : ''} ${isValidationError ? 'h-4/5 flex-grow' : 'h-full'}`}
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
                  setIsValidationError(false);
                  setIsReportLoading(false);
                  return;
                }
                
                // Check for JSON error response by examining body content
                if (iframe.contentWindow?.document.body.textContent) {
                  const bodyText = iframe.contentWindow.document.body.textContent;
                  const pageTitle = iframe.contentDocument?.title || '';
                  console.log("ReportViewer: iframe content body text:", bodyText.substring(0, 100) + (bodyText.length > 100 ? '...' : ''));
                  console.log("ReportViewer: iframe title:", pageTitle);
                  
                  // Check for validation error page - allow these to display normally
                  if (pageTitle.includes("Validation Error") || bodyText.includes("Test Validation Failed")) {
                    console.log("ReportViewer: Validation error page detected - displaying content");
                    setIsValidationError(true);
                    setIframeError(false);
                    setIsReportLoading(false);
                    return;
                  }
                  
                  // Check for other error status codes in the URL or HTML
                  if (iframe.contentDocument?.title?.includes("Error") || 
                      iframe.contentDocument?.title?.includes("404") ||
                      iframe.contentDocument?.title?.includes("Not Found")) {
                    console.error("ReportViewer: Error page detected in iframe");
                    setReportError("The test report could not be found.");
                    setIframeError(true);
                    setIsValidationError(false);
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
                      setIsValidationError(false);
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
        
        {isValidationError && !isReportLoading && (
          <div className={`px-6 py-4 ${darkMode ? 'bg-[#1e1e1e] text-[#d4d4d4]' : 'bg-background'} border-t ${darkMode ? 'border-gray-800' : 'border-gray-200'}`}>
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              <h3 className="text-base font-medium">Action Required</h3>
            </div>
            <p className="text-sm">Please edit the script to fix the validation error shown above. You cannot run the script until this issue is resolved.</p>
          </div>
        )}
      </div>
    </div>
  );
}