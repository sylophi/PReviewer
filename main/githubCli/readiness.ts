// Readiness probe for the gh CLI. 30-second cache so we don't shell
// out on every IPC call.
import { type GhReadiness } from "@shared/schemas";
import { ttlValueCache } from "../util/ttlCache";
import { runFile } from "./exec";

async function checkInstalled(): Promise<boolean> {
  try {
    await runFile("gh", ["--version"], { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

async function checkAuthed(): Promise<boolean> {
  try {
    // gh auth status exits non-zero when not authenticated.
    await runFile("gh", ["auth", "status"], { timeout: 4000 });
    return true;
  } catch {
    return false;
  }
}

const readinessCache = ttlValueCache<GhReadiness>(30_000, async () => {
  const installed = await checkInstalled();
  if (!installed) return { installed: false, authed: false };
  const authed = await checkAuthed();
  return { installed, authed };
});

export function ghReadiness(): Promise<GhReadiness> {
  return readinessCache.get();
}

// Throws when gh isn't usable. Every public PR query should await this
// before shelling out so the failure mode is a clear toast rather than
// a confusing exec error.
export async function ensureReady(): Promise<void> {
  const r = await ghReadiness();
  if (!r.installed) throw new Error("GitHub CLI (gh) is not installed.");
  if (!r.authed) {
    throw new Error("GitHub CLI is not authenticated. Run `gh auth login`.");
  }
}
