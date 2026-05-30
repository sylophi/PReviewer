import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Theme } from "@shared/schemas";

const STORAGE_KEY = "preview.theme";

interface ThemeContextValue {
  // The user's pick. "system" follows the OS.
  theme: Theme;
  // The actually-applied mode after resolving "system" against the OS.
  resolved: "light" | "dark";
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStored(): Theme {
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
  const [theme, setThemeState] = useState<Theme>(() => readStored());
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
    // nativeTheme.themeSource always ends up as a concrete light/dark
    // instead of bouncing through "system" and re-resolving against the
    // OS. The MediaQuery listener above keeps `resolved` in sync when
    // the user is on "system" and the OS appearance changes.
    void window.api.runtime.setTheme(resolved);
  }, [resolved]);

  const setTheme = useCallback((next: Theme) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Best-effort; the user's pick still takes effect for this session.
    }
    setThemeState(next);
  }, []);

  const value = useMemo(() => ({ theme, resolved, setTheme }), [theme, resolved, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
