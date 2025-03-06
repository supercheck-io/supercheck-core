"use client";
import {
  FileTextIcon,
  GanttChartIcon,
  FrameIcon,
  FileType,
  FileText,
  Code,
  AlertCircle,
  Loader2Icon,
  CheckCircleIcon,
  AlertTriangleIcon,
  ZapIcon,
  SaveIcon,
} from "lucide-react";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/components/ui/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CodeEditor } from "./code-editor";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import type { editor } from "monaco-editor";
import { cn } from "@/lib/utils"; // Changed to cn

const testCaseSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(100, "Title must be less than 100 characters"),
  description: z
    .string()
    .min(1, "Description is required")
    .max(1000, "Description must be less than 1000 characters"),
  priority: z.enum(["Low", "Medium", "High", "Critical"], {
    required_error: "Priority is required",
  }),
  type: z.enum(["Functional", "Regression", "E2E", "Performance"], {
    required_error: "Type is required",
  }),
  browser: z.string().min(1, "Browser selection is required"),
  tags: z.string(),
  code: z.string().min(1, "Test script is required"),
});

type TestCaseFormData = z.infer<typeof testCaseSchema>;

const Playground: React.FC = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<string>("editor");
  const [isRunning, setIsRunning] = useState(false);
  const [reportUrl, setReportUrl] = useState<string | null>(null);
  const [testId, setTestId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [editorContent, setEditorContent] = useState(`/**
 * This script tests the login functionality of the example.com website.
 * It ensures that users can log in with valid credentials and 
 * receive appropriate error messages for invalid credentials.
 */

import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('https://playwright.dev/');

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/Playwright/);
});

test('get started link', async ({ page }) => {
  await page.goto('https://playwright.dev/');

  // Click the get started link.
  await page.getByRole('link', { name: 'Get started' }).click();

  // Expects page to have a heading with the name of Installation.
  await expect(page.getByRole('heading', { name: 'Installation' })).toBeVisible();
});

test('GET /todos/1 returns expected data', async ({ request }) => {
  const response = await request.get('https://jsonplaceholder.typicode.com/todos/1');
  expect(response.status()).toBe(200);
  const responseData = await response.json();
  expect(responseData).toEqual({
    userId: 1,
    id: 1,
    title: 'delectus aut autem',
    completed: false,
  });
  console.log(responseData);
});

`);

  const [testCase, setTestCase] = useState<TestCaseFormData>({
    title: "",
    description: "",
    code: editorContent,
    priority: "Medium",
    type: "Functional",
    tags: "",
    browser: "chromium",
  });

  const [initialFormValues, setInitialFormValues] = useState<TestCaseFormData>({
    title: "",
    description: "",
    code: editorContent,
    priority: "Medium",
    type: "Functional",
    tags: "",
    browser: "chromium",
  });

  const [initialEditorContent, setInitialEditorContent] =
    useState(editorContent);

  const hasChanges = () => {
    return (
      JSON.stringify(testCase) !== JSON.stringify(initialFormValues) ||
      editorContent !== initialEditorContent
    );
  };

  const [errors, setErrors] = useState<
    Partial<Record<keyof TestCaseFormData, string>>
  >({});
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  const [testIds, setTestIds] = useState<string[]>([]);
  const [completedTestIds, setCompletedTestIds] = useState<string[]>([]);
  const [pendingTestIds, setPendingTestIds] = useState<string[]>([]);
  const [currentReportUrl, setCurrentReportUrl] = useState<string | null>(null);
  const [selectedTestId, setSelectedTestId] = useState<string | null>(null);
  const pendingTests = new Map<
    string,
    { checkCount: number; errorCount: number }
  >();

  const [apiErrors, setApiErrors] = useState(0);
  const [testStatus, setTestStatus] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const forcedReloads = useRef(0);
  const completionCheckCount = useRef(0);
  const reportFrameRef = useRef<HTMLIFrameElement | null>(null);

  // Add a completed flag to track if a test has been marked complete to stop polling
  const testCompleted = useRef<Record<string, boolean>>({});

  useEffect(() => {
    setTestCase((prev) => ({ ...prev, code: editorContent }));
  }, [editorContent]);

  useEffect(() => {
    setApiErrors(0);
    forcedReloads.current = 0;
    completionCheckCount.current = 0;
  }, []);

  const validateForm = () => {
    try {
      testCaseSchema.parse(testCase);
      setErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const formattedErrors: Partial<Record<keyof TestCaseFormData, string>> =
          {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            formattedErrors[err.path[0] as keyof TestCaseFormData] =
              err.message;
          }
        });
        setErrors(formattedErrors);
      }
      return false;
    }
  };

  const runPlaywrightTest = async () => {
    if (loading) return;

    setIsRunning(true);
    setApiErrors(0);
    setLoading(true);

    // Reset completion tracking for the new test
    testCompleted.current = {};

    // Automatically switch to the Report tab
    setActiveTab("report");

    try {
      const formData = new FormData();
      formData.append("code", editorRef.current?.getValue() || editorContent);

      // If we have an existing test ID, send it with the request
      if (testId) {
        formData.append("testId", testId);
      }

      const response = await fetch("/api/test", {
        method: "POST",
        body: formData,
        headers: {
          Accept: "*/*",
        },
        signal: AbortSignal.timeout(60000), // 60 seconds timeout
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage;

        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error || "Failed to run tests";
        } catch (e) {
          // If parsing fails, use the raw text
          errorMessage = errorText || "Failed to run tests";
        }

        // Ensure we show an appropriate error message for timeouts
        if (response.status === 504 || response.status === 502) {
          errorMessage =
            "The test request timed out. This might happen if the test takes too long to run. Try again or simplify your test.";
        } else if (response.status === 400) {
          // Standard validation errors
          errorMessage = errorMessage || "Invalid test data provided";
        } else if (response.status === 500) {
          // Server-side errors
          errorMessage =
            errorMessage || "Server error occurred while running your test";
        }

        throw new Error(errorMessage);
      }

      const result = await response.json();

      // Store the test ID and add it to pending tests
      if (result.testId) {
        setTestId(result.testId);

        // Add to the list of test IDs
        setTestIds((prev) => {
          if (!prev.includes(result.testId)) {
            return [result.testId, ...prev];
          }
          return prev;
        });

        setPendingTestIds((prev) => {
          if (!prev.includes(result.testId)) {
            return [...prev, result.testId];
          }
          return prev;
        });

        pendingTests.set(result.testId, { checkCount: 0, errorCount: 0 });

        // Start polling for this test's status
        await checkTestStatus(result.testId);
        setTimeout(() => checkTestStatus(result.testId), 2000);
      }

      // Set the report URL immediately if available
      if (result.reportUrl) {
        setReportUrl(result.reportUrl);
        setCurrentReportUrl(result.reportUrl);
      }

      if (result.error) {
        toast({
          title: "Test Run Failed",
          description: result.error,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error running test:", error);
      setCurrentReportUrl(null);
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "An error occurred while running the test.",
        variant: "destructive",
      });
    } finally {
      setIsRunning(false);
    }
  };

  // This function checks if all tests have completed
  const checkAllTestsCompleted = useCallback(() => {
    // If we have no pending tests, we can set isRunning to false
    if (pendingTestIds.length === 0) {
      setIsRunning(false);
    }
  }, [pendingTestIds]);

  // Poll for test status
  async function checkTestStatus(testId: string) {
    // If we've already marked this test as completed, stop polling immediately
    if (testCompleted.current[testId]) {
      console.log(
        `Test ${testId} already marked as complete, skipping status check`
      );
      return;
    }

    try {
      // Add cache-busting to prevent stale responses
      const response = await fetch(
        `/api/test-status/${testId}?t=${Date.now()}`
      );

      if (!response.ok) {
        console.error(
          `Test status API error: ${response.status} ${response.statusText}`
        );
        setApiErrors((prev) => prev + 1);

        // If we've had too many consecutive errors, mark the test as failed
        if (apiErrors > 5) {
          setApiErrors(0);
          setTestStatus({
            ...testStatus,
            status: "completed",
            error: "Test status API failed repeatedly",
          });
          toast({
            title: "Error",
            description:
              "Test report could not be loaded. API errors exceeded limit.",
            variant: "destructive",
          });
          return;
        }

        // Exponential backoff for retries on API errors
        setTimeout(
          () => checkTestStatus(testId),
          Math.min(2000 * Math.pow(2, apiErrors), 30000)
        );
        return;
      }

      // Reset API errors counter if we get a successful response
      setApiErrors(0);

      const data = await response.json();

      if (data.status === "completed" && data.reportUrl) {
        // Ensure we check at least 6 times to avoid premature completion
        if (completionCheckCount.current < 6) {
          completionCheckCount.current++;

          // Force iframe to reload with final report
          const reportFrame =
            reportFrameRef.current ||
            (document.getElementById("test-report-frame") as HTMLIFrameElement);
          if (reportFrame) {
            // Reset the source to force a clean reload
            reportFrame.src = "";
            setTimeout(() => {
              if (reportFrame) {
                // Add cache-busting to URL
                reportFrame.src = `${data.reportUrl}?t=${Date.now()}`;
              }
            }, 100);
          }

          // Continue polling for a bit to ensure report is truly done
          setTimeout(() => checkTestStatus(testId), 1000);
          return;
        }

        // After sufficient checks, mark as complete
        setTestStatus({
          ...data,
          reportUrl: data.reportUrl,
        });
        setLoading(false);
        setIsRunning(false);
        completionCheckCount.current = 0;

        // Mark this test as completed to prevent further polling
        testCompleted.current[testId] = true;

        // Update the completedTestIds state to update the UI
        setCompletedTestIds((prev) => {
          if (!prev.includes(testId)) {
            return [...prev, testId];
          }
          return prev;
        });

        // Remove from pending state
        setPendingTestIds((prev) => prev.filter((id) => id !== testId));

        console.log(
          `Marked test ${testId} as complete, stopping all future polling`
        );
        return;
      }

      if (data.status === "running" && data.reportUrl) {
        setTestStatus({
          ...data,
          reportUrl: data.reportUrl,
        });

        // Ensure test is in the pending state
        setPendingTestIds((prev) => {
          if (!prev.includes(testId)) {
            return [...prev, testId];
          }
          return prev;
        });

        // Check for iframe content to see if we need to force reload
        const reportFrame =
          reportFrameRef.current ||
          (document.getElementById("test-report-frame") as HTMLIFrameElement);

        try {
          if (reportFrame && reportFrame.contentDocument) {
            const content = reportFrame.contentDocument.body?.innerHTML || "";

            // If iframe is empty or minimal, force a reload
            if (
              !content ||
              content.length < 50 ||
              content.includes("404") ||
              content.includes("Not Found") ||
              forcedReloads.current < 3
            ) {
              // Add cache-busting to URL
              reportFrame.src = `${data.reportUrl}?t=${Date.now()}`;
              forcedReloads.current += 1;
            }
          }
        } catch (e) {
          console.warn("Could not access iframe content:", e);
          // If we can't access the content due to CORS, try to force reload anyway
          const frame = document.getElementById(
            "test-report-frame"
          ) as HTMLIFrameElement;
          if (frame) {
            frame.src = `${data.reportUrl}?t=${Date.now()}`;
          }
        }

        // Continue polling
        setTimeout(() => checkTestStatus(testId), 2000);
        return;
      }
    } catch (error) {
      console.error("Error checking test status:", error);
      setApiErrors((prev) => prev + 1);

      // If we've had too many consecutive errors, mark the test as failed
      if (apiErrors > 5) {
        setApiErrors(0);
        setTestStatus({
          ...testStatus,
          status: "completed",
          error: "Test status API failed repeatedly",
        });
        toast({
          title: "Error",
          description:
            "Test report could not be loaded. API errors exceeded limit.",
          variant: "destructive",
        });
        return;
      }

      // Exponential backoff for retries
      setTimeout(
        () => checkTestStatus(testId),
        Math.min(2000 * Math.pow(2, apiErrors), 30000)
      );
    }
  }

  // Add a function to select a specific test report to view
  const selectTestReport = (testId: string) => {
    // Directly construct the report URL
    const reportUrlWithCache = `/api/test-results/${testId}/report/index.html?t=${Date.now()}`;

    // Update state
    setReportUrl(reportUrlWithCache);
    setCurrentReportUrl(reportUrlWithCache);
    setSelectedTestId(testId);

    // Switch to report tab
    setActiveTab("report");

    console.log(
      `Selected test report: ${testId}, setting URL to ${reportUrlWithCache}`
    );
  };

  // Add UI elements to show running and completed tests
  const TestsList = useMemo(() => {
    if (testIds.length === 0) {
      return null;
    }

    return (
      <div className="mb-4">
        <h3 className="text-sm font-medium mb-2">Test Runs</h3>
        <div className="flex flex-wrap gap-2">
          {testIds.map((id) => {
            const isPending = pendingTestIds.includes(id);
            const isCompleted = completedTestIds.includes(id);
            const isActive = currentReportUrl?.includes(id);

            return (
              <Button
                key={id}
                variant={isActive ? "default" : "outline"}
                size="sm"
                className={cn(
                  "text-xs",
                  isPending && "animate-pulse",
                  isCompleted && !isActive && "opacity-70"
                )}
                onClick={() => selectTestReport(id)}
              >
                {isPending ? (
                  <span className="flex items-center">
                    <Loader2Icon className="mr-1 h-3 w-3 animate-spin" />
                    {id.substring(0, 8)}...
                  </span>
                ) : (
                  <span className="flex items-center">
                    {isCompleted ? (
                      <CheckCircleIcon className="mr-1 h-3 w-3" />
                    ) : (
                      <AlertTriangleIcon className="mr-1 h-3 w-3" />
                    )}
                    {id.substring(0, 8)}...
                  </span>
                )}
              </Button>
            );
          })}
        </div>
      </div>
    );
  }, [testIds, pendingTestIds, completedTestIds, currentReportUrl]);

  return (
    <>
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
                        <Code className="h-4 w-4" />
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
                      {errorMessage && (
                        <Alert
                          variant="destructive"
                          onClose={() => setErrorMessage(null)}
                          className="absolute top-0 left-0 right-0 z-10 backdrop-blur-xl"
                        >
                          <AlertCircle className="h-4 w-4" />
                          <AlertTitle>Error</AlertTitle>
                          <AlertDescription>{errorMessage}</AlertDescription>
                        </Alert>
                      )}
                      <div className="h-full">
                        <CodeEditor
                          value={editorContent}
                          onChange={(value) => {
                            setEditorContent(value || "");
                            // Clear error when code changes
                            if (errorMessage) setErrorMessage(null);
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
                      <div className="flex h-full min-h-[calc(100vh-11rem)] items-center justify-center bg-[#1e1e1e]">
                        <div className="flex flex-col items-center gap-2 text-[#d4d4d4]">
                          <Loader2Icon className="h-8 w-8 animate-spin" />
                          <p>Please wait, running test...</p>
                        </div>
                      </div>
                    ) : reportUrl ? (
                      <div className="report-iframe-wrapper h-full min-h-[calc(100vh-11rem)] w-full">
                        <iframe
                          key={reportUrl}
                          src={reportUrl}
                          className="h-full min-h-[calc(100vh-11rem)] w-full"
                          sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-downloads"
                          allow="cross-origin-isolated"
                          onError={(e) => {
                            console.error("Error loading iframe:", e);
                          }}
                        />
                      </div>
                    ) : (
                      <div className="flex h-full  min-h-[calc(100vh-11rem)] items-center justify-center bg-[#1e1e1e]">
                        <div className="flex flex-col items-center gap-2 text-[#d4d4d4]">
                          <FileText className="h-8 w-8" />
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
                  <div className="space-y-2">{TestsList}</div>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Title</Label>
                      <Input
                        placeholder="Enter test case title"
                        value={testCase.title}
                        onChange={(e) =>
                          setTestCase({
                            ...testCase,
                            title: e.target.value,
                          })
                        }
                      />
                      {errors.title && (
                        <p className="text-sm text-red-500">{errors.title}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Description</Label>
                      <Textarea
                        placeholder="Enter test case description"
                        value={testCase.description}
                        onChange={(e) =>
                          setTestCase({
                            ...testCase,
                            description: e.target.value,
                          })
                        }
                        className="min-h-[100px] resize-none"
                      />
                      {errors.description && (
                        <p className="text-sm text-red-500">
                          {errors.description}
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Priority</Label>
                        <Select
                          value={testCase.priority}
                          onValueChange={(value) =>
                            setTestCase({
                              ...testCase,
                              priority: value as TestCaseFormData["priority"],
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select priority" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Low">Low</SelectItem>
                            <SelectItem value="Medium">Medium</SelectItem>
                            <SelectItem value="High">High</SelectItem>
                            <SelectItem value="Critical">Critical</SelectItem>
                          </SelectContent>
                        </Select>
                        {errors.priority && (
                          <p className="text-sm text-red-500">
                            {errors.priority}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Type</Label>
                        <Select
                          value={testCase.type}
                          onValueChange={(value) =>
                            setTestCase({
                              ...testCase,
                              type: value as TestCaseFormData["type"],
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Functional">
                              Functional
                            </SelectItem>
                            <SelectItem value="Regression">
                              Regression
                            </SelectItem>
                            <SelectItem value="E2E">E2E</SelectItem>
                            <SelectItem value="Performance">
                              Performance
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        {errors.type && (
                          <p className="text-sm text-red-500">{errors.type}</p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Browser</Label>
                      <Tabs
                        defaultValue="chromium"
                        value={testCase.browser}
                        onValueChange={(value) => {
                          setTestCase({
                            ...testCase,
                            browser: value,
                          });
                        }}
                        className="w-full"
                      >
                        <TabsList className="grid grid-cols-3 w-full h-8">
                          <TabsTrigger
                            value="chromium"
                            className="text-xs py-1"
                          >
                            Chromium
                          </TabsTrigger>
                          <TabsTrigger value="firefox" className="text-xs py-1">
                            Firefox
                          </TabsTrigger>
                          <TabsTrigger value="webkit" className="text-xs py-1">
                            Webkit
                          </TabsTrigger>
                        </TabsList>
                      </Tabs>
                      {errors.browser && (
                        <p className="text-sm text-red-500">{errors.browser}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Tags</Label>
                      <Input
                        placeholder="Enter comma-separated tags"
                        value={testCase.tags}
                        onChange={(e) =>
                          setTestCase({ ...testCase, tags: e.target.value })
                        }
                      />
                      {errors.tags && (
                        <p className="text-sm text-red-500">{errors.tags}</p>
                      )}
                    </div>
                    <div className="flex items-center justify-center w-full">
                      <Button
                        onClick={() => {
                          if (validateForm()) {
                            setInitialFormValues(testCase);
                            setInitialEditorContent(editorContent);
                            toast({
                              title: "Test Saved",
                              description:
                                "Your test has been saved successfully.",
                              variant: "default",
                            });
                          } else {
                            toast({
                              title: "Validation Error",
                              description:
                                "Please fix the errors before saving.",
                              variant: "destructive",
                            });
                          }
                        }}
                        size="sm"
                        className="flex items-center gap-2 w-[180px] mt-2"
                        disabled={isRunning || !hasChanges()}
                      >
                        <SaveIcon className="h-4 w-4" />
                        <span className="hidden sm:inline">Save</span>
                      </Button>
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </>
  );
};

export default Playground;
