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
}

// Using the testsInsertSchema from schema.ts with extensions for playground-specific fields
const testCaseSchema = z
  .object({
    title: z
      .string()
      .min(1, "Title is required")
      .max(100, "Title must be less than 100 characters"),
    description: z
      .string()
      .min(1, "Description is required")
      .max(1000, "Description must be less than 1000 characters"),
    priority: z.enum(["low", "medium", "high"]),
    type: z.enum(["browser", "api", "multistep", "database"]),
    script: z.string().min(1, "Test script is required"),
  })
  .strict();

interface PlaygroundProps {
  initialTestData?: {
    id?: string;
    title: string;
    description: string | null;
    script: string;
    priority: TestPriority;
    type: TestType;
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
  const [pageLoading, setPageLoading] = useState(true);
  const [reportUrl, setReportUrl] = useState<string | null>(null);
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
        }
      : {}
  );
  const [testCase, setTestCase] = useState<TestCaseFormData>({
    title: initialTestData?.title || "",
    description: initialTestData?.description || "",
    priority: initialTestData?.priority || ("medium" as TestPriority),
    type: initialTestData?.type || ("browser" as TestType),
    script: initialTestData?.script || "",
  });

  // Create empty errors object for TestForm
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Track test runs
  const [testIds, setTestIds] = useState<string[]>([]);
  const [completedTestIds, setCompletedTestIds] = useState<string[]>([]);

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
        });

        // Set the test ID
        setTestId(id);
      } else {
        console.error("Failed to load test:", result.error);
        toast.error(`Failed to load test: ${result.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Error loading test:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "An error occurred while loading the test."
      );
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
      const typeToSet = scriptTypeParam && [
        "browser",
        "api",
        "multistep",
        "database",
      ].includes(scriptTypeParam)
        ? scriptTypeParam
        : defaultType;

      // console.log("[Playground Effect] Determined typeToSet:", typeToSet);
      setTestCase(prev => ({ ...prev, type: typeToSet }));

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
            setTestCase(prev => ({ ...prev, script: scriptContent || "" }));
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
      // Before validation, ensure script field is synced with code field
      const validationData = {
        ...testCase,
        script: editorContent,
      };

      testCaseSchema.parse(validationData);
      setErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("Error validating form:", error);
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
    setActiveTab("report");

    try {
      // Prepare the request body with the current editor content
      const testData = {
        ...testCase,
        script: editorContent, // Use the current editor content
      };

      toast.loading("Running test...");

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

      toast.dismiss();

      if (result.reportUrl && result.testId) {
        // Use the API URL directly
        setReportUrl(result.reportUrl);

        // Use the testId returned from the API
        const apiTestId = result.testId;

        // Add to the list of running tests
        setTestIds((prev: string[]) => [...prev, apiTestId]);

        // Mark this test as completed
        setCompletedTestIds((prev: string[]) => [...prev, apiTestId]);

        toast.success("Test completed successfully");
      }

      if (result.error) {
        toast.error(result.error);
      }
    } catch (error) {
      toast.dismiss();
      console.error("Error running test:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "An error occurred while running the test."
      );
    } finally {
      setIsRunning(false);
    }
  };

  // Add a function to select a specific test report to view
  const selectTestReport = (testId: string) => {
    // Directly construct the report URL with the API path
    const reportUrlWithCache = `/api/test-results/${testId}/report/index.html?t=${Date.now()}`;

    // Update state
    setReportUrl(reportUrlWithCache);

    // Switch to report tab
    setActiveTab("report");

    console.log(
      `Selected test report: ${testId}, setting URL to ${reportUrlWithCache}`
    );
  };

  // Add UI elements to show running and completed tests
  const TestsList = () => {
    if (testIds.length === 0) {
      return null;
    }

    return (
      <div className="mb-4">
        <h3 className="text-sm font-medium mb-2">Test Runs</h3>
        <div className="flex flex-wrap gap-2">
          {testIds.map((id) => {
            const isCompleted = completedTestIds.includes(id);
            const isActive = reportUrl?.includes(id);

            return (
              <Button
                key={id}
                variant={isActive ? "default" : "outline"}
                size="sm"
                className={`text-xs cursor-pointer ${
                  isCompleted && !isActive ? "opacity-70" : ""
                }`}
                onClick={() => selectTestReport(id)}
              >
                {isCompleted ? (
                  <span className="flex items-center">
                    <CheckCircleIcon className="mr-1 h-3 w-3" />
                    {id.replace("run-", "").substring(0, 8)}...
                  </span>
                ) : (
                  <span className="flex items-center">
                    <AlertTriangleIcon className="mr-1 h-3 w-3" />
                    {id.replace("run-", "").substring(0, 8)}...
                  </span>
                )}
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
                <div className="flex items-center justify-between border-b bg-muted px-4 py-2 rounded-tl-lg">
                  <div className="flex items-center gap-8">
                    {/* Playground */}
                    <Tabs value={activeTab} onValueChange={setActiveTab}>
                      <TabsList className="grid w-[400px] grid-cols-2">
                        <TabsTrigger
                          value="editor"
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          <FileTextIcon className="h-4 w-4" />
                          <span>Editor</span>
                        </TabsTrigger>
                        <TabsTrigger
                          value="report"
                          className="flex items-center gap-2 cursor-pointer"
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
                    className="flex items-center gap-2 bg-[hsl(221.2,83.2%,53.3%)] text-white hover:bg-[hsl(221.2,83.2%,48%)] cursor-pointer"
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
                              // Clear error when code changes
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
                      {isRunning ? (
                        <div className="flex h-[calc(100vh-10rem)] items-center justify-center bg-[#1e1e1e]">
                          <div className="flex flex-col items-center gap-2 text-[#d4d4d4]">
                            <Loader2Icon className="h-8 w-8 animate-spin" />
                            <p>Please wait, running test...</p>
                          </div>
                        </div>
                      ) : reportUrl ? (
                        <div className="report-iframe-wrapper h-[calc(100vh-10rem)] w-full">
                          <iframe
                            key={reportUrl}
                            src={reportUrl}
                            className="h-[calc(100vh-10rem)] w-full"
                            sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-downloads"
                            allow="cross-origin-isolated"
                            onError={(e) => {
                              console.error("Error loading iframe:", e);
                            }}
                          />
                        </div>
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
              minSize={25}
              className="rounded-br-lg rounded-tr-lg"
            >
              <div className="flex h-full flex-col border-l bg-muted/50 rounded-br-lg">
                <div className="flex items-center justify-between border-b bg-muted px-4 py-2 rounded-tr-lg">
                  <div className="flex items-center gap-2 py-2">
                    <FileTextIcon className="h-4 w-4" />
                    <h2 className="text-sm font-medium">Test Details</h2>
                  </div>
                </div>
                <ScrollArea className="flex-1">
                  <div className="space-y-4 p-4">
                    <div className="space-y-2">{TestsList()}</div>
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
