import type { HTMLAttributes, ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded font-medium uppercase tracking-wide",
  {
    variants: {
      tone: {
        neutral: "bg-muted text-muted-foreground",
        added: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
        removed: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
        modified: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
        renamed: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
        merged: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
        info: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
        warn: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
        success: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
        danger: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
      },
      size: {
        default: "h-5 px-1.5 text-[10px]",
        sm: "h-4 px-1 text-[9px] leading-none",
      },
      mono: {
        true: "font-mono",
        false: "normal-case tracking-normal",
      },
    },
    defaultVariants: { tone: "neutral", size: "default", mono: false },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  children?: ReactNode;
}

export function Badge({ className, tone, size, mono, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone, size, mono }), className)} {...props} />;
}
