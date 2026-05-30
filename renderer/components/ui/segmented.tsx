import { cn, focusRing } from "@/lib/utils";

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
  title?: string;
}

interface SegmentedProps<T extends string> {
  value: T;
  onChange: (next: T) => void;
  options: SegmentedOption<T>[];
  label: string;
  className?: string;
  size?: "sm" | "md";
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
  size = "sm",
}: SegmentedProps<T>) {
  const wrapText = size === "md" ? "text-sm" : "text-xs";
  const btnPad = size === "md" ? "px-3 py-1.5" : "px-2 py-1";
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "inline-flex shrink-0 self-center rounded-md border border-border bg-muted/30 p-0.5",
        wrapText,
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            disabled={opt.disabled}
            title={opt.title}
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={cn(
              "rounded outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-50",
              btnPad,
              focusRing,
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
