import { useToast as useToastPrimitive } from "@/components/ui/use-toast";

export function useToast() {
  const { toast } = useToastPrimitive();

  return { toast };
}
