"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { columns } from "./columns";
import { DataTable } from "./data-table";
import { DataTableSkeleton } from "@/components/ui/data-table-skeleton";
import { Monitor } from "./schema";
import { Row } from "@tanstack/react-table";
import { useProjectContext } from "@/hooks/use-project-context";

export default function MonitorsList() {
  const router = useRouter();
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tableKey, setTableKey] = useState(0);
  const [isMounted, setIsMounted] = useState(false);
  const { projectId, currentProject } = useProjectContext();
  
  // Set mounted state
  useEffect(() => {
    setIsMounted(true);
    return () => {
      setIsMounted(false);
    };
  }, []);
  
  // Fetch monitors with proper cleanup
  useEffect(() => {
    const abortController = new AbortController();
    
    async function fetchMonitors() {
      if (!isMounted) return;
      
      try {
        // Only fetch monitors if we have a projectId and organizationId
        if (!projectId || !currentProject?.organizationId) {
          setMonitors([]);
          setIsLoading(false);
          return;
        }

        const response = await fetch(`/api/monitors?projectId=${projectId}&organizationId=${currentProject.organizationId}`, {
          signal: abortController.signal
        });
        
        if (!response.ok) {
          throw new Error('Failed to fetch monitors');
        }
        
        const data = await response.json();
        
        // Only update state if component is still mounted and request wasn't aborted
        if (isMounted && !abortController.signal.aborted) {
          setMonitors(data);
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return; // Request was aborted, don't update state
        }
        
        console.error('Error fetching monitors:', error);
        
        // Use empty array as fallback, but only if still mounted
        if (isMounted && !abortController.signal.aborted) {
          setMonitors([]);
        }
      } finally {
        // Only update loading state if still mounted and not aborted
        if (isMounted && !abortController.signal.aborted) {
          setIsLoading(false);
        }
      }
    }
    
    if (isMounted) {
      fetchMonitors();
    }
    
    return () => {
      abortController.abort();
    };
  }, [isMounted, projectId, currentProject?.organizationId]);

  // Handle row click to navigate to monitor detail
  const handleRowClick = useCallback((row: Row<Monitor>) => {
    router.push(`/monitors/${row.original.id}`);
  }, [router]);
  
  // Handle delete callback
  const handleDeleteMonitor = useCallback(async () => {
    // Check if mounted before proceeding
    if (!isMounted) return;
    
    try {
      // Only fetch monitors if we have a projectId and organizationId
      if (!projectId || !currentProject?.organizationId) {
        setMonitors([]);
        return;
      }

      const response = await fetch(`/api/monitors?projectId=${projectId}&organizationId=${currentProject.organizationId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch monitors');
      }
      const data = await response.json();
      
      // Only update state if still mounted
      if (isMounted) {
        setMonitors(data);
        setTableKey(prev => prev + 1);
      }
    } catch (error) {
      console.error('Error refreshing monitors:', error);
    }
  }, [isMounted, projectId, currentProject?.organizationId]);

  // Don't render until mounted
  if (!isMounted) {
    return (
      <div className="flex h-full flex-col space-y-4 p-2 mt-6">
        <DataTableSkeleton columns={5} rows={3} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col space-y-4 p-2 mt-6">
      <DataTable
        key={tableKey}
        columns={columns}
        data={monitors}
        isLoading={isLoading}
        onRowClick={handleRowClick}
        meta={{
          onDeleteMonitor: handleDeleteMonitor,
        }}
      />
    </div>
  );
} 