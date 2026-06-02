import { toast } from "sonner";

export function notifyError(title: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  toast.error(title, { description: message });
}

export function notify(title: string, description?: string): void {
  toast(title, { description });
}
