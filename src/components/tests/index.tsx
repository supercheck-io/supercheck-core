"use client";

import { columns } from "./columns";
import { DataTable } from "./data-table";
import { useState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { getTests } from "@/actions/get-tests";
import { Test } from "./data/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { Row } from "@tanstack/react-table";

export default function Tests() {
  const [selectedTest] = useState<Test | null>(null);
  const [tests, setTests] = useState<Test[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Fetch tests from the database
  useEffect(() => {
    async function fetchTests() {
      try {
        setLoading(true);
        const result = await getTests();
        if (result.success) {
          // Ensure the tests match the expected type
          const formattedTests = result.tests.map((test) => ({
            ...test,
            createdAt: test.createdAt || undefined,
            updatedAt: test.updatedAt || undefined,
          }));
          setTests(formattedTests);
        } else {
          console.error("Failed to fetch tests:", result.error);
        }
      } catch (error) {
        console.error("Error fetching tests:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchTests();
  }, []);

  const handleRowClick = (row: Row<Test>) => {
    const test = row.original;
    router.push(`/playground/${test.id}`);
  };

  if (loading) {
    return (
      <div className="flex h-full flex-col space-y-2 p-4">
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="flex items-center space-x-4">
              <Skeleton className="h-12 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col space-y-2 p-4">
      <DataTable columns={columns} data={tests} onRowClick={handleRowClick} />

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
