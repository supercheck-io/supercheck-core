"use client";

// Adapted from shadcn/ui toast component
// https://ui.shadcn.com/docs/components/toast

export type ToastProps = {
  title?: string;
  description?: string;
  variant?: "default" | "destructive";
  duration?: number;
};

export type ToastState = ToastProps & {
  id: string;
  visible: boolean;
};

// Export the toastState so it can be used by the Toast component
export const toastState: {
  toasts: ToastState[];
  listeners: Set<(toasts: ToastState[]) => void>;
  dismiss: (id: string) => void;
} = {
  toasts: [],
  listeners: new Set(),
  dismiss: (id: string) => dismissToast(id),
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

// This is just a placeholder - the actual UI is implemented in toast.tsx
export function Toaster() {
  return null;
}

// Simple implementation for our needs
export const toast = (props: ToastProps) => {
  console.log(`Toast: ${props.title} - ${props.description}`);
  return addToast(props);
};
