// Per-user global config at ~/preview[-dev]/config.json. Today we only
// read the saved theme; full read/write helpers will return when the
// settings surface lands.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { type Theme, ThemeSchema } from "@shared/schemas";
import { previewRoot } from "../util/paths";

export const GlobalConfigSchema = z.object({
  theme: ThemeSchema.optional(),
});
export type GlobalConfig = z.infer<typeof GlobalConfigSchema>;

function configPath(): string {
  return join(previewRoot(), "config.json");
}

// Sync read used by the main process at window-create time, where async
// IO would race the BrowserWindow constructor. Any parse failure falls
// back to "system" so a corrupt config can never block startup.
export function readThemeSync(): Theme {
  try {
    const raw = readFileSync(configPath(), "utf8");
    const parsed = ThemeSchema.safeParse((JSON.parse(raw) as { theme?: unknown }).theme);
    return parsed.success ? parsed.data : "system";
  } catch {
    return "system";
  }
}
