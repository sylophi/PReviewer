import { Button } from "./ui/button";

interface ErrorFallbackProps {
  error: Error;
  scope: "app" | "view";
  action?: { label: string; onClick: () => void };
}

export function ErrorFallback({ error, scope, action }: ErrorFallbackProps) {
  return (
    <div className="flex h-full min-h-0 w-full items-center justify-center bg-background p-8">
      <div className="max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          {scope === "app" ? "Application error" : "View error"}
        </div>
        <h2 className="mt-2 text-lg font-semibold text-foreground">Something went wrong</h2>
        <p className="mt-2 select-text text-sm text-muted-foreground">{error.message}</p>
        {action ? (
          <Button variant="default" className="mt-4" onClick={action.onClick}>
            {action.label}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
