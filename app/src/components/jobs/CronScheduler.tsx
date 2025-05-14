"use client";

import React from "react";
import { Cron, OnError } from "react-js-cron";
import "react-js-cron/dist/styles.css"; // Import base styles
import { Input } from "@/components/ui/input"; // Import shadcn Input
import { Button } from "@/components/ui/button"; // Import shadcn Button
import { X } from "lucide-react"; // Import icon for clear button
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
  // Note: react-js-cron uses antd internally. Proper theme integration
  // with shadcn/ui might require more specific CSS overrides targeting
  // antd classes based on the current theme (light/dark).
  // This basic implementation uses the default styles.

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
            variant="destructive" // Make the clear button red
            size="sm"
            onClick={() => {
              onChange(""); // Clear the value
              toast.success("Cron schedule cleared"); // Show success toast message
            }}
            aria-label="Clear schedule"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Basic attempt to style antd components used by react-js-cron */}
      {/* This might need refinement based on inspecting element classes */}
      <style jsx global>{`
        /* Example: Adjust input background/text for dark theme */
        /* You'll need to inspect the actual rendered antd classes */
        html[data-theme='dark'] .cron-widget-container .ant-select-selector,
        html[data-theme='dark'] .cron-widget-container .ant-input-number-input {
          color: hsl(var(--foreground)); /* shadcn text color */
          border-color: hsl(var(--border)) !important; /* Ensure border color override */
          border-radius: 0 !important; /* Force sharp corners */
          /* Ensure background override even when empty/default */
          background-color: hsl(var(--input)) !important; 
        }
        html[data-theme='dark'] .cron-widget-container .ant-select-arrow {
           color: hsl(var(--muted-foreground));
        }
        html[data-theme='dark'] .cron-widget-container .ant-select-selection-placeholder {
           color: hsl(var(--muted-foreground)); /* Style placeholder text */
        }
        html[data-theme='dark'] .cron-widget-container .ant-select-item-option-content {
           color: hsl(var(--foreground)); /* Dropdown item text color */
        }
        html[data-theme='dark'] .cron-widget-container .ant-select-dropdown {
           background-color: hsl(var(--popover)); /* Dropdown background */
           border-color: hsl(var(--border));
        }
        html[data-theme='dark'] .cron-widget-container .ant-select-item-option-selected:not(.ant-select-item-option-disabled) {
            background-color: hsl(var(--accent)); /* Selected item background */
            color: hsl(var(--accent-foreground)); /* Selected item text */
        }
        html[data-theme='dark'] .cron-widget-container .ant-select-item-option-active:not(.ant-select-item-option-disabled) {
            background-color: hsl(var(--accent)); /* Hovered item background */
        }

        /* You might need similar overrides for light theme if defaults clash */
        /* Or adjust default antd styles for better consistency */
        .cron-widget-container .ant-select-selector,
        .cron-widget-container .ant-input-number-input {
            border-color: hsl(var(--input)); /* Match shadcn input border */
            border-radius: 0 !important; /* Force sharp corners */
            /* Ensure light mode defaults are also consistent */
            background-color: hsl(var(--input)); 
            color: hsl(var(--foreground));
        }
        .cron-widget-container .ant-select-dropdown {
             z-index: 50; /* Ensure dropdown appears above other elements */
             border-color: hsl(var(--border));
             background-color: hsl(var(--popover)); /* Explicitly set background for light mode */
        }

        /* General adjustments for spacing and borders */
        .cron-widget-container .ant-select,
        .cron-widget-container .ant-input-number {
          margin-right: 0.5rem; /* Add some space between dropdowns */
          margin-bottom: 0.5rem; /* Add some space below dropdowns */
        }

        /* Ensure dropdown items in light mode also look okay */
        .cron-widget-container .ant-select-item-option-content {
           color: hsl(var(--foreground));
        }
        .cron-widget-container .ant-select-item-option-selected:not(.ant-select-item-option-disabled) {
            background-color: hsl(var(--accent));
            color: hsl(var(--accent-foreground));
        }
        .cron-widget-container .ant-select-item-option-active:not(.ant-select-item-option-disabled) {
            background-color: hsl(var(--accent));
        }
      `}</style>
    </div>
  );
};

export default CronScheduler; 