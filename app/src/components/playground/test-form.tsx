import React, { useState, useEffect, useCallback, useMemo } from "react";
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
import { SaveIcon, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { testsInsertSchema, TestPriority, TestType } from "@/db/schema/schema";
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
import { TagSelector, type Tag } from "@/components/ui/tag-selector";

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
  isCurrentScriptValidated: boolean; // Strict validation control
  isCurrentScriptReadyToSave: boolean; // Both validated and test passed
  testExecutionStatus: 'none' | 'passed' | 'failed'; // Test execution status
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
  isCurrentScriptValidated,
  isCurrentScriptReadyToSave,
  testExecutionStatus,
}: TestFormProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [formChanged, setFormChanged] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Tag management state
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);
  const [initialTags, setInitialTags] = useState<Tag[]>([]);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [isLoadingTags, setIsLoadingTags] = useState(false);

  // Load available tags and test tags
  useEffect(() => {
    const loadTags = async () => {
      setIsLoadingTags(true);
      try {
        // Load available tags
        const tagsResponse = await fetch('/api/tags');
        if (tagsResponse.ok) {
          const tags = await tagsResponse.json();
          setAvailableTags(tags);
        }

        // Load test tags if we have a test ID
        if (testId) {
          const testTagsResponse = await fetch(`/api/tests/${testId}/tags`);
          if (testTagsResponse.ok) {
            const testTags = await testTagsResponse.json();
            setSelectedTags(testTags);
            setInitialTags(testTags); // Set initial tags for change detection
          }
        } else {
          // For new tests, no initial tags
          setInitialTags([]);
        }
      } catch (error) {
        console.error('Error loading tags:', error);
      } finally {
        setIsLoadingTags(false);
      }
    };

    loadTags();
  }, [testId]);

  // Handle tag creation
  const handleCreateTag = async (name: string, color?: string): Promise<Tag> => {
    const response = await fetch('/api/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create tag');
    }

    const newTag = await response.json();
    
    // Add to available tags
    setAvailableTags(prev => [...prev, newTag]);
    
    return newTag;
  };

  const handleDeleteTag = async (tagId: string): Promise<void> => {
    const response = await fetch(`/api/tags/${tagId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete tag');
    }

    // Remove from available tags
    setAvailableTags(prev => prev.filter(tag => tag.id !== tagId));
  };

  // Handle tag changes
  const handleTagChange = (tags: Tag[]) => {
    setSelectedTags(tags);
  };

  // Save tags when form is submitted
  const saveTestTags = async (testId: string) => {
    try {
      const response = await fetch(`/api/tests/${testId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagIds: selectedTags.map(tag => tag.id) }),
      });

      if (!response.ok) {
        console.error('Failed to save test tags');
      }
    } catch (error) {
      console.error('Error saving test tags:', error);
    }
  };

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

    // Check if tags have changed
    const tagsChanged = (() => {
      if (!initialTags) return selectedTags.length > 0;
      
      if (initialTags.length !== selectedTags.length) return true;
      
      // Check if the same tags are selected (compare by ID)
      const initialTagIds = new Set(initialTags.map((tag: Tag) => tag.id));
      const selectedTagIds = new Set(selectedTags.map((tag: Tag) => tag.id));
      
      return initialTagIds.size !== selectedTagIds.size || 
             !Array.from(initialTagIds).every((id: string) => selectedTagIds.has(id));
    })();

    return formFieldsChanged || editorChanged || tagsChanged;
  }, [testCase, editorContent, initialFormValues, initialEditorContentProp, selectedTags, initialTags]);

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

  // STRICT SAVE CONTROLS: Determine if save/update should be disabled
  const isSaveDisabled = useMemo(() => {
    // Always disabled if running or submitting
    if (isRunning || isSubmitting) return true;
    
    // Disabled if no changes
    if (!formChanged) return true;
    
    // STRICT: Disabled if current script has not been validated AND successfully executed
    if (!isCurrentScriptReadyToSave) return true;
    
    return false;
  }, [isRunning, isSubmitting, formChanged, isCurrentScriptReadyToSave]);

  // Get the save button message with validation feedback
  const getSaveButtonMessage = () => {
   
    if (isRunning) return "Script is running, please wait";
    if (!formChanged) return "No changes detected, nothing to save";
    if (isSubmitting) return "Saving...";
    
    // Check validation status first
    if (!isCurrentScriptValidated) {
      return "Script must be validated before saving";
    }
    
    // Check test execution status
    if (testExecutionStatus === 'none') {
      return "Script must pass execution before saving";
    }
    
    if (testExecutionStatus === 'failed') {
      return "Script must pass execution before saving";
    }
    
    return null;
  };

  const saveButtonMessage = getSaveButtonMessage();

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

  // Helper function to parse Zod validation errors and return user-friendly messages
  const parseValidationErrors = (errorMessage: string): string => {
    try {
      // Try to parse the error as JSON (Zod validation errors)
      const errors = JSON.parse(errorMessage);
      
      if (Array.isArray(errors)) {
        const fieldErrors = errors.map((error: any) => {
          const field = error.path?.[0] || 'field';
          const message = error.message || 'Invalid value';
          
          // Map common Zod error codes to user-friendly messages
          switch (error.code) {
            case 'too_big':
              return `${field.charAt(0).toUpperCase() + field.slice(1)} is too long. Maximum ${error.maximum} characters allowed.`;
            case 'too_small':
              return `${field.charAt(0).toUpperCase() + field.slice(1)} is too short. Minimum ${error.minimum} characters required.`;
            case 'invalid_type':
              return `${field.charAt(0).toUpperCase() + field.slice(1)} has an invalid format.`;
            case 'invalid_string':
              return `${field.charAt(0).toUpperCase() + field.slice(1)} format is invalid.`;
            default:
              return `${field.charAt(0).toUpperCase() + field.slice(1)}: ${message}`;
          }
        });
        
        return fieldErrors.join('\n');
      }
    } catch {
      // If it's not JSON, return the original error message
      return errorMessage;
    }
    
    return errorMessage;
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
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
            // Save tags after successful test update
            await saveTestTags(testId);
            
            toast.success("Test updated successfully.");

            // Navigate to the tests page after updating
            router.push("/tests/");
          } else {
            console.error("Failed to update test:", result.error);
            const errorMessage = parseValidationErrors(result.error || "Unknown error occurred");
            toast.error("Validation Error", {
              description: errorMessage,
            });
          }
        } else {
          // Save as a new test
          const result = await saveTest(updatedTestCase);

          if (result.success && result.id) {
            // Save tags after successful test creation
            await saveTestTags(result.id);
            
            toast.success("Test saved successfully.");

            // Navigate to the tests page with the test ID
            router.push("/tests/");
          } else {
            console.error("Failed to save test:", result.error);
            const errorMessage = parseValidationErrors(result.error || "Unknown error occurred");
            toast.error("Validation Error", {
              description: errorMessage,
            });
          }
        }
      } catch (err) {
        console.error("Error saving test:", err);
        const errorMessage = err instanceof Error ? err.message : "Unknown error occurred";
        const parsedError = parseValidationErrors(errorMessage);
        toast.error("Error", {
          description: parsedError,
        });
      } finally {
        setIsSubmitting(false);
      }
    } else {
      setIsSubmitting(false);
      // Show validation errors
      const errorMessages = Object.values(errors).filter(Boolean);
      const errorDescription =
        errorMessages.length > 0
          ? errorMessages.join("\n")
          : "Please fix the form errors before saving.";

      toast.error("Form Validation Error", {
        description: errorDescription,
      });
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
          {/* <div className="bg-card p-3 rounded-lg border border-border/40">
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
          </div> */}
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
              setTestCase({ ...testCase, title: e.target.value.slice(0, 255), })
            }
            placeholder="Enter test title"
            className={cn(errors.title && "border-destructive", "h-10")}
            disabled={isRunning}
          />
        </div>
        <div className="flex justify-between items-center">
          {errors.title && (
            <p className="text-red-500 text-xs">{errors.title}</p>
          )}
          <p className={cn(
            "text-xs ml-auto",
            testCase.title.length > 240 ? "text-orange-500" : "text-muted-foreground"
          )}>
            {testCase.title.length}/255
          </p>
        </div>
      </div>

      <div className="space-y-2 -mt-2">
        <label htmlFor="description" className="block text-sm font-medium">
          Description
        </label>
        <Textarea
          id="description"
          value={testCase.description || ""}
          onChange={(e) =>
            setTestCase((prev) => ({
              ...prev,
              description: e.target.value.slice(0, 1000), // Enforce 1000 char limit
            }))
          }
          placeholder="Enter test description"
          maxLength={1000}
          style={{ overflowY: 'auto', minHeight: 100, maxHeight: 150 }}
          className={cn(
            errors.description ? "border-red-500" : "",
            "min-h-[100px]",
            isRunning ? "opacity-70 cursor-not-allowed" : ""
          )}
          disabled={isRunning}
        />
        <div className="flex justify-between items-center">
          {errors.description && (
            <p className="text-red-500 text-xs">{errors.description}</p>
          )}
          <p className={cn(
            "text-xs ml-auto",
            (testCase.description?.length || 0) > 950 ? "text-orange-500" : "text-muted-foreground"
          )}>
            {(testCase.description?.length || 0)}/1000
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2 -mt-2">
          <label htmlFor="priority" className="block text-sm font-medium">
            Priority
          </label>
          <Select
            value={testCase.priority || "medium"}
            onValueChange={(value) =>
              setTestCase((prev) => ({
                ...prev,
                priority: value as TestPriority,
              }))
            }
            defaultValue="medium"
            disabled={isRunning}
          >
            <SelectTrigger className={cn(
              "h-10",
              isRunning ? "opacity-70 cursor-not-allowed" : ""
            )}>
              <SelectValue placeholder="Select priority">
                {priorityDisplayMap[testCase.priority as AllowedPriorityKey] || "Select priority"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {allowedPriorities.map((priority) => (
                <SelectItem key={priority} value={priority}>
                  {priorityDisplayMap[priority]}
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

      {/* Tags Section */}
      <div className="space-y-2 mb-6">
        <label htmlFor="tags" className="block text-sm font-medium">
          Tags
        </label>
        <TagSelector
          value={selectedTags}
          onChange={handleTagChange}
          availableTags={availableTags}
          onCreateTag={handleCreateTag}
          onDeleteTag={handleDeleteTag}
          placeholder="Select or create tags..."
          disabled={isRunning || isLoadingTags}
        />
        {isLoadingTags && (
          <p className="text-xs text-muted-foreground">Loading tags...</p>
        )}
      </div>

      <div className="mt-4">
        <div className="flex justify-between items-center">
          <div className="flex flex-col items-end -mt-6.5" >
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
          <div className="flex flex-col items-end">
            {testId ? (
              <Button
                type="submit"
                onClick={handleSubmit}
                className="flex items-center gap-2 h-9 px-4 mt-2"
                disabled={isSaveDisabled}
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <SaveIcon className="h-4 w-4 mr-2" />
                )}
                {isSubmitting ? "Updating..." : "Update"}
              </Button>
            ) : (
              <Button
                type="submit"
                onClick={handleSubmit}
                className="flex items-center gap-2 h-9 px-4"
                disabled={isSaveDisabled}
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <SaveIcon className="h-4 w-4 mr-2" />
                )}
                {isSubmitting ? "Saving..." : "Save"}
              </Button>
            )}
            {/* Professional single-row status message below save/update button */}
            <div className="mt-2 text-right min-h-[16px]">
              {/* Show a single, contextual status message */}
              {(() => {
                // Priority 1: Show blocking message if save is disabled
                if (saveButtonMessage && (isRunning || isSubmitting)) {
                  return (
                    <div className="flex items-center justify-end gap-1.5 mt-2">
                      <div className="w-2 h-2 rounded-full bg-gray-400 animate-pulse"></div>
                      <p className="text-xs text-muted-foreground font-medium">
                        {saveButtonMessage}
                      </p>
                    </div>
                  );
                }

                // Priority 2: Show validation/execution requirements
                if (saveButtonMessage && !isRunning && !isSubmitting) {
                  const isValidationIssue = !isCurrentScriptValidated;
                  const isExecutionIssue = isCurrentScriptValidated && testExecutionStatus !== 'passed';
                  
                  return (
                    <div className="flex items-center justify-end gap-1.5 mt-2">
                      <div className={`w-2 h-2 rounded-full ${
                        isValidationIssue ? 'bg-blue-500' : isExecutionIssue ? 'bg-red-500' : 'bg-gray-400'
                      }`}></div>
                      <p className={`text-xs font-medium ${
                        isValidationIssue ? 'text-muted-foreground' : isExecutionIssue ? 'text-muted-foreground' : 'text-muted-foreground'
                      }`}>
                        {isValidationIssue ? 'Run script to validate and save' : isExecutionIssue ? 'Script must pass to save the test' : saveButtonMessage}
                      </p>
                    </div>
                  );
                }

                // Priority 3: Show ready state
                if (!saveButtonMessage && formChanged && !isRunning && !isSubmitting && isCurrentScriptReadyToSave) {
                  return (
                    <div className="flex items-center justify-end gap-1.5 mt-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                      <p className="text-xs text-emerald-600 font-medium">
                        Ready to {testId ? "update" : "save"} the test
                      </p>
                      
                    </div>
                  );
                }

                // Priority 4: Show no changes state
                if (!formChanged && !isRunning && !isSubmitting) {
                  return (
                    <div className="flex items-center justify-end gap-1.5 mt-2">
                      <div className="w-2 h-2 rounded-full bg-gray-300"></div>
                      <p className="text-xs text-gray-500 font-medium">
                        No changes to save
                      </p>
                    </div>
                  );
                }

                // Default: Empty space to maintain layout
                return null;
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the test "{testCase.title}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!testId) return;
                
                setIsDeleting(true);
                try {
                  const result = await deleteTest(testId);
                  if (result.success) {
                    toast.success("Test deleted successfully");
                    router.push("/tests");
                  } else {
                    toast.error("Failed to delete test");
                  }
                } catch (error) {
                  toast.error("Error deleting test");
                } finally {
                  setIsDeleting(false);
                  setShowDeleteDialog(false);
                }
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
