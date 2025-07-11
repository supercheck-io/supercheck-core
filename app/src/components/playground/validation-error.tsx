import React from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, X, MapPin, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ValidationErrorProps {
  error: string;
  line?: number;
  column?: number;
  errorType?: string;
  onDismiss?: () => void;
  className?: string;
}

export function ValidationError({ 
  error, 
  line, 
  column, 
  errorType, 
  onDismiss, 
  className 
}: ValidationErrorProps) {
  // Extract the core error message without redundant information
  const getCleanErrorMessage = (errorMessage: string) => {
    // Remove redundant "at line X" text since we show it separately
    let cleanMessage = errorMessage.replace(/\s+at line \d+(?:, column \d+)?/g, '');
    
    // Remove "Security Error:" prefix if present
    cleanMessage = cleanMessage.replace(/^Security Error:\s*/i, '');
    
    // Capitalize first letter
    cleanMessage = cleanMessage.charAt(0).toUpperCase() + cleanMessage.slice(1);
    
    return cleanMessage;
  };

  // Get error category for styling
  const getErrorCategory = (type?: string, message?: string) => {
    if (type === 'syntax') return { label: 'Syntax', color: 'text-red-600' };
    if (type === 'security') return { label: 'Security', color: 'text-red-600' };
    if (type === 'complexity') return { label: 'Complexity', color: 'text-amber-600' };
    if (type === 'length') return { label: 'Length', color: 'text-amber-600' };
    return { label: 'Error', color: 'text-red-600' };
  };

  const cleanMessage = getCleanErrorMessage(error);
  const category = getErrorCategory(errorType, error);

  return (
    <Alert
      variant="destructive"
      className={`border border-red-600 bg-gray-300/90 shadow-lg rounded-md px-5 py-4 ${className}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className="flex items-center justify-center h-10 w-10 rounded-full bg-red-50 border border-red-200 mr-2">
            <Info className="h-5 w-5 text-red-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <span className={`text-base font-semibold tracking-tight ${category.color}`}>
                {category.label} Error
              </span>
              {line && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded-md border border-red-200">
                  <MapPin className="h-3 w-3" />
                  Line {line}{column ? `:${column}` : ''}
                </span>
              )}
            </div>
            <AlertDescription className="text-sm text-gray-800 leading-relaxed">
              {cleanMessage}
            </AlertDescription>
          </div>
        </div>
        {onDismiss && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onDismiss}
            className="h-8 w-8 ml-2 bg-gray-300 text-red-500 hover:text-red-700 hover:bg-red-100 rounded-full transition"
            aria-label="Dismiss error"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </Alert>
  );
}

export default ValidationError; 