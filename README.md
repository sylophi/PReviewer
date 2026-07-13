# PReviewer

A git diffing tool that gives you powerful context.

Most diff tools show you a patch. PReviewer shows you the code around it: every change opens in a full Monaco editor with the whole file in view, jump-to-definition and hover types across the project, and persistent review state that flags what changed when the branch moves underneath you. Built for reviewing teammates' PRs and reading end-to-end through what an agent just changed.

`PReviewer` plays on PR reviewer, preview, and review.

PReviewer is the sister app to [Shigoto no Mori](https://github.com/sylophi/shigoto-no-mori), a desktop app for managing many git worktrees in parallel.

Note: This project is still early and in active development. We only offer macOS Apple Silicon builds at this time.

## Keyboard shortcuts

The review loop is fully keyboard-drivable inside a diff:

| Shortcut                    | Action                                                             |
| --------------------------- | ------------------------------------------------------------------ |
| ⌘↩                          | Mark the active file reviewed and jump to the next unreviewed file |
| ⌘J                          | Jump to the next unreviewed file                                   |
| ⌘⇧] / ⌘⇧[ (or ⌃Tab / ⌃⇧Tab) | Next / previous tab                                                |
| ⌘1–9                        | Go to tab by position                                              |
| ⌘W                          | Close tab (closes the window when no tabs are open)                |
| ⌘⇧U                         | Toggle split / unified for the active tab                          |
| ⌘B                          | Toggle the file tree                                               |
| ⌘⇧D                         | Back to the dashboard                                              |

## License

PReviewer is licensed under the MIT License. See [LICENSE](LICENSE).
