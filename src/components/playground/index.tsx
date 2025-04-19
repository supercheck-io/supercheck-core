"use client";
import React, { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { CodeEditor } from "./code-editor";
import { TestForm } from "./test-form";
import { LoadingOverlay } from "./loading-overlay";
import { TestPriority, TestType } from "@/db/schema";
import {
  FileTextIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  Loader2Icon,
  ZapIcon,
  AlertCircle,
  Code2Icon
} from "lucide-react";
import * as z from "zod";
import type { editor } from "monaco-editor";
import type { ScriptType } from "@/lib/script-service";

// Define our own TestCaseFormData interface
interface TestCaseFormData {
  title: string;
  description: string | null;
  priority: TestPriority;
  type: TestType;
  script?: string;
  updatedAt?: string | null;
  createdAt?: string | null;
}

interface PlaygroundProps {
  initialTestData?: {
    id?: string;
    title: string;
    description: string | null;
    script: string;
    priority: TestPriority;
    type: TestType;
    updatedAt?: string;
    createdAt?: string;
  };
  initialTestId?: string;
}

const Playground: React.FC<PlaygroundProps> = ({
  initialTestData,
  initialTestId,
}) => {
  const [activeTab, setActiveTab] = useState<string>("editor");
  const [isRunning, setIsRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isReportLoading, setIsReportLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [reportUrl, setReportUrl] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [iframeError, setIframeError] = useState(false);
  const [isTraceLoading, setIsTraceLoading] = useState(false);
  const [isTransitionLoading, setIsTransitionLoading] = useState(false);
  // Only set testId from initialTestId if we're on a specific test page
  // Always ensure testId is null when on the main playground page
  const [testId, setTestId] = useState<string | null>(initialTestId || null);
  const [editorContent, setEditorContent] = useState(
    initialTestData?.script || ""
  );
  const [initialEditorContent, setInitialEditorContent] = useState(
    initialTestData?.script || ""
  );
  const [initialFormValues, setInitialFormValues] = useState<
    Partial<TestCaseFormData>
  >(
    initialTestData
      ? {
          title: initialTestData.title,
          description: initialTestData.description,
          priority: initialTestData.priority,
          type: initialTestData.type,
          updatedAt: initialTestData.updatedAt || undefined,
          createdAt: initialTestData.createdAt || undefined,
        }
      : {}
  );
  const [testCase, setTestCase] = useState<TestCaseFormData>({
    title: initialTestData?.title || "",
    description: initialTestData?.description || "",
    priority: initialTestData?.priority || ("medium" as TestPriority),
    type: initialTestData?.type || ("browser" as TestType),
    script: initialTestData?.script || "",
    updatedAt: initialTestData?.updatedAt || undefined,
    createdAt: initialTestData?.createdAt || undefined,
  });

  // Create empty errors object for TestForm
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Track test runs
  const [testIds, setTestIds] = useState<string[]>([]);
  const [completedTestIds, setCompletedTestIds] = useState<string[]>([]);

  // Editor reference
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const searchParams = useSearchParams();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Reset testId when on the main playground page
  useEffect(() => {
    if (window.location.pathname === "/playground") {
      setTestId(null);
    }

    // Set pageLoading to false after a short delay to ensure UI is ready
    const timer = setTimeout(() => {
      setPageLoading(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  // Load test data if testId is provided
  useEffect(() => {
    if (initialTestId) {
      loadTestById(initialTestId);
    }
  }, [initialTestId]);

  // Function to load a test by ID
  const loadTestById = async (id: string) => {
    try {
      setLoading(true);

      // Import the getTest function
      const { getTest } = await import("@/actions/get-test");

      // Fetch the test data
      const result = await getTest(id);

      if (result.success && result.test) {
        // Update the test case data
        setTestCase({
          title: result.test.title,
          description: result.test.description,
          priority: result.test.priority as TestPriority,
          type: result.test.type as TestType,
          updatedAt: result.test.updatedAt ? result.test.updatedAt.toISOString() : null,
          createdAt: result.test.createdAt ? result.test.createdAt.toISOString() : null,
        });

        // Update the editor content
        setEditorContent(result.test.script);
        setInitialEditorContent(result.test.script);

        // Update the form values
        setInitialFormValues({
          title: result.test.title,
          description: result.test.description,
          priority: result.test.priority as TestPriority,
          type: result.test.type as TestType,
          updatedAt: result.test.updatedAt ? result.test.updatedAt.toISOString() : null,
          createdAt: result.test.createdAt ? result.test.createdAt.toISOString() : null,
        });

        // Set the test ID
        setTestId(id);
      } else {
        console.error("Failed to load test:", result.error);
        toast.error("Error loading test", {
          description: "Failed to load test details. Please try again later.",
        });
      }
    } catch (error) {
      console.error("Error loading test:", error);
      toast.error("Error", {
        description: "Failed to load test details. Please try again later.",
      });
    } finally {
      setLoading(false);
    }
  };

  // Monitor URL search params changes and potentially load scripts/set type
  useEffect(() => {
    // console.log("[Playground Effect] Running effect. initialTestId:", initialTestId);
    const scriptTypeParam = searchParams.get("scriptType") as TestType | null;
    // console.log("[Playground Effect] scriptTypeParam from URL:", scriptTypeParam);

    if (!initialTestId) {
      // console.log("[Playground Effect] No initialTestId, proceeding to set default type/script.");
      setTestId(null);

      const defaultType = "browser" as TestType;
      const typeToSet =
        scriptTypeParam &&
        ["browser", "api", "multistep", "database"].includes(scriptTypeParam)
          ? scriptTypeParam
          : defaultType;

      // console.log("[Playground Effect] Determined typeToSet:", typeToSet);
      setTestCase((prev) => ({ ...prev, type: typeToSet }));

      const loadScriptForType = async () => {
        // console.log("[Playground Effect] loadScriptForType called with type:", typeToSet);
        if (typeToSet) {
          try {
            const { getSampleScript } = await import("@/lib/script-service");
            const scriptContent = getSampleScript(typeToSet as ScriptType);
            // console.log("[Playground Effect] Content from getSampleScript:", scriptContent);
            if (scriptContent === null || scriptContent === undefined) {
              //  console.error("[Playground Effect] getSampleScript returned null or undefined for type:", typeToSet);
            }
            setEditorContent(scriptContent || ""); // Ensure we set empty string if null/undefined
            setInitialEditorContent(scriptContent || "");
            setTestCase((prev) => ({ ...prev, script: scriptContent || "" }));
            // console.log("[Playground Effect] State updated with script content.");
          } catch {
            // console.error("[Playground Effect] Error loading default script:", error);
            toast.error("Failed to load default script content.");
          }
        }
      };
      loadScriptForType();
    }
  }, [searchParams, initialTestId]);

  // Handle initialTestData when provided from server-side
  useEffect(() => {
    if (initialTestData) {
      // If we have initial test data from the server, use it
      console.log("Using initial test data:", initialTestData);

      // Update the initial form values to match the loaded test
      setInitialFormValues({
        title: initialTestData.title,
        description: initialTestData.description || undefined,
        priority: initialTestData.priority,
        type: initialTestData.type,
        updatedAt: initialTestData.updatedAt || undefined,
        createdAt: initialTestData.createdAt || undefined,
      });
    }
  }, [initialTestData]);

  // Force Monaco editor to initialize on client side even with script params
  useEffect(() => {
    // This triggers a re-render once on the client side to ensure Monaco loads
    const timer = setTimeout(() => {
      if (typeof window !== "undefined" && !editorRef.current) {
        // Force a re-render by making a small state update
        setEditorContent((prev) => prev);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (editor) {
      const model = editor.getModel();
      if (model) {
        const disposable = model.onDidChangeContent(() => {
          const value = editor.getValue() || "";
          setEditorContent(value);
          // Keep code and script fields in sync
          setTestCase((prev: TestCaseFormData) => ({
            ...prev,
            script: value,
          }));
        });
        return () => disposable.dispose();
      }
    }
  }, []);

  const validateForm = () => {
    try {
      console.log("Validating form with testCase:", testCase);
      console.log("Current editor content length:", editorContent.length);

      // Before validation, ensure script field is synced with code field
      // and handle null description
      const validationData = {
        ...testCase,
        script: editorContent,
        description: testCase.description || "", // Convert null to empty string for validation
      };

      console.log("Validation data:", validationData);

      const newErrors: Record<string, string> = {};

      // Validate title
      if (!validationData.title || validationData.title.trim() === "") {
        newErrors.title = "Title is required";
      }

      // Validate description - make it mandatory
      if (!validationData.description || validationData.description.trim() === "") {
        newErrors.description = "Description is required";
      }

      // Validate script
      if (!validationData.script || validationData.script.trim() === "") {
        newErrors.script = "Test script is required";
      }

      // Validate type - explicit check for missing type without comparing to empty string
      if (!validationData.type) {
        newErrors.type = "Test type is required";
      }

      // Validate priority - explicit check for missing priority without comparing to empty string
      if (!validationData.priority) {
        newErrors.priority = "Priority is required";
      }

      // Set errors state
      setErrors(newErrors);
      
      // Return true if no errors
      return Object.keys(newErrors).length === 0;
    } catch (error) {
      console.error("Error validating form:", error);
      if (error instanceof z.ZodError) {
        const formattedErrors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            formattedErrors[err.path[0] as string] = err.message;
          }
        });
        setErrors(formattedErrors);
      }
      return false;
    }
  };

  const runPlaywrightTest = async () => {
    setIsRunning(true);
    setIsReportLoading(true);
    setActiveTab("report");
    setReportUrl(null);
    setIframeError(false);
    setReportError(null);

    // Use a unique ID for the loading toast so we can specifically dismiss it
    const loadingToastId = toast.loading("Running test...", {
      description: "This may take a few moments to complete.",
    });

    try {
      // Prepare the request body with the current editor content
      const testData = {
        ...testCase,
        script: editorContent, // Use the current editor content
      };

      const response = await fetch("/api/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(testData),
      });

      if (!response.ok) {
        throw new Error(`Failed to run test: ${response.statusText}`);
      }

      const result = await response.json();

      // Set report URL and test IDs regardless of success or failure
      if (result.reportUrl && result.testId) {
        // Use the testId returned from the API
        const apiTestId = result.testId;

        // Add to the list of running tests
        setTestIds((prev: string[]) => [...prev, apiTestId]);

        // Setup SSE for real-time status updates
        let eventSourceClosed = false;
        const eventSource = new EventSource(`/api/test-status/sse/${apiTestId}`);
        
        eventSource.onmessage = (event) => {
          const data = JSON.parse(event.data);
          
          if (data.status === "completed") {
            // Test is completed
            if (!eventSourceClosed) {
              eventSource.close();
              eventSourceClosed = true;
            }
            
            // Dismiss the loading toast
            toast.dismiss(loadingToastId);
            
            // Mark this test as completed
            setCompletedTestIds((prev: string[]) => [...prev, apiTestId]);
            
            // Show appropriate toast based on success/failure
            if (data.success) {
              toast.success("Test completed successfully", {
                duration: 5000,
              });
            } else {
              toast.error("Test failed", {
                description: "The test execution encountered an error",
                duration: 5000,
              });
            }
            
            // Set the report URL immediately without any delay and clear loading states
            const refreshedUrl = `${result.reportUrl}?t=${Date.now()}`;
            setReportUrl(refreshedUrl);
            
            // Verify the report exists before clearing loading states
            fetch(refreshedUrl)
              .then(response => {
                if (!response.ok) {
                  return response.json().then(errorData => {
                    // Handle the error response
                    setReportError(errorData.message || "Test results not found");
                    setIframeError(true);
                  }).catch(() => {
                    // If we can't parse JSON, still show an error
                    setReportError("Test results not found");
                    setIframeError(true);
                  });
                }
                // If response is OK, don't show error
                return null;
              })
              .catch(() => {
                // Network error or other issue
                setReportError("Failed to load test results");
                setIframeError(true);
              })
              .finally(() => {
                // Clear loading states
                setIsReportLoading(false);
                setIsRunning(false);
              });
          }
        };
        
        eventSource.onerror = () => {
          // If there's an error with the SSE connection
          if (!eventSourceClosed) {
            eventSource.close();
            eventSourceClosed = true;
            
            console.error("Error with SSE connection - checking status directly");
            
            // Check the status directly via API
            fetch(`/api/test-status/${apiTestId}`)
              .then(response => response.json())
              .then(data => {
                if (data.status === "completed") {
                  // Test completed but we missed the SSE event
                  toast.dismiss(loadingToastId);
                  
                  // Set report URL immediately
                  const refreshedUrl = `${data.reportUrl || result.reportUrl}?t=${Date.now()}`;
                  setReportUrl(refreshedUrl);
                  
                  // Check if report exists
                  checkIfReportExists(refreshedUrl, apiTestId);
                } else {
                  // Test is still running, wait a bit then set the URL
                  setTimeout(() => {
                    const refreshedUrl = `${result.reportUrl}?t=${Date.now()}`;
                    setReportUrl(refreshedUrl);
                    toast.dismiss(loadingToastId);
                  }, 500);
                }
              })
              .catch(() => {
                // If status check fails, just set the report URL
                const refreshedUrl = `${result.reportUrl}?t=${Date.now()}`;
                setReportUrl(refreshedUrl);
                toast.dismiss(loadingToastId);
              });
          }
        };
        
        // Helper function to check if report exists
        const checkIfReportExists = (url: string, tId: string) => {
          // Don't verify report existence, assume it's available
          setIsReportLoading(false);
          setIsRunning(false);
        };
        
        // Add a safety timeout to clear loading states after 10 seconds
        setTimeout(() => {
          setIsReportLoading(false);
          setIsRunning(false);
        }, 10000);
        
        // Cleanup function to close SSE connection
        return () => {
          if (!eventSourceClosed) {
            eventSource.close();
            eventSourceClosed = true;
          }
        };
      } else {
        // If we didn't get a report URL or test ID, something went wrong
        toast.dismiss(loadingToastId);
        setIsReportLoading(false);
        setIsRunning(false);
        
        // Check for errors first
        if (result.error) {
          console.error("Test execution error:", result.error);

          // Always show a user-friendly message regardless of the actual error
          toast.error("Test Execution Failed", {
            description: "The test encountered an error during execution. Please check your test script and try again.",
            duration: 5000,
          });
        } else {
          toast.error("Test Execution Issue", {
            description: "Could not retrieve test report URL.",
            duration: 5000,
          });
        }
      }
    } catch (error) {
      // Dismiss the loading toast
      toast.dismiss(loadingToastId);
      setIsReportLoading(false);
      setIsRunning(false);
      console.error("Error running test:", error);
      toast.error("Test Execution Error", {
        description:
          "Unable to run the test at this time. Please try again later.",
      });
    }
  };

  // Add a function to select a specific test report to view
  const selectTestReport = (testId: string) => {
    // Reset any existing error states
    setIframeError(false);
    setReportError(null);
    
    // Show transition loading state
    setIsTransitionLoading(true);
    
    // Add a delay for smooth transition
    setTimeout(() => {
      // Construct the report URL with the API path, using the 'tests' prefix
      const reportUrlWithCache = `/api/test-results/tests/${testId}/report/index.html?t=${Date.now()}`;

      // Update state
      setReportUrl(reportUrlWithCache);
      setIsTransitionLoading(false);

      // Switch to report tab
      setActiveTab("report");

      console.log(
        `Selected test report: ${testId}, setting URL to ${reportUrlWithCache}`
      );
    }, 200);
  };

  // Add UI elements to show running and completed tests
  const TestsList = () => {
    if (testIds.length === 0) {
      return null;
    }

    return (
      <div className="mb-4">
        <h4 className="text-sm font-medium mb-2">Test Runs</h4>
        <div className="flex flex-wrap gap-2">
          {testIds.map((id) => {
            const isCompleted = completedTestIds.includes(id);
            const isActive = reportUrl?.includes(id);

            return (
              <Button
                key={id}
                variant={isActive ? "default" : "outline"}
                size="sm"
                className={`text-xs ${
                  isCompleted && !isActive ? "opacity-70" : ""
                }`}
                onClick={() => selectTestReport(id)}
              >
                <span className="flex items-center">
                  <CheckCircleIcon className="mr-1 h-3 w-3" />
                  {id.replace("run-", "").substring(0, 8)}...
                </span>
              </Button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <>
      <LoadingOverlay isVisible={pageLoading} />
      <div
        className={
          pageLoading
            ? "opacity-0"
            : "opacity-100 transition-opacity duration-300"
        }
      >
        <div className="md:hidden">{/* Mobile view */}</div>
        <div className="hidden h-full flex-col flex-1 md:flex p-4">
          <ResizablePanelGroup direction="horizontal" className="h-screen">
            <ResizablePanel defaultSize={70} minSize={30}>
              <div className="flex h-full flex-col">
                <div className="flex items-center justify-between border-b bg-card p-4 py-2 rounded-tl-lg">
                  <div className="flex items-center gap-8">
                    {/* Playground */}
                    <Tabs value={activeTab} onValueChange={setActiveTab}>
                      <TabsList className="grid w-[400px] grid-cols-2">
                        <TabsTrigger
                          value="editor"
                          className="flex items-center gap-2"
                        >
                          <Code2Icon className="h-4 w-4" />
                          <span>Editor</span>
                        </TabsTrigger>
                        <TabsTrigger
                          value="report"
                          className="flex items-center gap-2"
                        >
                          <FileTextIcon className="h-4 w-4" />
                          <span>Report</span>
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                  <Button
                    onClick={runPlaywrightTest}
                    disabled={isRunning}
                    className="flex items-center gap-2 bg-[hsl(221.2,83.2%,53.3%)] text-white hover:bg-[hsl(221.2,83.2%,48%)] "
                    size="sm"
                  >
                    {isRunning ? (
                      <>
                        <Loader2Icon className="h-4 w-4 animate-spin" />
                        <span className="mr-2">Running...</span>
                      </>
                    ) : (
                      <>
                        <ZapIcon className="h-4 w-4" />
                        <span className="mr-2">Run Script </span>
                      </>
                    )}
                  </Button>
                </div>

                <div className="flex-1 overflow-hidden rounded-bl-lg">
                  <Tabs
                    value={activeTab}
                    onValueChange={setActiveTab}
                    className="h-full"
                  >
                    <TabsContent
                      value="editor"
                      className="h-full border-0 p-0 mt-0 relative"
                    >
                      <div className="h-full flex flex-col">
                        <div className="h-full">
                          <CodeEditor
                            value={editorContent}
                            onChange={(value) => {
                              setEditorContent(value || "");
                            }}
                            ref={editorRef}
                          />
                        </div>
                      </div>
                    </TabsContent>
                    <TabsContent
                      value="report"
                      className="h-screen border-0 p-0 mt-0"
                    >
                      {isRunning || isReportLoading ? (
                        <div className="flex h-[calc(100vh-10rem)] items-center justify-center bg-[#1e1e1e]">
                          <div className="flex flex-col items-center gap-2 text-[#d4d4d4]">
                            <Loader2Icon className="h-8 w-8 animate-spin" />
                            <p>Please wait, running test...</p>
                          </div>
                        </div>
                      ) : isTransitionLoading ? (
                        <div className="flex flex-col h-[calc(100vh-10rem)] items-center justify-center bg-[#1e1e1e]">
                          <Loader2Icon className="h-12 w-12 animate-spin text-white mb-3" />
                          <p className="text-white">Loading report...</p>
                        </div>
                      ) : reportUrl ? (
                        iframeError ? (
                          <div className="flex h-[calc(100vh-10rem)] flex-col items-center justify-center bg-[#1e1e1e]">
                            <div className="flex flex-col items-center text-center max-w-md -mt-20">
                              <AlertCircle className="h-16 w-16 text-red-500 mb-4" />
                              <h1 className="text-3xl font-bold mb-2 text-[#d4d4d4]">Test Results Not Found</h1>
                              <p className="text-muted-foreground mb-6">
                                {reportError || "The test results you're looking for don't exist or have been removed."}
                              </p>
                              <div className="flex gap-4">
                                <Button
                                  onClick={() => {
                                    // Reset error state and try again
                                    setIframeError(false);
                                    setReportError(null);
                                    
                                    // Add a timestamp to force reload
                                    const refreshedUrl = `${reportUrl}${reportUrl.includes('?') ? '&' : '?'}retry=true&t=${Date.now()}`;
                                    setReportUrl(refreshedUrl);
                                  }}
                                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                                >
                                  Reload Report
                                </Button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="report-iframe-wrapper h-[calc(100vh-10rem)] w-full relative">
                            {/* Remove the loading overlay with text, keep only trace loading overlay */}
                            {isTraceLoading && (
                              <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1e1e1e] bg-opacity-90 z-20">
                                <Loader2Icon className="h-12 w-12 animate-spin text-white mb-3" />
                                <p className="text-white">Loading trace viewer...</p>
                              </div>
                            )}
                            <iframe
                              ref={iframeRef}
                              key={reportUrl}
                              src={reportUrl}
                              className="h-[calc(100vh-10rem)] w-full opacity-0"
                              style={{ backgroundColor: "#1e1e1e" }}
                              sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-downloads"
                              allow="cross-origin-isolated"
                              onLoad={async (e) => {
                                const iframe = e.target as HTMLIFrameElement;
                                try {
                                  // **New:** Fetch the source first to check content type
                                  const response = await fetch(iframe.src);

                                  if (!response.ok || response.headers.get("Content-Type")?.includes("application/json")) {
                                    // Treat non-OK or JSON response as an error
                                    console.log("iframe loaded non-HTML content, treating as error.", response.status, response.headers.get("Content-Type"));
                                    setIframeError(true);
                                    try {
                                      const errorData = await response.json();
                                      setReportError(errorData.message || `Failed to load report (${response.status})`);
                                    } catch {
                                      setReportError(`Failed to load report (${response.status})`);
                                    }
                                    setIsReportLoading(false);
                                    setIsRunning(false);
                                    return; // Stop further processing
                                  }

                                  // If we got here, it's likely HTML - proceed with original logic
                                  const doc = iframe.contentWindow?.document;
                                  if (!doc || !doc.body) {
                                    // This case might still happen for unexpected errors
                                    throw new Error("Cannot access iframe content document.");
                                  }
                                  
                                  // Show the iframe immediately
                                  iframe.classList.remove('opacity-0');
                                  
                                  // Setup detection for trace viewer loading events with simplified approach
                                  const setupTraceDetection = () => {
                                    try {
                                      // Listen for clicks on trace links with improved detection
                                      iframe.contentWindow?.document.body.addEventListener('click', (event) => {
                                        const target = event.target as HTMLElement;
                                        const traceLink = target.closest('a[href*="trace"]') || 
                                                        target.closest('button[data-testid*="trace"]') ||
                                                        (target.textContent?.toLowerCase().includes('trace') ? target : null);
                                        
                                        if (traceLink) {
                                          setIsTraceLoading(true);
                                          
                                          // Use a shorter timeout for trace loading to match run details page
                                          setTimeout(() => {
                                            setIsTraceLoading(false);
                                          }, 200);  // Reduced from 2000ms to 1000ms
                                        }
                                      }, true);
                                    } catch (err) {
                                      console.error("Error setting up trace detection:", err);
                                    }
                                  };
                                  
                                  // Setup trace detection immediately
                                  setupTraceDetection();
                                  
                                  // Clear loading states when iframe loads successfully
                                  setIsReportLoading(false);
                                  setIsRunning(false);

                                } catch (err) {
                                  console.error("Error processing iframe onLoad:", err);
                                  // Fallback: Trigger error display if any part of onLoad fails after fetch
                                  setIframeError(true);
                                  setReportError("An error occurred while displaying the report."); 
                                  setIsReportLoading(false);
                                  setIsRunning(false);
                                }
                              }}
                              onError={(e) => {
                                console.error("Error loading iframe:", e);
                                
                                // Immediately set the error state to show the formatted error UI
                                setIframeError(true);

                                // Try to fetch the URL to get a more specific error message, but don't block UI on this
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
                                      // If response is somehow OK but still errored, return a generic message
                                      return { message: "An unexpected error occurred while loading the report." }; 
                                    })
                                    .then(errorData => {
                                      // Set the specific error message if available
                                      setReportError(errorData.message || "Failed to load test report.");
                                    })
                                    .catch(() => {
                                      // Fallback error message if fetch fails
                                      setReportError("Failed to load test report due to a network error.");
                                    });
                                } else {
                                  // Fallback if src is somehow unavailable
                                  setReportError("Test report URL is missing.");
                                }
                                
                                // Ensure loading states are cleared
                                setIsReportLoading(false);
                                setIsRunning(false);
                              }}
                            />
                          </div>
                        )
                      ) : (
                        <div className="flex h-[calc(100vh-10rem)] items-center justify-center bg-[#1e1e1e]">
                          <div className="flex flex-col items-center gap-2 text-[#d4d4d4]">
                            <FileTextIcon className="h-8 w-8" />
                            <p>Run a test to see the HTML report</p>
                          </div>
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                </div>
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel
              defaultSize={30}
              minSize={20}
              className="rounded-br-lg rounded-tr-lg"
            >
              <div className="flex h-full flex-col border rounded-tr-lg rounded-br-lg">
                <div className="flex items-center justify-between border-b bg-card px-4 py-2 rounded-tr-lg">
                  <div className="flex items-center">
                    <h3 className="text-sm font-medium">Test Details</h3>
                  </div>
                </div>
                <ScrollArea className="flex-1">
                  <div className="space-y-3 p-4">
                    <div className="space-y-3">{TestsList()}</div>
                    <TestForm
                      testCase={testCase}
                      setTestCase={setTestCase}
                      editorContent={editorContent}
                      isRunning={isRunning}
                      setInitialEditorContent={setInitialEditorContent}
                      initialFormValues={initialFormValues}
                      initialEditorContent={initialEditorContent}
                      testId={testId}
                      errors={errors}
                      validateForm={validateForm}
                    />
                  </div>
                </ScrollArea>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
        {loading && (
          <div className="fixed top-0 left-0 right-0 bottom-0 bg-[#1e1e1e] flex items-center justify-center">
            <Loader2Icon className="h-8 w-8 animate-spin" />
          </div>
        )}
      </div>
    </>
  );
};

export default Playground;
