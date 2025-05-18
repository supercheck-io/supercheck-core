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
import { TestPriority, TestType } from "@/db/schema/schema";
import {
  FileTextIcon,
  Loader2Icon,
  ZapIcon,
  Code2Icon,
  Text
} from "lucide-react";
import * as z from "zod";
import type { editor } from "monaco-editor";
import type { ScriptType } from "@/lib/script-service";
import { ReportViewer } from "@/components/shared/report-viewer";

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
  // Only set testId from initialTestId if we're on a specific test page
  // Always ensure testId is null when on the main playground page
  const [testId, setTestId] = useState<string | null>(initialTestId || null);
  const [completedTestIds, setCompletedTestIds] = useState<string[]>([]);
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

  // Editor reference
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const searchParams = useSearchParams();

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

  const runTest = async () => {
    if (isRunning) {
      toast.warning("A script is already running", {
        description: "Please wait for the current script to complete, or cancel it before running a new script.",
      });
      return;
    }

    setIsRunning(true);

    // Show a loading toast to indicate that the test is running
    const loadingToastId = toast.loading(`Executing script${testId ? `: ${testCase.title.length > 25 ? testCase.title.substring(0, 25) + '...' : testCase.title}` : ''}`, {
      description: "Script execution is in progress...",
      duration: Infinity, // Keep this visible until execution completes
    });

    try {
      console.log("Sending test data to API:", { id: testId, script: editorContent });
      
      // Execute the test by sending the current script content to the API
      const res = await fetch(`/api/test`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: testId,
          script: editorContent,
        }),
      });

      // Parse the response
      const result = await res.json();
      
      console.log("API response:", result);

      // If we successfully started a test and got back the needed test info
      if (res.ok && result.testId && result.reportUrl) {
        // No need for success toast here - the loading toast is already shown
        // We'll keep the loading toast until we get the final status update

        // Set the report URL to display the test results
        setReportUrl(result.reportUrl);
        
        // Switch to the report tab
        setActiveTab("report");

        // Set up Server-Sent Events (SSE) to get real-time status updates
        console.log("Setting up SSE connection to:", `/api/test-status/sse/${result.testId}`);
        const eventSource = new EventSource(`/api/test-status/sse/${result.testId}`);
        let eventSourceClosed = false;

        // Handle status updates from the SSE endpoint
        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data) {
              console.log("SSE event:", data);
              
              // Check if data includes status field
              if (data.status) {
                // Normalize status value for consistency
                const normalizedStatus = data.status.toLowerCase();
                
                // Handle status - this could update a state variable to show in UI
                if (normalizedStatus === "completed" || 
                    normalizedStatus === "passed" || 
                    normalizedStatus === "failed" || 
                    normalizedStatus === "error") {
                  // Test is done, update the UI
                  setIsRunning(false);
                  setIsReportLoading(false);
                  
                  // Close the SSE connection
                  eventSource.close();
                  eventSourceClosed = true;
                  
                  // Construct the relative API report URL, don't use the direct S3 URL from data
                  if (result.testId) { // Ensure we have the testId from the initial API call
                    const apiUrl = `/api/test-results/${result.testId}/report/index.html?t=${Date.now()}&forceIframe=true`;
                    console.log(`Test ${normalizedStatus}: Setting report URL to API path: ${apiUrl}`);
                    setReportUrl(apiUrl); // Use the relative API path
                    
                    // Always stay on report tab and ensure we're viewing the report
                    setActiveTab("report");

                    // Add test ID to the list of completed tests
                    if (result.testId && !completedTestIds.includes(result.testId)) {
                      setCompletedTestIds(prev => [...prev, result.testId]);
                    }
                  } else {
                     console.error("Cannot construct report URL: testId from initial API call is missing.");
                     toast.error("Error displaying report", { description: "Could not determine the test ID to load the report." });
                  }
                  
                  // Determine if it was a success or failure for the toast
                  const isSuccess = normalizedStatus === "completed" || normalizedStatus === "passed";
                  
                  // Dismiss loading toast and show completion toast
                  toast.dismiss(loadingToastId);
                  toast[isSuccess ? "success" : "error"](
                    isSuccess ? "Script execution passed" : "Script execution failed",
                    { 
                      description: isSuccess 
                        ? "All checks completed successfully." 
                        : "Test did not complete successfully.",
                      duration: 10000 
                    }
                  );
                }
              }
            }
          } catch (e) {
            console.error("Error parsing SSE event:", e, "Raw event data:", event.data);
          }
        };

        // Handle SSE errors
        eventSource.onerror = (e) => {
          console.error("SSE connection error:", e);
          // Fallback for SSE errors - just set not running
          setIsRunning(false);
          setIsReportLoading(false);
          
          // Dismiss the loading toast
          toast.dismiss(loadingToastId);
          
          // Show error toast
          toast.error("Test execution error", {
            description: "Connection to test status updates was lost. The test may still be running in the background.",
            duration: 5000,
          });
          
          if (!eventSourceClosed) {
            eventSource.close();
            eventSourceClosed = true;
            
            // Try to load the report anyway using the API path if testId is available
            if (result.testId) {
               const apiUrl = `/api/test-results/${result.testId}/report/index.html?t=${Date.now()}&forceIframe=true`;
              console.log(`SSE error fallback: Setting report URL to API path: ${apiUrl}`);
              setReportUrl(apiUrl); // Use the relative API path
              setActiveTab("report");
            } else {
               console.error("SSE error fallback: Cannot construct report URL: testId from initial API call is missing.");
            }
          }
        };
      } else {
        // If we didn't get a report URL or test ID, something went wrong
        toast.dismiss(loadingToastId);
        setIsReportLoading(false);
        setIsRunning(false);
        
        // Check for errors first
        if (result.error) {
          console.error("Script execution error:", result.error);

          // Always show a user-friendly message regardless of the actual error
          toast.error("Script Execution Failed", {
            description: result.error || "The test encountered an error during execution. Please check your test script and try again.",
            duration: 5000,
          });
        } else {
          console.error("API response missing required fields:", result);
          toast.error("Script Execution Issue", {
            description: "Could not retrieve test report URL.",
            duration: 5000,
          });
        }
      }
    } catch (error) {
      console.error("Error running test:", error);
      toast.dismiss(loadingToastId);
      toast.error("Error running test", {
        description: error instanceof Error ? error.message : "Unknown error",
        duration: 5000,
      });
      setIsRunning(false);
    }
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
                    onClick={runTest}
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
                      <ReportViewer
                        reportUrl={reportUrl}
                        isRunning={isRunning || isReportLoading}
                        containerClassName="h-[calc(100vh-10rem)] w-full relative"
                        iframeClassName="h-[calc(100vh-10rem)] w-full"
                        darkMode={true}
                      />
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
                <div className="flex items-center justify-between border-b bg-card px-4 py-4 rounded-tr-lg">
                  <div className="flex items-center">
                    <Text className="h-4 w-4 mr-2" />
                    <h3 className="text-sm font-medium">Test Details</h3>
                  </div>
                </div>
                <ScrollArea className="flex-1">
                  <div className="space-y-3 p-4">
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
