"use client";

import React, { useState, useEffect, useCallback } from "react";
import { columns } from "./columns";
import { DataTable } from "./data-table";
import { AlertHistory } from "./schema";

export function AlertsComponent() {
  const [alerts, setAlerts] = useState<AlertHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAlerts = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/alerts/history');
      if (response.ok) {
        const data = await response.json();
        setAlerts(data);
      } else {
        console.error('Failed to fetch alerts');
        setAlerts([]);
      }
    } catch (error) {
      console.error("Failed to fetch alerts:", error);
      setAlerts([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  return (
    <div className="h-full flex-1 flex-col space-y-4 p-4 md:flex">
      <DataTable 
        columns={columns} 
        data={alerts} 
        isLoading={isLoading}
      />
    </div>
  );
}
