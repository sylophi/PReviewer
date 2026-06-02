# PReview

A desktop app for reviewing git diffs. It's the place you do code review.

PReview is shaped like a stripped-down code editor whose default file-open
mode is "diff" — not a diff viewer with an editor bolted on, but an editor
whose only job is review. It's built for two people: the reviewer reading a
teammate's PR across several sittings against a moving target, and the
reviewer reading end-to-end through a working tree an agent just filled with
changes.

## What it does

- **Persistent review state.** Create named diffs — a pull request, any
  ref-to-ref pair, or your working tree against HEAD — and they sit in a
  dashboard you return to across sessions. Your per-file "reviewed" state is
  never lost. When the right side moves underneath you (a force-push, a new
  commit), the affected files are flagged **needs re-review** so you can see
  what changed since you last looked.

- **Diff-aware reading.** Each file opens as a tab in a Monaco diff editor
  showing the whole file with the change in context, split (default) or
  unified. Syntax highlighting is TextMate-grade via Shiki — Monokai Pro in
  dark, Pierre in light — and the editor is LSP-capable, so you can navigate
  while you read rather than just scroll a patch.

- **The whole tree, not just the changes.** A resizable file tree lists the
  changed files or the full project tree, with material file icons and
  per-file diff stats, so you can open any file to trace a symbol back to its
  source.

- **Edit in place.** When the right side of a diff is the live working tree,
  it's editable; edits debounce to disk so you can verify a theory in your
  terminal without leaving the review.

- **Worktrees, read-only.** A diff can be bound to a specific git worktree so
  it reads that checkout's state. PReview never runs `git checkout` — opening
  a diff never disturbs what you have checked out. Deleted worktrees are
  detected and unbound automatically.

- **Pull requests via the GitHub CLI.** If `gh` is installed and
  authenticated, browse a repo's PRs and open one as a diff. PReview resolves
  the same three-dot merge base `gh pr diff` uses, so a merged PR still reads
  as "what this PR changed."

## Requirements

- macOS
- `git` on your PATH
- [`gh`](https://cli.github.com) (optional) — only for the pull-request
  source; everything else works without it

## Development

```sh
pnpm install
pnpm dev        # electron-forge start
```

Other scripts:

```sh
pnpm typecheck  # tsc --noEmit
pnpm lint       # oxlint
pnpm make       # build a distributable
pnpm icon       # regenerate assets/icon.{png,icns} (needs uv)
```

State lives in `~/Library/Application Support/PReview` (and `PReview-dev`
during development) — config plus one JSON file per diff. PReview stores no
worktrees or repo contents of its own; it only reads the repos you point it
at.

## Stack

Electron + Vite, React 19 with TanStack Router and Query, Monaco
(`@monaco-editor/react`) for the diff editor, Shiki bridged into Monaco for
syntax themes, Tailwind v4. The main process talks to the renderer over a
contract-driven, zod-validated IPC layer (`shared/ipc/`).
