// Functional smoke test for the main/git layer, run against throwaway
// fixture repos in the system temp dir. Exercises: unborn-HEAD diffs,
// rename detection + left-side read at fromPath, binary kind, snapshot
// blob write/read, and working-tree hashing with a vanished file.
//
// Run with: pnpm verify:git  (no Electron needed; main/git is plain Node)
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { resolveAndDiff } from "../main/git/diff.ts";
import { readFileAtRef } from "../main/git/files.ts";
import { blobHashesAtWorkingTree, readBlob, writeBlobFromWorkingTree } from "../main/git/hashes.ts";

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`PASS ${name}`);
  else {
    failures++;
    console.log(`FAIL ${name}`, detail ?? "");
  }
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

function newRepo(objectFormat?: "sha256"): string {
  const dir = mkdtempSync(join(tmpdir(), "previewer-verify-"));
  const init = ["init", "-q", "-b", "main"];
  if (objectFormat) init.push(`--object-format=${objectFormat}`);
  git(dir, ...init);
  git(dir, "config", "user.email", "t@t.t");
  git(dir, "config", "user.name", "t");
  return dir;
}

async function main() {
  // --- 1. Unborn HEAD: working tree vs HEAD in a repo with no commits ---
  const unborn = newRepo();
  writeFileSync(join(unborn, "staged.txt"), "staged\n");
  git(unborn, "add", "staged.txt");
  writeFileSync(join(unborn, "loose.txt"), "loose\n");
  try {
    const r = await resolveAndDiff(unborn, { kind: "head" }, { kind: "workingTree" });
    const paths = r.files.map((f) => f.path).sort();
    check("unborn: resolves without throwing", true);
    check(
      "unborn: staged + untracked files listed",
      paths.includes("staged.txt") && paths.includes("loose.txt"),
      paths,
    );
  } catch (e) {
    check("unborn: resolves without throwing", false, e);
  }
  // Left-side read of a file in the unborn repo must not throw either.
  const leftContent = await readFileAtRef(unborn, { kind: "head" }, "staged.txt");
  check("unborn: left-side read returns null (no content at HEAD)", leftContent === null);

  // --- 2. Rename detection + fromPath ---
  const renames = newRepo();
  writeFileSync(join(renames, "old-name.txt"), "line1\nline2\nline3\nline4\nline5\n");
  git(renames, "add", ".");
  git(renames, "commit", "-qm", "base");
  git(renames, "mv", "old-name.txt", "new-name.txt");
  writeFileSync(join(renames, "new-name.txt"), "line1\nline2 changed\nline3\nline4\nline5\n");
  git(renames, "add", ".");
  git(renames, "commit", "-qm", "rename");
  const rr = await resolveAndDiff(
    renames,
    { kind: "commit", hash: "HEAD~1" },
    { kind: "commit", hash: "HEAD" },
  );
  const renamed = rr.files.find((f) => f.path === "new-name.txt");
  check("rename: kind is renamed", renamed?.kind === "renamed", renamed);
  check("rename: fromPath preserved", renamed?.fromPath === "old-name.txt", renamed);
  // The left side must be readable at fromPath (what the renderer now requests).
  const leftAtFrom = await readFileAtRef(
    renames,
    { kind: "commit", hash: "HEAD~1" },
    "old-name.txt",
  );
  check("rename: left content readable at fromPath", leftAtFrom?.startsWith("line1") === true);

  // --- 3. Binary kind from numstat ---
  const bin = newRepo();
  writeFileSync(join(bin, "blob.bin"), Buffer.from([0, 1, 2, 3, 0, 255, 254]));
  writeFileSync(join(bin, "text.txt"), "hello\n");
  git(bin, "add", ".");
  git(bin, "commit", "-qm", "base");
  writeFileSync(join(bin, "blob.bin"), Buffer.from([9, 9, 0, 9, 255, 0]));
  writeFileSync(join(bin, "text.txt"), "hello world\n");
  git(bin, "add", ".");
  git(bin, "commit", "-qm", "change");
  const br = await resolveAndDiff(
    bin,
    { kind: "commit", hash: "HEAD~1" },
    { kind: "commit", hash: "HEAD" },
  );
  const binFile = br.files.find((f) => f.path === "blob.bin");
  const txtFile = br.files.find((f) => f.path === "text.txt");
  check("binary: .bin flagged as binary", binFile?.kind === "binary", binFile);
  check("binary: text stays modified", txtFile?.kind === "modified", txtFile);

  // --- 4. Snapshot blob write + read roundtrip ---
  const snap = newRepo();
  writeFileSync(join(snap, "watched.txt"), "version at review time\n");
  git(snap, "add", ".");
  git(snap, "commit", "-qm", "base");
  writeFileSync(join(snap, "watched.txt"), "version at review time + my read\n");
  const hash = await writeBlobFromWorkingTree(snap, "watched.txt");
  check("snapshot: hash-object -w returns an oid", hash !== null, hash);
  // File moves on after review...
  writeFileSync(join(snap, "watched.txt"), "totally different now\n");
  const recovered = hash ? await readBlob(snap, hash) : null;
  check(
    "snapshot: content recoverable after file changed",
    recovered === "version at review time + my read\n",
    recovered,
  );
  const missing = await readBlob(snap, "0".repeat(40));
  check("snapshot: missing blob reads as null", missing === null);

  // --- 5. Working-tree hashing with a vanished file ---
  const gone = newRepo();
  writeFileSync(join(gone, "a.txt"), "a\n");
  writeFileSync(join(gone, "b.txt"), "b\n");
  git(gone, "add", ".");
  git(gone, "commit", "-qm", "base");
  unlinkSync(join(gone, "b.txt"));
  const map = await blobHashesAtWorkingTree(gone, ["a.txt", "b.txt", "never-existed.txt"]);
  check("vanished: surviving file hashed", map.has("a.txt"), [...map.keys()]);
  check(
    "vanished: missing files skipped, no throw",
    !map.has("b.txt") && !map.has("never-existed.txt"),
  );

  // --- 6. SHA-256 repo: unborn HEAD + reviewed hashes ---
  // The empty-tree object id is hash-algorithm dependent, and blob ids
  // are 64-hex here; both used to be hardcoded to SHA-1 shapes.
  const s256 = newRepo("sha256");
  writeFileSync(join(s256, "new.ts"), "export const x = 1;\n");
  try {
    const r = await resolveAndDiff(s256, { kind: "head" }, { kind: "workingTree" });
    check(
      "sha256: unborn HEAD diffs against the right empty tree",
      r.files.some((f) => f.path === "new.ts"),
      r.files,
    );
  } catch (e) {
    check("sha256: unborn HEAD diffs against the right empty tree", false, e);
  }
  git(s256, "add", ".");
  git(s256, "commit", "-qm", "base");
  writeFileSync(join(s256, "new.ts"), "export const x = 2;\n");
  const s256Hash = await writeBlobFromWorkingTree(s256, "new.ts");
  check("sha256: 64-hex blob id accepted", s256Hash !== null && s256Hash.length === 64, s256Hash);
  check(
    "sha256: snapshot content recoverable",
    s256Hash !== null && (await readBlob(s256, s256Hash)) === "export const x = 2;\n",
  );

  for (const d of [unborn, renames, bin, snap, gone, s256]) {
    rmSync(d, { recursive: true, force: true });
  }
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
