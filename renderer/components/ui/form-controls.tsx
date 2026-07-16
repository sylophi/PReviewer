import type { InputHTMLAttributes, ReactNode } from "react";
import { cn, focusRing } from "@/lib/utils";

const baseField = cn(
  "h-9 w-full rounded-lg border border-input bg-background px-2 text-sm text-foreground outline-none transition-colors disabled:opacity-50",
  focusRing,
);

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
      {label}
      {children}
    </label>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(baseField, className)} {...rest} />;
}
