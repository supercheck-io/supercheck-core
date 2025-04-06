"use client";

import { columns } from "./columns";
import { DataTable } from "./data-table";
import { useState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { getTests } from "@/actions/get-tests";
import { Test } from "./data/schema";
import { Row } from "@tanstack/react-table";

export default function Tests() {
  const [selectedTest] = useState<Test | null>(null);
  const [tests, setTests] = useState<Test[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  // Fetch tests from the database
  useEffect(() => {
    async function fetchTests() {
      setIsLoading(true);
      try {
        const response = await getTests();
        if (response.success && response.tests) {
          const testsWithDefaults = response.tests.map((test) => ({
            ...test,
            priority: test.priority || "medium",
            description: test.description || null,
            createdAt: test.createdAt ?? undefined,
            updatedAt: test.updatedAt ?? undefined,
          }));
          setTests(testsWithDefaults);
        } else {
          console.error("Failed to fetch tests:", response.error);
        }
      } catch (error) {
        console.error("Error fetching tests:", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchTests();
  }, []);

  const handleRowClick = (row: Row<Test>) => {
    const test = row.original;
    router.push(`/playground/${test.id}`);
  };

  return (
    <div className="flex h-full flex-col space-y-4 p-4">
      <DataTable columns={columns} data={tests} isLoading={isLoading} onRowClick={handleRowClick} />

      {selectedTest && (
        <div className="space-y-2 py-2">
          <div>
            <h3 className="font-medium">Title</h3>
            <p>{selectedTest.title}</p>
          </div>
          <div>
            <h3 className="font-medium">Description</h3>
            <p>{selectedTest.description || "No description"}</p>
          </div>
          <div>
            <h3 className="font-medium">Priority</h3>
            <p className="capitalize">{selectedTest.priority}</p>
          </div>
          <div>
            <h3 className="font-medium">Type</h3>
            <p className="capitalize">{selectedTest.type}</p>
          </div>
          <div className="flex space-x-2 pt-4">
            <Button
              onClick={() => router.push(`/playground/${selectedTest.id}`)}
              className="flex-1"
            >
              Open in Playground
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
