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
import { SaveIcon } from "lucide-react";
import { toast } from "sonner";
import { testsInsertSchema, TestPriority, TestType } from "@/db/schema";
import { saveTest } from "@/actions/save-test";
import { decodeTestScript } from "@/actions/save-test";
import { useRouter } from "next/navigation";

// Map the database schema values to display values for the UI
const priorityDisplayMap = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

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
  })
  .omit({ createdAt: true, updatedAt: true });

type TestCaseFormData = z.infer<typeof testCaseSchema>;

interface TestFormProps {
  testCase: {
    title: string;
    description: string | null;
    priority: TestPriority;
    type: TestType;
    script?: string;
  };
  setTestCase: React.Dispatch<
    React.SetStateAction<{
      title: string;
      description: string | null;
      priority: TestPriority;
      type: TestType;
      script?: string;
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
  const [formChanged, setFormChanged] = useState(false);
  const [justUpdated, setJustUpdated] = useState(false);

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
    setFormChanged(hasChangesLocal());

    // If there are changes, reset the justUpdated flag
    if (hasChangesLocal()) {
      setJustUpdated(false);
    }
  }, [
    testCase,
    editorContent,
    initialFormValues,
    initialEditorContentProp,
    hasChangesLocal,
  ]);

  // Reset the update state
  const resetUpdateState = () => {
    setJustUpdated(false);
    setFormChanged(false);
  };

  // Make the resetUpdateState function available to the parent component
  useEffect(() => {
    // When testId changes, reset the update state
    resetUpdateState();
  }, [testId]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      // Convert the editor content to base64 before saving
      // Use the browser's btoa function for base64 encoding
      const base64Script = btoa(unescape(encodeURIComponent(editorContent)));

      // Update the test case with base64-encoded script
      const updatedTestCase = {
        ...testCase,
        script: base64Script,
      };

      try {
        // If we have a testId, update the existing test
        if (testId) {
          const result = await saveTest({
            id: testId,
            ...updatedTestCase,
          });

          if (result.success) {
            // Update form state
            setJustUpdated(true);
            setFormChanged(false);

            toast.success("Test updated successfully.");

            // Stay on the same page after updating
          } else {
            toast.error(result.error || "Failed to update test.");
          }
        } else {
          // Save as a new test
          const result = await saveTest(updatedTestCase);

          if (result.success) {
            toast.success("Test saved successfully.");

            // Navigate to the tests page with the test ID
            router.push("/tests/");
          } else {
            toast.error(result.error || "Failed to save test.");
          }
        }
      } catch (error) {
        console.error("Error saving test:", error);
        toast.error(
          error instanceof Error
            ? error.message
            : "An error occurred while saving the test."
        );
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
        } catch (error) {
          console.error("Error decoding script:", error);
          // If decoding fails, keep the original content
        }
      };

      decodeScript();
    }
  }, [initialEditorContentProp, setInitialEditorContent]);

  return (
    <div className="p-2 space-y-4">
      <div>
        <label htmlFor="title" className="block text-sm font-medium  mb-1">
          Title
        </label>
        <Input
          id="title"
          value={testCase.title}
          onChange={(e) =>
            setTestCase((prev) => ({ ...prev, title: e.target.value }))
          }
          placeholder="Enter test title"
          className={errors.title ? "border-red-500" : ""}
        />
        {errors.title && (
          <p className="text-red-500 text-xs mt-1">{errors.title}</p>
        )}
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium mb-1">
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
          className={
            errors.description
              ? "border-red-500 min-h-[100px]"
              : "min-h-[100px]"
          }
        />
        {errors.description && (
          <p className="text-red-500 text-xs mt-1">{errors.description}</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="priority" className="block text-sm font-medium  mb-1">
            Priority
          </label>
          <Select
            value={testCase.priority}
            onValueChange={(value) =>
              setTestCase((prev) => ({
                ...prev,
                priority: value as TestPriority,
              }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select priority">
                {testCase.priority
                  ? priorityDisplayMap[testCase.priority as TestPriority]
                  : "Select priority"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">{priorityDisplayMap.low}</SelectItem>
              <SelectItem value="medium">
                {priorityDisplayMap.medium}
              </SelectItem>
              <SelectItem value="high">{priorityDisplayMap.high}</SelectItem>
              <SelectItem value="critical">
                {priorityDisplayMap.critical}
              </SelectItem>
            </SelectContent>
          </Select>
          {errors.priority && (
            <p className="text-red-500 text-xs mt-1">{errors.priority}</p>
          )}
        </div>

        <div>
          <label htmlFor="type" className="block text-sm font-medium  mb-1">
            Type
          </label>
          <Select
            value={testCase.type}
            onValueChange={(value) =>
              setTestCase((prev) => ({
                ...prev,
                type: value as TestType,
              }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select type">
                {testCase.type
                  ? typeDisplayMap[testCase.type as TestType]
                  : "Select type"}
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
            <p className="text-red-500 text-xs mt-1">{errors.type}</p>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        {testId ? (
          <Button
            type="submit"
            onClick={handleSubmit}
            className="flex items-center gap-2 w-[150px] mt-4 cursor-pointer"
            disabled={isRunning || !formChanged || justUpdated}
          >
            <SaveIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Update</span>
          </Button>
        ) : (
          <Button
            type="submit"
            onClick={handleSubmit}
            className="flex items-center gap-2 w-[150px] mt-4 cursor-pointer"
            disabled={isRunning}
          >
            <SaveIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Save</span>
          </Button>
        )}
      </div>
    </div>
  );
}

export { testCaseSchema };
export type { TestCaseFormData };
