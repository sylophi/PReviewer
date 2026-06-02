// Initialize the app-data root on launch so it's ready before the user
// has done anything. Idempotent.
import { existsSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { legacyPreviewRoot, previewRoot } from "../util/paths";

const EMPTY_JSON = "{}\n";

async function ensureFile(path: string, contents: string): Promise<void> {
  try {
    // `wx` fails if the file exists; race-safe "create if missing".
    await writeFile(path, contents, { flag: "wx", encoding: "utf8" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return;
    throw error;
  }
}

// One-time relocation: earlier builds kept state in ~/preview[-dev].
// If that legacy dir exists and the new app-data root doesn't yet, move
// it over so existing diffs + config carry across. Best-effort — a
// failure just leaves the user on a fresh empty root. Safe to delete
// this shim once no installs remain on the old layout.
async function migrateLegacyRoot(root: string): Promise<void> {
  const legacy = legacyPreviewRoot();
  if (legacy === root || !existsSync(legacy) || existsSync(root)) return;
  try {
    await mkdir(dirname(root), { recursive: true });
    await rename(legacy, root);
  } catch {
    // Ignore; ensurePreviewRoot below still creates a usable root.
  }
}

export async function ensurePreviewRoot(): Promise<void> {
  const root = previewRoot();
  await migrateLegacyRoot(root);
  await mkdir(join(root, "repos"), { recursive: true });
  await ensureFile(join(root, "config.json"), EMPTY_JSON);
}
