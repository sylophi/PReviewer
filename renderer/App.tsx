import { useEffect } from "react";
import { RouterProvider } from "@tanstack/react-router";
import { ErrorBoundary, type FallbackProps } from "react-error-boundary";
import { ErrorFallback } from "@/components/ErrorFallback";
import { modalIsOpen } from "@/components/diff/useDiffKeyboard";
import { DialogsProvider } from "@/hooks/ui/useDialogs";
import { ThemeProvider } from "@/hooks/ui/useTheme";
import { router } from "./router";

// The app menu rebinds Close Window to ⌘⇧W so the diff view can use ⌘W
// for closing tabs. This bubble-phase fallback restores the standard
// "⌘W closes the window" behavior everywhere the diff view doesn't
// claim the event (dashboard, settings, diff view with no open tabs —
// its capture-phase handler stops propagation when it closes a tab).
function useCloseWindowFallback(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
      if (e.key.toLowerCase() !== "w") return;
      if (modalIsOpen()) return;
      e.preventDefault();
      window.close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

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
  useCloseWindowFallback();
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
