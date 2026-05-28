// Initialize ~/preview[-dev]/ on launch so the directory is browsable
// before the user has done anything. Idempotent.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { previewRoot } from "../util/paths";

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

export async function ensurePreviewRoot(): Promise<void> {
  const root = previewRoot();
  await mkdir(join(root, "repos"), { recursive: true });
  await ensureFile(join(root, "config.json"), EMPTY_JSON);
}
