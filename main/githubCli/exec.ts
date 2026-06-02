// Shared gh-process plumbing. execFile (no shell) means every arg is
// passed as a vector — no string concatenation, no quoting bugs.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const runFile = promisify(execFile);
