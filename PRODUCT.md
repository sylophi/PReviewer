# Product

## Register

product

## Users

Solo developers and small-team engineers who do code review as a real part of their day. Two concrete shapes:

1. The reviewer-of-others: PRs from teammates, reviewed across multiple sittings, sometimes against a moving target after force-pushes.
2. The reviewer-of-agents: their own working tree filled with changes an agent made, which they need to read end-to-end before keeping or rejecting.

Both share the same job: read a multi-file diff with enough surrounding context to form a real opinion, edit-to-theorize during the read, leave comments, and never lose your place between sessions.

The user is a competent developer who reads code for a living. They are not a casual user. They expect keyboard navigation, fast file switching, and the editor's reading affordances (jump-to-definition, hover types, find references).

## Product Purpose

PReviewer is a desktop app for reviewing git diffs. It is the place you do code review.

It is shaped like a stripped-down code editor whose default file-open mode is "diff." Not a diff viewer with an editor bolted on; an editor whose only job is review.

Three things it does well, in order of importance:

1. **Persistent review state.** You create named diffs (PR, ref-to-ref, working-tree-to-HEAD) and they sit in a dashboard. You return to them across sessions. Your per-file checked-off state is never lost. When the upstream content changes underneath you, the affected files are flagged "needs re-review" and you can see exactly what's new since you last looked, in a sub-view that shows `your-reviewed-snapshot ↔ current-right`. This is the single biggest pain GitLens did not solve.

2. **Diff-aware reading with LSP for navigation.** Each file opens as a tab. Inside the tab, a Monaco DiffEditor shows the whole file with the diff in context, split (default) or unified. The right side is LSP-aware: cmd+click to jump to definitions across the project, hover for types, find references, inline diagnostics. You can also open any non-changed file in the project to trace a symbol back to its source. The point is to theorize while reviewing, not to author.

3. **In-place editing and inline comments.** When the right side of a diff is the live working tree, you can edit it; changes debounce to disk so you can verify them in your terminal. Inline line comments draft locally and post to the PR as a single GitHub review when you submit. Non-PR diffs (agent work, local branch comparisons) keep comments as private notes attached to the diff.

It deliberately does not have: a source control panel, a terminal, an extensions marketplace, a debugger, a settings page of any depth, refactor menus, code actions, rename-symbol, quick-fixes, snippets, formatters, or any other surface that does not directly serve "read this diff and form an opinion."

## Brand Personality

Three-word personality: **focused, full, deliberate**.

Voice: confident tool, no marketing affect, expert defaults. The tool assumes the user knows what a diff, a ref, and an LSP are.

Visual lineage: same DNA as shigomori (Geist sans + mono, OKLCH neutrals, single accent reserved for primary actions, generous radii), in the family of Vercel's recent app surfaces and the tuneloupe / fileatlas / hewwo lineage shigomori cites. Native-feeling on macOS first.

**Layout posture differs from shigomori.** Shigomori is a small, modal-feeling utility; PReviewer is a full-page application. The dashboard fills the window. The diff view fills the window. No centered max-w-4xl columns floating in a sea of background. Use the real estate.

No themed-aesthetic pass is planned. PReviewer stays restrained because review is a serious, focused task and personality would compete with the diff content.

## Anti-references

- **Cursor / VS Code.** Not because of editor chrome (PReviewer is editor-shaped on purpose) but because of feature sprawl. Activity bar, status bar, extension marketplace, settings overload, every command on the palette, ten panels you never open. PReviewer is what's left when you remove everything from VS Code that is not diff review.
- **GitLens (full installation).** Hover decorations, line blames, commit graphs, side-by-side comparisons, file history panels, settings sprawl. PReviewer keeps GitLens's checkbox tracking primitive and fixes it (state persists across sessions, survives ref motion gracefully, supports multiple concurrent diffs).
- **GitHub.com PR pages.** Avatar density, conversation tabs, suggestion threads, the review-state machine as UI, marketing chrome, web-app patterns retrofitted onto a desktop tool. The PR is a source for a diff, not a workflow PReviewer reproduces. PReviewer posts comments back to the PR but does not become a GitHub web client.

## Design Principles

1. **Persistent review state is the differentiator.** The dashboard of named diffs is the centerpiece, not a side feature. v0 got this right and we keep it. Any feature that competes with "I returned and my progress is intact" loses.

2. **LSP for reading, not authoring.** Every LSP capability that helps you understand the code is in. Every LSP capability that helps you change the code is out, with one exception: live diagnostics on the right side, because if you theorize a fix you want to know it compiles. The line is sharp on purpose. cmd+click, hover, find references, diagnostics: yes. Rename, code actions, quick-fix, organize imports, format-on-save: no.

3. **Diff-as-default in an editor shell.** Each file opens as a tab. Tabs have VS Code preview/permanent semantics (single-click previews, double-click or edit promotes). The diff is full-file with context, not just hunks. Split is default; unified is a per-tab toggle.

4. **Full-page, not modal.** PReviewer fills the window. The dashboard is a real surface, not a centered card. The diff view is a real workspace, not a popup. This is the explicit break from shigomori's posture.

5. **No IDE features that don't serve review.** If a feature feels like it belongs in a "VS Code Tips & Tricks" article and not a "How to review code well" article, it doesn't belong.

## Decisions for v0.1

- **Platform:** Electron + Vite + React + TanStack Router + React Query + Tailwind + shadcn. Same stack as v0; the stack was not the problem.
- **Diff rendering:** Monaco DiffEditor (whole-file context, real editor affordances), not `@pierre/diffs` (hunks only).
- **Tabs:** VS Code preview/permanent semantics. Single click in file tree opens a preview tab that the next click replaces; double click or starting to edit promotes to a permanent tab.
- **Diff layout:** split as default, unified as a per-tab toggle.
- **File tree:** changed-only (default) or full-tree (toggle). Full-tree is required because you cmd+click into non-changed files.
- **Review tracking:** per-file checkboxes. Per-hunk is rejected for v0.1 because file sizes vary too much for hunk count to be a meaningful unit, and it matches what GitLens / GitHub do.
- **"Since last review" view:** when a file's content hash changes after being marked reviewed, the tab gets a "needs re-review" pill and a toggle. Toggle on switches the tab from `left ↔ right` to `your-reviewed-snapshot ↔ current-right`. Toggle off restores the full diff. Marking reviewed again updates the snapshot.
- **LSP:** typescript-language-server only for v0.1, bundled, one subprocess per repo. Polyglot is future work, not v0.1.
- **Editing:** working tree only, only when the right side IS the live checkout. Edits debounce to disk so they're visible to the user's external terminal. Pinning a diff to specific SHAs freezes the right side and disables editing (kept from v0).
- **Comments:** inline line comments, draft locally, "Submit Review" posts all drafts as a single GitHub PR review for PR diffs. Non-PR diffs keep comments as private notes on the diff object. No threading, no replying to existing comments, no suggestion blocks in v0.1.
- **Diff sources:** PR (gh CLI), branch ↔ branch, commit ↔ commit, working-tree ↔ HEAD, working-tree ↔ any-ref. Same set as v0.
- **Persistence:** diffs are named, listed per-repo on the dashboard, survive across sessions. Same model as v0.
- **Aesthetic:** shigomori DNA, full-page posture. The visual language wasn't the problem.

## What v0 got wrong (preserve this lesson)

v0's brief read "Cursor is heavy" as "don't be editor-shaped" and concluded PReviewer should be a diff dashboard that grudgingly allows inline editing. The implementer faithfully built that, with a `@pierre/diffs` hunk renderer, no LSP, and an "Edit" toggle that swaps to a Monaco pane.

The actual reading of "Cursor is heavy" should have been "Cursor has hundreds of features unrelated to diff review, weighs 800MB, and forces an IDE-shaped workflow that includes terminals and source control and extensions." The user wants editor-shape (tabs, LSP for reading, live edit, diagnostics). They do not want IDE-scope (refactor, debug, settings, extensions).

v0.1 inverts this: it is an editor whose only mode is diff. Restraint applies to feature scope, not to chrome.

## Out of scope for v0.1

- Polyglot LSP (Python, Go, Rust, etc.).
- Comment threading, replying to existing GH comments, suggestion blocks.
- Reading existing PR comments alongside the diff.
- Multi-tsconfig / monorepo project resolution beyond the obvious case.
- Review approval state (approve / request changes / comment-only). Submit posts comments; approval state stays on GH.
- Anything resembling a settings page beyond theme.
- Search across all files in a diff or repo (we have `@pierre/diffs`-style file path search from v0, that's enough).
- Side-by-side multiple-diff comparison.

## Ports from v0

Direct ports (1:1):

- `renderer/components/FolderPickerModal.tsx`: the file picker, taken whole.

Port the UI primitives, then build new structure on top:

- `renderer/components/ui/`: button, badge, segmented, skeleton, and other shadcn pieces.
- `renderer/lib/utils.ts`: `dragRegion`, `focusRing`, `cn`.
- `renderer/lib/toast.ts`: sonner config.
- `renderer/lib/relativeTime.ts`, `renderer/lib/projectPaths.ts`: small utilities.
- Theme handling and the macOS chrome (hidden-inset titlebar, drag-region, traffic-light positioning).

Reference, do not copy structurally:

- `main/git/*`: the git operations (diff, checkout, refs, files, hashes, reviewed-state) are correct primitives but the surrounding IPC and persistence will be re-shaped for v0.1's data model. Read these for the right git commands and edge cases.
- `main/config/*`: the JSON-file persistence pattern (`jsonFile.ts` util) is sound, but the schemas will change to accommodate comments and the snapshot-based "since last review" state.
- `shared/schemas.ts`: the Zod schemas for `Repo`, `Diff`, `FileChange` are a good starting shape but will gain fields (comments, snapshots, tab state).

Do not port:

- v0's `Dashboard.tsx` layout (centered max-w-4xl, modal posture). Replaced by a full-page dashboard.
- v0's `DiffView.tsx` layout (single scroll of all files). Replaced by a tabbed editor.
- v0's `EditorPane.tsx` (Monaco-as-toggle). Editing is integrated into the diff editor, not a separate pane.
- v0's `@pierre/diffs` dependency. Replaced by Monaco DiffEditor.

## Accessibility & Inclusion

No formal WCAG target for v0.1. Defaults to honor:

- Keyboard navigation for the core loop: open command palette, switch tabs, mark reviewed, toggle "since last review," jump to next unreviewed file, back to dashboard.
- Light and dark themes readable at small text sizes.
- `prefers-reduced-motion` respected for any non-essential animation.

Revisit accessibility once the core workflow is stable.
