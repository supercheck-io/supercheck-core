"use client";

import React, { useState, useEffect } from "react";
import { Test } from "./data/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { XCircle, PlusCircle, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { getTests } from "@/actions/get-tests";

interface TestSelectorProps {
  selectedTests: Test[];
  onTestsSelected: (tests: Test[]) => void;
  buttonLabel?: string;
  emptyStateMessage?: string;
  required?: boolean;
}

export default function TestSelector({
  selectedTests,
  onTestsSelected,
  buttonLabel = "Select Tests",
  emptyStateMessage = "No tests selected",
  required = true,
}: TestSelectorProps) {
  const [isSelectTestsDialogOpen, setIsSelectTestsDialogOpen] = useState(false);
  const [testSelections, setTestSelections] = useState<Record<string, boolean>>(
    {},
  );
  const [availableTests, setAvailableTests] = useState<Test[]>([]);
  const [isLoadingTests, setIsLoadingTests] = useState(true);
  const [testFilter, setTestFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Define the structure expected from the getTests action
  interface ActionTest {
    id: string;
    title: string;
    description: string | null;
    type: "browser" | "api" | "multistep" | "database";
    updatedAt: string | null;
    script?: string;
    priority?: string;
    createdAt?: string | null;
  }

  // Fetch tests from database on component mount
  useEffect(() => {
    async function fetchTests() {
      setIsLoadingTests(true);
      try {
        const response = await getTests();
        if (response.success && response.tests) {
          // Map the API response to the Test type
          const formattedTests: Test[] = (response.tests as ActionTest[]).map(
            (test: ActionTest) => {
              let mappedType: Test["type"];
              switch (test.type) {
                case "browser":
                case "api":
                case "multistep":
                case "database":
                  mappedType = test.type;
                  break;
                default:
                  mappedType = "browser";
                  break;
              }
              return {
                id: test.id,
                name: test.title,
                description: test.description || null,
                type: mappedType,
                status: "pending" as const,
                lastRunAt: test.updatedAt,
                duration: null as number | null,
              };
            },
          );
          setAvailableTests(formattedTests);
        } else {
          console.error("Failed to fetch tests:", response.error);
        }
      } catch (error) {
        console.error("Error fetching tests:", error);
      } finally {
        setIsLoadingTests(false);
      }
    }

    fetchTests();
  }, []);

  // Handle test selection
  const handleTestSelection = (testId: string, checked: boolean) => {
    setTestSelections((prev) => ({
      ...prev,
      [testId]: checked,
    }));
  };

  // Handle test selection confirmation
  const handleSelectTests = () => {
    const selected = availableTests.filter((test) => testSelections[test.id]);
    onTestsSelected(selected);
    setIsSelectTestsDialogOpen(false);
  };

  // Initialize test selections when dialog opens
  useEffect(() => {
    if (isSelectTestsDialogOpen) {
      const initialSelections: Record<string, boolean> = {};
      availableTests.forEach((test) => {
        initialSelections[test.id] = selectedTests.some(
          (selected) => selected.id === test.id,
        );
      });
      setTestSelections(initialSelections);
    }
  }, [isSelectTestsDialogOpen, availableTests, selectedTests]);

  // Remove a test from selection
  const removeTest = (testId: string) => {
    onTestsSelected(selectedTests.filter((test) => test.id !== testId));
  };

  // Filter the tests based on search input
  const filteredTests = availableTests.filter(
    (test) =>
      testFilter === "" ||
      test.name.toLowerCase().includes(testFilter.toLowerCase()) ||
      test.id.toLowerCase().includes(testFilter.toLowerCase()) ||
      test.type.toLowerCase().includes(testFilter.toLowerCase()),
  );

  // Get the current page of tests
  const currentTests = filteredTests.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  // Calculate total pages
  const totalPages = Math.max(1, Math.ceil(filteredTests.length / itemsPerPage));

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Selected Tests</h3>
          <p className="text-sm text-muted-foreground">
            Manage the tests associated with this job
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setIsSelectTestsDialogOpen(true)}
          className={cn(
            required && selectedTests.length === 0 && "border-destructive",
            "transition-colors",
          )}
          size="sm"
        >
          <PlusCircle
            className={cn(
              "mr-2 h-4 w-4",
              required && selectedTests.length === 0 && "text-destructive",
            )}
          />
          {buttonLabel}
        </Button>
      </div>

      {selectedTests.length === 0 ? (
        <div className="text-center my-8">
          <p className={cn("text-sm", required && "text-destructive")}>
            {emptyStateMessage}
          </p>
        </div>
      ) : (
        <div
          className={cn(
            "overflow-y-auto border rounded-md",
            selectedTests.length > 5 && "max-h-[350px]",
          )}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[120px] sticky top-0 bg-background">
                  ID
                </TableHead>
                <TableHead className="w-[200px] sticky top-0 bg-background">
                  Name
                </TableHead>
                <TableHead className="w-[100px] sticky top-0 bg-background">
                  Type
                </TableHead>
                <TableHead className="sticky top-0 bg-background">
                  Description
                </TableHead>
                <TableHead className="w-[100px] sticky top-0 bg-background">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {selectedTests.map((test) => (
                <TableRow key={test.id} className="hover:bg-transparent">
                  <TableCell
                    className="font-mono text-sm truncate"
                    title={test.id}
                  >
                    {test.id.substring(0, 8)}...
                  </TableCell>
                  <TableCell className="truncate" title={test.name}>
                    {test.name}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{test.type}</Badge>
                  </TableCell>
                  <TableCell
                    className="truncate"
                    title={test.description || ""}
                  >
                    {test.description}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeTest(test.id)}
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog
        open={isSelectTestsDialogOpen}
        onOpenChange={setIsSelectTestsDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select Tests</DialogTitle>
            <DialogDescription>
              Choose the tests to include in this job
            </DialogDescription>
          </DialogHeader>
          {isLoadingTests ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
              <span className="ml-2 text-muted-foreground">
                Loading tests...
              </span>
            </div>
          ) : (
            <>
              <div className="mb-4 space-y-2">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Filter by test name, ID, or type..."
                    className="pl-8"
                    value={testFilter}
                    onChange={(e) => setTestFilter(e.target.value)}
                  />
                </div>
              </div>
              <div className="max-h-[350px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px] sticky top-0 bg-background"></TableHead>
                      <TableHead className="w-[120px] sticky top-0 bg-background">
                        ID
                      </TableHead>
                      <TableHead className="w-[200px] sticky top-0 bg-background">
                        Name
                      </TableHead>
                      <TableHead className="w-[100px] sticky top-0 bg-background">
                        Type
                      </TableHead>
                      <TableHead className="sticky top-0 bg-background">
                        Description
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentTests.map((test) => (
                      <TableRow
                        key={test.id} 
                        className="hover:opacity-80 cursor-pointer transition-opacity"
                        onClick={() => handleTestSelection(test.id, !testSelections[test.id])}
                      >
                        <TableCell>
                          <Checkbox
                            checked={testSelections[test.id] || false}
                            onCheckedChange={(checked) =>
                              handleTestSelection(test.id, checked as boolean)
                            }
                            onClick={(e) => e.stopPropagation()}
                          />
                        </TableCell>
                        <TableCell
                          className="font-mono text-sm truncate"
                          title={test.id}
                        >
                          {test.id.substring(0, 8)}...
                        </TableCell>
                        <TableCell className="truncate" title={test.name}>
                          {test.name}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{test.type}</Badge>
                        </TableCell>
                        <TableCell
                          className="truncate"
                          title={test.description || ""}
                        >
                          {test.description}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex justify-center items-center mt-4 space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCurrentPage((prev) => Math.max(prev - 1, 1))
                  }
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <span className="text-sm">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                  }
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
              <div className="mt-4 flex justify-between items-center">
                <div className="text-sm text-muted-foreground">
                  {
                    Object.keys(testSelections).filter(
                      (id) => testSelections[id],
                    ).length
                  }{" "}
                  test
                  {Object.keys(testSelections).filter(
                    (id) => testSelections[id],
                  ).length !== 1
                    ? "s"
                    : ""}{" "}
                  selected
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setIsSelectTestsDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleSelectTests}>
                    Add Selected Tests
                  </Button>
                </DialogFooter>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
} 