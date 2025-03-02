"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { ToastProps } from "./use-toast";

type ToastState = ToastProps & {
  id: string;
  visible: boolean;
};

export function Toast({ title, description, variant = "default", id }: ToastState) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  const variantClasses = {
    default: "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100",
    destructive: "bg-red-600 text-white dark:bg-red-900",
  };

  return (
    <div
      className={`
        fixed bottom-4 right-4 z-50 rounded-md shadow-lg 
        ${variantClasses[variant]} 
        p-4 transition-all duration-300 ease-in-out
        ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}
      `}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1">
          {title && <h3 className="font-medium">{title}</h3>}
          {description && <p className="text-sm opacity-90 mt-1">{description}</p>}
        </div>
        <button
          onClick={() => setIsVisible(false)}
          className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>
      </div>
    </div>
  );
}

export function Toaster() {
  // This is a simplified version - in a real app, you'd connect to the toast state
  const [toasts, setToasts] = useState<ToastState[]>([]);
  
  // For this simple implementation, we'll just return null
  // In a real app, you'd render the list of toasts
  return null;
}
