// Single chokepoint for every git invocation. Other modules in this
// folder call `run` / `runLenient`; nothing else in the codebase should
// shell out to git directly. Uses execFile (no shell) to avoid any
// possibility of argument injection.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

async function runGit(
  args: string[],
  options: { cwd: string; maxBuffer?: number },
): Promise<{ stdout: string }> {
  const start = performance.now();
  try {
    const result = await execFileP("git", args, options);
    const elapsed = Math.round(performance.now() - start);
    console.log(`[git] ${args.join(" ")} (${elapsed}ms)`);
    return { stdout: result.stdout };
  } catch (err) {
    const elapsed = Math.round(performance.now() - start);
    console.warn(`[git] ${args.join(" ")} FAIL (${elapsed}ms)`);
    throw err;
  }
}

export async function run(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await runGit(args, { cwd, maxBuffer: 10 * 1024 * 1024 });
  return stdout;
}

// Like run, but tolerates non-zero exit (e.g. git diff --no-index,
// which exits 1 whenever there's a diff to print). Returns whatever
// stdout was produced before exit, falling back to empty.
export async function runLenient(cwd: string, args: string[]): Promise<string> {
  try {
    return await run(cwd, args);
  } catch (err) {
    return (err as { stdout?: string }).stdout ?? "";
  }
}

export async function isGitRepo(path: string): Promise<boolean> {
  try {
    await runGit(["rev-parse", "--git-dir"], { cwd: path });
    return true;
  } catch {
    return false;
  }
}

// git remote get-url origin, swallowing the "no origin" failure.
// Null lets callers distinguish "no remote" from "unknown".
export async function getOriginUrl(cwd: string): Promise<string | null> {
  try {
    const out = await run(cwd, ["remote", "get-url", "origin"]);
    const trimmed = out.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}
