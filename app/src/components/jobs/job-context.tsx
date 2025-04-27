"use client";

import React, { createContext, useContext, useState } from "react";

interface JobContextType {
  isAnyJobRunning: boolean;
  setJobRunning: (isRunning: boolean) => void;
}

const JobContext = createContext<JobContextType | undefined>(undefined);

export function JobProvider({ children }: { children: React.ReactNode }) {
  const [isAnyJobRunning, setIsAnyJobRunning] = useState(false);

  const setJobRunning = (isRunning: boolean) => {
    setIsAnyJobRunning(isRunning);
  };

  return (
    <JobContext.Provider value={{ isAnyJobRunning, setJobRunning }}>
      {children}
    </JobContext.Provider>
  );
}

export function useJobContext() {
  const context = useContext(JobContext);
  if (context === undefined) {
    throw new Error("useJobContext must be used within a JobProvider");
  }
  return context;
} 