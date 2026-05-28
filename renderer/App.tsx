import { RouterProvider } from "@tanstack/react-router";
import { ErrorBoundary, type FallbackProps } from "react-error-boundary";
import { ErrorFallback } from "@/components/ErrorFallback";
import { DialogsProvider } from "@/hooks/ui/useDialogs";
import { ThemeProvider } from "@/hooks/ui/useTheme";
import { router } from "./router";

function AppErrorFallback({ error }: FallbackProps) {
  const err = error instanceof Error ? error : new Error(String(error));
  return (
    <ErrorFallback
      error={err}
      scope="app"
      action={{
        label: "Reload window",
        onClick: () => window.location.reload(),
      }}
    />
  );
}

export function App() {
  return (
    <ThemeProvider>
      <ErrorBoundary FallbackComponent={AppErrorFallback}>
        <DialogsProvider>
          <RouterProvider router={router} />
        </DialogsProvider>
      </ErrorBoundary>
    </ThemeProvider>
  );
}
