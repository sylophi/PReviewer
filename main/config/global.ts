// Per-user global config at ~/preview[-dev]/config.json. Holds
// preferences that span the whole app (theme, editor font). The schema
// lives in @shared/schemas so the renderer and the IPC contract share
// it; this module owns the disk IO and a short read cache.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type GlobalConfig, GlobalConfigSchema, type Theme, ThemeSchema } from "@shared/schemas";
import { atomicWriteJson, readJsonOrNull } from "../util/jsonFile";
import { previewRoot } from "../util/paths";
import { ttlValueCache } from "../util/ttlCache";

function configPath(): string {
  return join(previewRoot(), "config.json");
}

const cache = ttlValueCache<GlobalConfig>(
  5_000,
  async () => (await readJsonOrNull(configPath(), GlobalConfigSchema)) ?? {},
);

export async function readGlobalConfig(): Promise<GlobalConfig> {
  return cache.get();
}

export async function writeGlobalConfig(config: GlobalConfig): Promise<void> {
  await atomicWriteJson(configPath(), GlobalConfigSchema.parse(config));
  cache.invalidate();
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
