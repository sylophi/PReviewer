import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Settings as SettingsIcon } from "lucide-react";
import { cn, dragRegion } from "@/lib/utils";
import { buttonVariants } from "./ui/button";

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
// on the dashboard and diff surfaces; theme + editor prefs live on that
// page now rather than as a toolbar toggle.
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
