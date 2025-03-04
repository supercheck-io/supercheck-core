"use client";
import {
  Zap,
  Save,
  LoaderIcon,
  FileText,
  Code,
  AlertCircle,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
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
  browser: z.array(z.string()).min(1, "At least one browser must be selected"),
  tags: z.string(),
  code: z.string().min(1, "Test script is required"),
});

type TestCaseFormData = z.infer<typeof testCaseSchema>;

export default function Playground() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("editor");
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
    browser: ["chromium"],
  });

  const [initialFormValues, setInitialFormValues] = useState<TestCaseFormData>({
    title: "",
    description: "",
    code: editorContent,
    priority: "Medium",
    type: "Functional",
    tags: "",
    browser: ["chromium"],
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

  useEffect(() => {
    setTestCase((prev) => ({ ...prev, code: editorContent }));
  }, [editorContent]);

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
    setIsRunning(true);
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
        let errorMessage = `HTTP error! status: ${response.status}`;

        try {
          // Try to parse as JSON
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error || errorMessage;
        } catch (e) {
          // If not JSON, use the text
          if (errorText) {
            errorMessage = errorText;
          }
        }

        // Check for SSL-related errors
        if (
          errorMessage.includes("SSL") ||
          errorMessage.includes("certificate") ||
          errorMessage.includes("CERT_") ||
          errorMessage.includes("security")
        ) {
          errorMessage = `SSL Certificate Error: ${errorMessage}\n\nThis may be due to corporate firewall or SSL inspection. Please contact your IT department.`;
        }

        throw new Error(errorMessage);
      }

      const result = await response.json();

      // Only set the report URL if it exists
      if (result.reportUrl) {
        setReportUrl(result.reportUrl);
        // Automatically switch to the report tab only when we have a report
        setActiveTab("report");
      }

      if (result.testId) {
        setTestId(result.testId);
      }

      if (result.error) {
        toast({
          title: "Test Run Failed",
          description: result.error,
          variant: "destructive",
          duration: 10000, // Show for longer - 10 seconds
        });
        setErrorMessage(result.error);
        // Keep focus on editor when there's no report
        if (!result.reportUrl) {
          setActiveTab("editor");
        }
      } else {
        toast({
          title: "Test Run Successful",
          description: "Check the report tab for details.",
          variant: "default",
        });
        setErrorMessage(null);
      }
    } catch (error) {
      console.error("Error running test:", error);
      toast({
        title: "Error",
        description: "An error occurred while running the test.",
        variant: "destructive",
      });
    } finally {
      setIsRunning(false);
    }
  };

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
                        <FileText className="h-4 w-4" />
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
                      <LoaderIcon className="h-4 w-4 animate-spin" />
                      <span className="mr-2">Running...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4" />
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
                          <LoaderIcon className="h-8 w-8 animate-spin" />
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
                  <FileText className="h-4 w-4" />
                  <h2 className="text-sm font-medium">Test Details</h2>
                </div>
              </div>
              <ScrollArea className="flex-1">
                <div className="space-y-6 p-4">
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
                      <div className="flex flex-wrap gap-2">
                        {["chromium", "firefox", "webkit"].map((browser) => (
                          <Badge
                            key={browser}
                            variant={
                              testCase.browser.includes(browser)
                                ? "default"
                                : "outline"
                            }
                            className="cursor-pointer"
                            onClick={() => {
                              const newBrowsers = testCase.browser.includes(
                                browser
                              )
                                ? testCase.browser.filter((b) => b !== browser)
                                : [...testCase.browser, browser];
                              setTestCase({
                                ...testCase,
                                browser: newBrowsers,
                              });
                            }}
                          >
                            {browser}
                          </Badge>
                        ))}
                      </div>
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
                        <Save className="h-4 w-4" />
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
}
