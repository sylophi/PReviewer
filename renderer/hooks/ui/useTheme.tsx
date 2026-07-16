import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Theme } from "@shared/schemas";
import { useGlobalConfig, useGlobalConfigPatch } from "@/hooks/config/useGlobalConfig";

const STORAGE_KEY = "previewer.theme";

interface ThemeContextValue {
  // The user's saved pick (from config.json). "system" follows the OS.
  theme: Theme;
  // The actually-applied mode after resolving "system" against the OS.
  resolved: "light" | "dark";
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

// Boot hint: the persisted source of truth is config.json (async), but
// reading it would flash the wrong theme for a frame. Mirror the saved
// value into localStorage on every change and trust it until the
// config query resolves.
function readBootHint(): Theme {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    // localStorage may be unavailable; fall through.
  }
  return "system";
}

function systemDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyDocumentTheme(resolved: "light" | "dark"): void {
  const html = document.documentElement;
  html.classList.toggle("dark", resolved === "dark");
  html.style.colorScheme = resolved;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { data: config, isLoading } = useGlobalConfig();
  const patch = useGlobalConfigPatch();

  const [bootHint] = useState<Theme>(() => readBootHint());
  const theme: Theme = isLoading ? bootHint : (config?.theme ?? "system");

  const [osDark, setOsDark] = useState<boolean>(() => systemDark());
  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setOsDark(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const resolved: "light" | "dark" = theme === "system" ? (osDark ? "dark" : "light") : theme;

  useEffect(() => {
    applyDocumentTheme(resolved);
    // Push the resolved value (not the raw pick) so the main process's
    // nativeTheme.themeSource lands on a concrete light/dark for the
    // vibrancy material instead of re-resolving "system" against the OS.
    void window.api.runtime.setTheme(resolved);
  }, [resolved]);

  // Mirror the saved value into localStorage so the next launch paints
  // without waiting for the config query.
  useEffect(() => {
    if (isLoading) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Best-effort; the pick still takes effect this session.
    }
  }, [isLoading, theme]);

  // React Compiler memoizes the callback and the context value; no
  // manual useMemo needed.
  const setTheme = (next: Theme) => patch.mutate({ theme: next });

  const value = { theme, resolved, setTheme };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
