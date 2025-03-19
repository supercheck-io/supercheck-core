import React from "react";
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
import { toast } from "@/components/ui/use-toast";
import { testsInsertSchema, TestPriority, TestType } from "@/db/schema";
import { saveTest } from "@/actions/save-test";
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
      .min(1, "Description is required")
      .max(1000, "Description must be less than 1000 characters"),
    script: z.string().min(1, "Test script is required"),
    code: z.string().optional(),
  })
  .omit({ createdAt: true, updatedAt: true });

type TestCaseFormData = z.infer<typeof testCaseSchema>;

type TestFormProps = {
  testCase: TestCaseFormData;
  setTestCase: React.Dispatch<React.SetStateAction<TestCaseFormData>>;
  errors: Record<string, string>;
  editorContent: string;
  isRunning: boolean;
  validateForm: () => boolean;
  setInitialFormValues: (values: Partial<TestCaseFormData>) => void;
  setInitialEditorContent: (content: string) => void;
  initialFormValues: Partial<TestCaseFormData>;
  initialEditorContent: string;
};

export function TestForm({
  testCase,
  setTestCase,
  errors,
  editorContent,
  isRunning,
  validateForm,
  setInitialFormValues,
  setInitialEditorContent,
  initialFormValues,
  initialEditorContent,
}: TestFormProps) {
  const router = useRouter();

  // Check if the form has changes compared to initial values
  const hasChangesLocal = () => {
    const formChanged =
      testCase.title !== (initialFormValues.title || "") ||
      testCase.description !== (initialFormValues.description || "") ||
      testCase.priority !== (initialFormValues.priority || "medium") ||
      testCase.type !== (initialFormValues.type || "browser");

    const scriptChanged = editorContent !== initialEditorContent;

    return formChanged || scriptChanged;
  };

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
          value={testCase.description}
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

      <div className="flex justify-end w-full">
        <Button
          onClick={async () => {
            if (validateForm()) {
              // Update the editor content in the test case
              const updatedTestCase = {
                ...testCase,
                script: editorContent
              };
              
              try {
                // Save the test to the database
                const result = await saveTest(updatedTestCase);
                
                if (result.success) {
                  // Update local state
                  setInitialFormValues(updatedTestCase);
                  setInitialEditorContent(editorContent);
                  
                  toast({
                    title: "Test Saved",
                    description: "Your test has been saved successfully.",
                    variant: "default",
                  });
                  
                  // Navigate to the tests page
                  router.push(`/tests/${result.id}`);
                } else {
                  toast({
                    title: "Save Error",
                    description: result.error || "Failed to save test.",
                    variant: "destructive",
                  });
                }
              } catch (error) {
                toast({
                  title: "Save Error",
                  description: error instanceof Error ? error.message : "An unknown error occurred.",
                  variant: "destructive",
                });
              }
            } else {
              toast({
                title: "Validation Error",
                description: "Please fix the errors before saving.",
                variant: "destructive",
              });
            }
          }}
          size="sm"
          className="flex items-center gap-2 w-[150px] mt-4 cursor-pointer"
          disabled={isRunning || !hasChangesLocal()}
        >
          <SaveIcon className="h-4 w-4" />
          <span className="hidden sm:inline">Save</span>
        </Button>
      </div>
    </div>
  );
}

export { testCaseSchema };
export type { TestCaseFormData };
