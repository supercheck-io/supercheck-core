"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { columns } from "./columns";
import { DataTable } from "./data-table";
import { Monitor } from "./schema";

export default function MonitorsList() {
  const router = useRouter();
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tableKey, setTableKey] = useState(Date.now()); // For forcing re-render when needed
  const isMounted = useRef(false);
  
  // Set up mount/unmount detection
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);
  
  useEffect(() => {
    async function fetchMonitors() {
      if (!isMounted.current) return; // Check if component is mounted
      
      try {
        const response = await fetch('/api/monitors');
        if (!response.ok) {
          throw new Error('Failed to fetch monitors');
        }
        const data = await response.json();
        
        // Only update state if component is still mounted
        if (isMounted.current) {
          setMonitors(data);
        }
      } catch (error) {
        console.error('Error fetching monitors:', error);
        // Use empty array as fallback, but only if still mounted
        if (isMounted.current) {
          setMonitors([]);
        }
      } finally {
        // Only update loading state if still mounted
        if (isMounted.current) {
          setIsLoading(false);
        }
      }
    }
    
    fetchMonitors();
  }, []);

  // Handle row click to navigate to monitor detail
  const handleRowClick = (row: any) => {
    router.push(`/monitors/${row.original.id}`);
  };
  
  // Handle delete callback
  const handleDeleteMonitor = async (id: string) => {
    // Check if mounted before proceeding
    if (!isMounted.current) return;
    
    // After deletion is complete, fetch the updated list
    try {
      const response = await fetch('/api/monitors');
      if (!response.ok) {
        throw new Error('Failed to fetch monitors');
      }
      const data = await response.json();
      
      // Only update state if still mounted
      if (isMounted.current) {
        setMonitors(data);
        setTableKey(Date.now()); // Force table to reset
      }
    } catch (error) {
      console.error('Error refreshing monitors:', error);
    }
  };

  return (
    <div className="flex h-full flex-col space-y-4 p-4">
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