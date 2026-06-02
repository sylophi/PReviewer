import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Moon, MonitorSmartphone, Settings as SettingsIcon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/ui/useTheme";
import { cn, dragRegion } from "@/lib/utils";
import { Button, buttonVariants } from "./ui/button";

// The top strip on every route. Opaque bg-background matches the canvas
// below; a hairline bottom border separates the chrome from the content.
// pl-[92px] reserves the traffic-light column; the whole strip is a
// drag region with no-drag holes carved by `ToolbarActions` (and any
// nested interactive elements).
export function AppToolbar({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <header
      style={dragRegion("drag")}
      className={cn(
        "flex h-[52px] shrink-0 items-center gap-2 border-b border-border bg-background pl-[92px] pr-3",
        className,
      )}
    >
      {children}
    </header>
  );
}

// Convenience wrapper for the action cluster on the right side of a
// toolbar. The cluster carves out a single no-drag region so consumers
// don't have to repeat the style on every button.
export function ToolbarActions({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      style={dragRegion("no-drag")}
      className={cn("flex shrink-0 items-center gap-1", className)}
    >
      {children}
    </div>
  );
}

// Gear link to the settings route. Sits in the toolbar action cluster
// next to the theme toggle on the dashboard and diff surfaces.
export function SettingsButton() {
  return (
    <Link
      to="/settings"
      className={cn(
        buttonVariants({ variant: "ghost", size: "icon-sm" }),
        "text-muted-foreground hover:text-foreground",
      )}
      title="Settings"
      aria-label="Settings"
    >
      <SettingsIcon />
    </Link>
  );
}

// Theme cycle (system → light → dark → system) rendered as a small ghost
// icon button. Lives in the toolbar of every route so the control is in
// a consistent position regardless of which surface the user is on.
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const next = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : MonitorSmartphone;
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => setTheme(next)}
      title={`Theme: ${theme}. Click to switch to ${next}.`}
      aria-label={`Theme: ${theme}. Switch to ${next}.`}
      className="text-muted-foreground hover:text-foreground"
    >
      <Icon />
    </Button>
  );
}
