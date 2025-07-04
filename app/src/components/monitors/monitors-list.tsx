"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { columns } from "./columns";
import { DataTable } from "./data-table";
import { Monitor } from "./schema";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PlusCircle, Loader2 } from "lucide-react";

export default function MonitorsList() {
  const router = useRouter();
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tableKey, setTableKey] = useState(0);
  const [isMounted, setIsMounted] = useState(false);
  
  // Set mounted state
  useEffect(() => {
    setIsMounted(true);
    return () => {
      setIsMounted(false);
    };
  }, []);
  
  // Fetch monitors with proper cleanup
  useEffect(() => {
    let abortController = new AbortController();
    
    async function fetchMonitors() {
      if (!isMounted) return;
      
      try {
        const response = await fetch('/api/monitors', {
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
  }, [isMounted]);

  // Handle row click to navigate to monitor detail
  const handleRowClick = useCallback((row: any) => {
    router.push(`/monitors/${row.original.id}`);
  }, [router]);
  
  // Handle delete callback
  const handleDeleteMonitor = useCallback(async (id: string) => {
    // Check if mounted before proceeding
    if (!isMounted) return;
    
    try {
      const response = await fetch('/api/monitors');
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
  }, [isMounted]);

  // Don't render until mounted
  if (!isMounted) {
    return (
      <div className="flex h-full flex-col space-y-4 p-2 mt-6">
        {/* Loading Toolbar */}
        <div className="flex items-center justify-between mb-4 -mt-2">
          <div className="flex items-center justify-between space-y-2">
            <div className="flex flex-col">
              <h2 className="text-2xl font-semibold">Monitors</h2>
              <p className="text-muted-foreground text-sm">
                Manage your monitors and their configurations
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Input
              placeholder="Filter by ID or Name..."
              disabled
              className="h-8 w-[200px] lg:w-[250px]"
            />
            <Button
              variant="outline"
              disabled
              className="h-8 px-2 lg:px-3"
            >
              Status
            </Button>
            <Button
              variant="outline"
              disabled
              className="h-8 px-2 lg:px-3"
            >
              Type
            </Button>
            <Button
              variant="ghost"
              disabled
              className="h-8 px-2 lg:px-3"
            >
              View
            </Button>
            <Button disabled>
              <PlusCircle className="mr-2 h-4 w-4" />
              New Monitor
            </Button>
          </div>
        </div>

        {/* Loading Table */}
        <div className="rounded-md border">
          <div className="h-36 flex items-center justify-center">
          </div>
        </div>
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