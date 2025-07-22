"use client";

import React from "react";
import { Cron, OnError } from "react-js-cron";
import "react-js-cron/dist/styles.css"; // Import base styles
import { Input } from "@/components/ui/input"; // Import shadcn Input
import { Button } from "@/components/ui/button"; // Import shadcn Button
import { X } from "lucide-react"; // Import icons
import { toast } from "sonner"; // Import toast

interface CronSchedulerProps {
  value: string;
  onChange: (value: string) => void;
  onError?: OnError; // Use the type from the library
  disabled?: boolean;
  readOnly?: boolean;
}

// Define custom locale if needed, or use defaults
// import { Locale } from 'react-js-cron'
// const customLocale: Partial<Locale> = { ... }

const CronScheduler: React.FC<CronSchedulerProps> = ({
  value,
  onChange,
  onError,
  disabled = false,
  readOnly = false,
}) => {
  return (
    <div className="cron-widget-container space-y-2"> 
      {/* The Cron component for visual editing */}
      <Cron
        value={value}
        setValue={onChange} // react-js-cron uses setValue prop for onChange
        leadingZero // Use leading zeros for hours/minutes (e.g., 01 instead of 1)
        clearButton={false} // Hide the default clear button if desired
        shortcuts={false} // Disable shortcuts like @daily if not needed
        // clockFormat="24-hour-clock" // Optional: set clock format
        disabled={disabled}
        readOnly={readOnly}
        onError={onError} // Pass the error handler
        // locale={customLocale} // Pass custom locale if defined
        // You can customize allowed periods, dropdowns, etc. here if needed
        // allowedPeriods={['year', 'month', 'week', 'day', 'hour', 'minute']}
        // allowedDropdowns={['period', 'months', 'month-days', 'week-days', 'hours', 'minutes']}
      />
      
      {/* Read-only input to display the generated cron string */}
      <div className="flex items-center space-x-2">
        <Input 
          readOnly 
          value={value} 
          placeholder="Cron schedule will appear here..." 
          className="flex-grow"
          style={{ maxWidth: '250px' }} // Limit width of the read-only input
        />
        {/* Button to clear the schedule */}
        {value && !readOnly && !disabled && (
          <Button 
            type="button" 
            variant="secondary" // Make the clear button red
            size="sm"
            onClick={() => {
              onChange(""); // Clear the value
              toast.success("Cron schedule will be removed after job update"); // Show success toast message
            }}
            aria-label="Remove schedule"
          >
            <X className="h-4 w-4 text-destructive" />
            Clear
          </Button>
        )}
      </div>

      {/* Basic attempt to style antd components used by react-js-cron */}
      {/* This might need refinement based on inspecting element classes */}
      <style jsx global>{`
        /* Override antd styles for better theme integration */
        .react-js-cron {
          --react-js-cron-select-bg: var(--background);
          --react-js-cron-select-color: var(--foreground);
          --react-js-cron-select-border-color: var(--input);
          --react-js-cron-primary-color: var(--primary);
          
          /* Additional overrides may be needed */
        }
        
        /* Dark mode support */
        .dark .react-js-cron .ant-select-dropdown,
        .dark .react-js-cron .ant-select-item,
        .dark .react-js-cron .ant-select-selection-item {
          background-color: hsl(var(--background));
          color: hsl(var(--foreground));
        }
        
        /* Fix dropdown positioning */
        .ant-select-dropdown {
          z-index: 1000;
        }
      `}</style>
    </div>
  );
};

export default CronScheduler; 