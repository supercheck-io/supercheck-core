// Adapted from shadcn/ui toast component
// https://ui.shadcn.com/docs/components/toast

import { useState, useEffect } from "react";

export type ToastProps = {
  title?: string;
  description?: string;
  variant?: "default" | "destructive";
  duration?: number;
};

type ToastState = ToastProps & {
  id: string;
  visible: boolean;
};

const toastState: {
  toasts: ToastState[];
  listeners: Set<(toasts: ToastState[]) => void>;
} = {
  toasts: [],
  listeners: new Set(),
};

const addToast = (toast: ToastProps) => {
  const id = Math.random().toString(36).substring(2, 9);
  const newToast: ToastState = {
    ...toast,
    id,
    visible: true,
    duration: toast.duration || 5000,
  };

  toastState.toasts = [...toastState.toasts, newToast];
  notifyListeners();

  // Auto dismiss
  setTimeout(() => {
    dismissToast(id);
  }, newToast.duration);

  return id;
};

const dismissToast = (id: string) => {
  toastState.toasts = toastState.toasts.filter((toast) => toast.id !== id);
  notifyListeners();
};

const notifyListeners = () => {
  toastState.listeners.forEach((listener) => {
    listener([...toastState.toasts]);
  });
};

export function useToast() {
  return {
    toast: (props: ToastProps) => addToast(props),
    dismiss: (id: string) => dismissToast(id),
  };
}

export function Toaster() {
  const [toasts, setToasts] = useState<ToastState[]>([]);

  useEffect(() => {
    const listener = (updatedToasts: ToastState[]) => {
      setToasts(updatedToasts);
    };

    toastState.listeners.add(listener);
    return () => {
      toastState.listeners.delete(listener);
    };
  }, []);

  return null; // We'll implement the actual UI in a separate component
}

// Simple implementation for our needs
export const toast = (props: ToastProps) => {
  console.log(`Toast: ${props.title} - ${props.description}`);
  return addToast(props);
};
