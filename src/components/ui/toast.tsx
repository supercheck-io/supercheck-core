"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { ToastState, toastState } from "./use-toast";

export function Toast({ title, description, variant = "default", id }: ToastState) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  const handleClose = () => {
    setIsVisible(false);
    // Dismiss the toast after animation
    setTimeout(() => {
      toastState.dismiss(id);
    }, 300);
  };

  const variantClasses = {
    default: "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100",
    destructive: "bg-red-600 text-white dark:bg-red-900",
  };

  return (
    <div
      className={`
        rounded-md shadow-lg 
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
          onClick={handleClose}
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
  const [toasts, setToasts] = useState<ToastState[]>([]);
  
  useEffect(() => {
    const listener = (updatedToasts: ToastState[]) => {
      setToasts(updatedToasts);
    };

    toastState.listeners.add(listener);
    
    // Initial check for any existing toasts
    if (toastState.toasts.length > 0) {
      setToasts([...toastState.toasts]);
    }
    
    return () => {
      toastState.listeners.delete(listener);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-0 right-0 z-50 flex flex-col gap-2 p-4 max-w-md w-full">
      {toasts.map((toast) => (
        <Toast key={toast.id} {...toast} />
      ))}
    </div>
  );
}
