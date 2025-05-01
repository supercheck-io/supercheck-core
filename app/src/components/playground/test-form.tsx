import React, { useState, useEffect, useCallback } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SaveIcon, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { testsInsertSchema, TestPriority, TestType } from "@/db/schema";
import { saveTest } from "@/actions/save-test";
import { decodeTestScript } from "@/actions/save-test";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { UUIDField } from "@/components/ui/uuid-field";
import { formatDistanceToNow } from "date-fns";
import { deleteTest } from "@/actions/delete-test";
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
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileTextIcon, ExternalLinkIcon, Loader2Icon, CheckCircleIcon, XCircleIcon, AlertCircleIcon } from "lucide-react";

// Define the type for the display map keys explicitly based on allowed UI values
type AllowedPriorityKey = "low" | "medium" | "high";

// Map the database schema values to display values for the UI
const priorityDisplayMap: Record<AllowedPriorityKey, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

// Explicitly define allowed priorities based on the map keys
const allowedPriorities: AllowedPriorityKey[] = ["low", "medium", "high"];

const typeDisplayMap = {
  browser: "Browser",
  api: "API",
  multistep: "Multi-step",
  database: "Database",
};

// Using the testsInsertSchema from schema.ts with extensions for playground-specific fields
const testCaseSchema = testsInsertSchema
  .extend({
    title: z
      .string()
      .min(1, "Title is required")
      .max(100, "Title must be less than 100 characters"),
    description: z
      .string()
      .nullable()
      .transform((val) => (val === null ? "" : val)) // Convert null to empty string
      .pipe(
        z
          .string()
          .min(1, "Description is required")
          .max(1000, "Description must be less than 1000 characters")
      ),
    script: z.string().min(1, "Test script is required"),
    priority: z.enum(["low", "medium", "high"] as const, {
      required_error: "Priority is required",
      invalid_type_error: "Priority must be low, medium, or high",
    }),
    type: z.enum(["browser", "api", "multistep", "database"] as const, {
      required_error: "Test type is required",
      invalid_type_error: "Test type must be browser, api, multistep, or database",
    }),
    updatedAt: z.string().nullable().optional(),
    createdAt: z.string().nullable().optional(),
  })
  .omit({ createdAt: true, updatedAt: true });

type TestCaseFormData = z.infer<typeof testCaseSchema> & {
  updatedAt?: string | null;
  createdAt?: string | null;
};

interface TestFormProps {
  testCase: {
    title: string;
    description: string | null;
    priority: TestPriority;
    type: TestType;
    script?: string;
    updatedAt?: string | null;
    createdAt?: string | null;
  };
  setTestCase: React.Dispatch<
    React.SetStateAction<{
      title: string;
      description: string | null;
      priority: TestPriority;
      type: TestType;
      script?: string;
      updatedAt?: string | null;
      createdAt?: string | null;
    }>
  >;
  errors: Record<string, string>;
  validateForm: () => boolean;
  editorContent: string;
  isRunning: boolean;
  setInitialEditorContent: (content: string) => void;
  initialFormValues: Partial<{
    title: string;
    description: string | null;
    priority: TestPriority;
    type: TestType;
    script?: string;
    updatedAt?: string | null;
    createdAt?: string | null;
  }>;
  initialEditorContent: string;
  testId?: string | null;
}

export function TestForm({
  testCase,
  setTestCase,
  errors,
  validateForm,
  editorContent,
  isRunning,
  setInitialEditorContent,
  initialFormValues,
  initialEditorContent: initialEditorContentProp,
  testId,
}: TestFormProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [formChanged, setFormChanged] = useState(false);

  // Track if form has changes compared to initial values
  const hasChangesLocal = useCallback(() => {
    // Check if any form field has changed
    const formFieldsChanged =
      testCase.title !== (initialFormValues.title || "") ||
      testCase.description !== (initialFormValues.description || "") ||
      testCase.priority !== (initialFormValues.priority || "medium") ||
      testCase.type !== (initialFormValues.type || "browser");

    // Check if editor content has changed
    const editorChanged = editorContent !== initialEditorContentProp;

    return formFieldsChanged || editorChanged;
  }, [testCase, editorContent, initialFormValues, initialEditorContentProp]);

  // Update formChanged state whenever form values change
  useEffect(() => {
    const hasChanges = hasChangesLocal();
    setFormChanged(hasChanges);
  }, [
    testCase,
    editorContent,
    initialFormValues,
    initialEditorContentProp,
    hasChangesLocal,
  ]);

  // Make the resetUpdateState function available to the parent component
  useEffect(() => {
    // Reset the update state function defined inside the useEffect
    const resetUpdateState = () => {
      // Code simplified to avoid unused variables
      console.log("Update state reset");
    };
    
    // When testId changes, reset the update state
    resetUpdateState();
    
    // Log the test case values for debugging
    console.log("TestForm received testCase:", testCase);
    console.log("Test type is:", testCase.type);
    console.log("Test priority is:", testCase.priority);
  }, [testId, testCase, testCase.type, testCase.priority]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Submit clicked, current testCase:", testCase);
    console.log("Editor content length:", editorContent.length);

    if (validateForm()) {
      console.log("Form validated successfully");
      // Convert the editor content to base64 before saving
      // Use the browser's btoa function for base64 encoding
      const base64Script = btoa(unescape(encodeURIComponent(editorContent)));

      // Update the test case with base64-encoded script
      const updatedTestCase = {
        ...testCase,
        script: base64Script,
        // Ensure description is at least an empty string if null
        description: testCase.description || "",
      };

      console.log("Sending updated test case:", updatedTestCase);

      try {
        // If we have a testId, update the existing test
        if (testId) {
          console.log("Updating existing test with ID:", testId);
          const result = await saveTest({
            id: testId,
            ...updatedTestCase,
          });

          console.log("Update result:", result);

          if (result.success) {
            toast.success("Test updated successfully.");

            // Navigate to the tests page after updating
            router.push("/tests/");
          } else {
            console.error("Failed to update test:", result.error);
            toast.error("Error", {
              description: "Failed to update test. Please try again later.",
            });
          }
        } else {
          // Save as a new test
          const result = await saveTest(updatedTestCase);

          if (result.success) {
            toast.success("Test saved successfully.");

            // Navigate to the tests page with the test ID
            router.push("/tests/");
          } else {
            console.error("Failed to save test:", result.error);
            toast.error("Error", {
              description: "Failed to save test. Please try again later.",
            });
          }
        }
      } catch (err) {
        console.error("Error saving test:", err);
        toast.error("Error", {
          description: "Failed to save test. Please try again later.",
        });
      }
    } else {
      // Show validation errors
      const errorMessages = Object.values(errors).filter(Boolean);
      const errorDescription =
        errorMessages.length > 0
          ? errorMessages.join("\n")
          : "Please fix the form errors before saving.";

      toast.error(errorDescription);
    }
  };

  // Decode the script when the component mounts or when initialEditorContent changes
  React.useEffect(() => {
    // Only try to decode if there's content and it might be base64
    if (initialEditorContentProp && initialEditorContentProp.trim() !== "") {
      const decodeScript = async () => {
        try {
          // Try to decode the script
          const decodedScript = await decodeTestScript(
            initialEditorContentProp
          );

          // Only update if the decoded script is different
          if (decodedScript !== initialEditorContentProp) {
            setInitialEditorContent(decodedScript);
          }
        } catch {
          console.error("Error decoding script");
          // If decoding fails, keep the original content
        }
      };

      decodeScript();
    }
  }, [initialEditorContentProp, setInitialEditorContent]);

  const handleDeleteTest = async () => {
    if (!testId) return;

    setIsDeleting(true);

    // Show a loading toast for delete operation
    const deleteToastId = toast.loading("Deleting test...", {
      description: "Please wait while we delete the test.",
      duration: Infinity, // Keep loading until dismissed
    });

    try {
      // Use the server action to delete the test
      const result = await deleteTest(testId);

      if (!result.success) {
        throw new Error(result.error || "Failed to delete test");
      }

      toast.success("Test deleted successfully", {
        description: `Test \"${testCase.title}\" has been permanently removed.`,
        id: deleteToastId,
        duration: 5000, // Add auto-dismiss after 5 seconds
      });

      // Navigate back to the tests page
      router.push("/tests");
    } catch (error) {
      console.error("Error deleting test:", error);
      toast.error("Error deleting test", {
        description:
          error instanceof Error ? error.message : "Failed to delete test",
        id: deleteToastId,
        duration: 5000, // Add auto-dismiss after 5 seconds
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-3 -mt-2">
      {/* Test metadata section with dates and ID */}
      {testId && (
        <div className="space-y-3">
          {/* Timestamps */}
          {(testCase.createdAt || testCase.updatedAt) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {testCase.createdAt && (
                <div className="space-y-1 bg-card p-3 rounded-lg border border-border/40">
                  <h3 className="text-sm font-medium text-muted-foreground">Created</h3>
                  <div>
                    <p className="text-xs">
                      {new Date(testCase.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}{" "}
                      {new Date(testCase.createdAt).toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(() => {
                        try {
                          const date = new Date(testCase.createdAt);
                          if (isNaN(date.getTime())) return "Invalid date";
                          return formatDistanceToNow(date, { addSuffix: true });
                        } catch {
                          return "Invalid date";
                        }
                      })()}
                    </p>
                  </div>
                </div>
              )}
              {testCase.updatedAt && (
                <div className="space-y-1 bg-card p-3 rounded-lg border border-border/40">
                  <h3 className="text-sm font-medium text-muted-foreground">Updated</h3>
                  <div>
                    <p className="text-xs">
                      {new Date(testCase.updatedAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}{" "}
                      {new Date(testCase.updatedAt).toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(() => {
                        try {
                          const date = new Date(testCase.updatedAt);
                          if (isNaN(date.getTime())) return "Invalid date";
                          return formatDistanceToNow(date, { addSuffix: true });
                        } catch {
                          return "Invalid date";
                        }
                      })()}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
          
          {/* Test ID */}
          <div className="bg-card p-3 rounded-lg border border-border/40">
            <div className="space-y-1">
              <h3 className="text-sm font-medium text-muted-foreground">Test ID</h3>
              <div className="group relative">
                <UUIDField 
                  value={testId} 
                  className="text-xs font-mono"
                  onCopy={() => toast.success("Test ID copied to clipboard")}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Test title */}
      <div className="space-y-2">
        <label
          htmlFor="title"
          className={cn(
            "block text-sm font-medium",
            errors.title ? "text-destructive" : "text-foreground"
          )}
        >
          Title
        </label>
        <div>
          <Input
            id="title"
            name="title"
            type="text"
            value={testCase.title}
            onChange={(e) =>
              setTestCase({ ...testCase, title: e.target.value })
            }
            placeholder="Enter test title"
            className={cn(errors.title && "border-destructive", "h-10")}
            disabled={isRunning}
          />
        </div>
        {errors.title && (
          <p className="text-red-500 text-xs mt-1.5">{errors.title}</p>
        )}
      </div>

      <div className="space-y-2">
        <label htmlFor="description" className="block text-sm font-medium">
          Description
        </label>
        <Textarea
          id="description"
          value={testCase.description || ""}
          onChange={(e) =>
            setTestCase((prev) => ({
              ...prev,
              description: e.target.value,
            }))
          }
          placeholder="Enter test description"
          className={cn(
            errors.description ? "border-red-500" : "",
            "min-h-[100px]",
            isRunning ? "opacity-70 cursor-not-allowed" : ""
          )}
          disabled={isRunning}
        />
        {errors.description && (
          <p className="text-red-500 text-xs mt-1.5">{errors.description}</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label htmlFor="priority" className="block text-sm font-medium">
            Priority
          </label>
          <Select
            value={testCase.priority || "medium"}
            onValueChange={(value) => {
              // Ensure the value is a valid TestPriority before setting state
              if (allowedPriorities.includes(value as AllowedPriorityKey)) {
                setTestCase((prev) => ({
                  ...prev,
                  priority: value as TestPriority,
                }));
              }
            }}
            defaultValue="medium"
            disabled={isRunning}
          >
            <SelectTrigger className={cn(
              "w-full h-10",
              isRunning ? "opacity-70 cursor-not-allowed" : ""
            )}>
              <SelectValue placeholder="Select priority">
                {priorityDisplayMap[testCase.priority as TestPriority] || "Select priority"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {/* Map over the explicitly allowed priorities */}
              {allowedPriorities.map((key) => (
                <SelectItem key={key} value={key}>
                  {priorityDisplayMap[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.priority && (
            <p className="text-red-500 text-xs mt-1.5">{errors.priority}</p>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor="type" className="block text-sm font-medium">
            Type
          </label>
          <Select
            value={testCase.type || "browser"}
            onValueChange={(value) =>
              setTestCase((prev) => ({
                ...prev,
                type: value as TestType,
              }))
            }
            defaultValue="browser"
            disabled={isRunning}
          >
            <SelectTrigger className={cn(
              "h-10",
              isRunning ? "opacity-70 cursor-not-allowed" : ""
            )}>
              <SelectValue placeholder="Select type">
                {typeDisplayMap[testCase.type as TestType] || "Select type"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="browser">{typeDisplayMap.browser}</SelectItem>
              <SelectItem value="api">{typeDisplayMap.api}</SelectItem>
              <SelectItem value="multistep">
                {typeDisplayMap.multistep}
              </SelectItem>
              <SelectItem value="database">
                {typeDisplayMap.database}
              </SelectItem>
            </SelectContent>
          </Select>
          {errors.type && (
            <p className="text-red-500 text-xs mt-1.5">{errors.type}</p>
          )}
        </div>
      </div>

      <div className="mt-4">
        <div className="flex justify-between items-center">
          <div>
            {testId && (
              <Button
                type="button"
                variant="destructive"
                onClick={() => setShowDeleteDialog(true)}
                disabled={isRunning}
                className="h-9 px-3"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            )}
          </div>
          <div>
            {testId ? (
              <Button
                type="submit"
                onClick={handleSubmit}
                className="flex items-center gap-2 h-9 px-4"
                disabled={isRunning || !formChanged}
              >
                <SaveIcon className="h-4 w-4 mr-2" />
                Update
              </Button>
            ) : (
              <Button
                type="submit"
                onClick={handleSubmit}
                className="flex items-center gap-2 h-9 px-4"
                disabled={isRunning || !formChanged}
              >
                <SaveIcon className="h-4 w-4 mr-2" />
                Save
              </Button>
            )}
          </div>
        </div>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the test &quot;{testCase.title}&quot;. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDeleteTest();
              }}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}

export { testCaseSchema };
export type { TestCaseFormData };
