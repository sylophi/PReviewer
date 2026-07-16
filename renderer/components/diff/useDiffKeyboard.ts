// Global keyboard shortcuts for the diff view's core review loop.
// Registered on window in the capture phase so they win over Monaco's
// own keybindings (the listener fires before the event reaches the
// editor's textarea); anything we don't handle passes through
// untouched.
//
// The shortcut surface, kept deliberately small:
//   ⌘Enter        toggle reviewed on the active file, advance to next unreviewed
//   ⌘J            jump to the next unreviewed file (no marking)
//   ⌘⇧] / ⌃Tab    next tab
//   ⌘⇧[ / ⌃⇧Tab   previous tab
//   ⌘1…⌘9         activate tab by position
//   ⌘W            close the active tab (falls through to close the
//                 window when no tabs are open — see App-level handler)
//   ⌘⇧U           toggle split/unified for the active tab
//   ⌘B            toggle the file tree rail
//   ⌘⇧D           back to the dashboard
import { useEffect, useRef } from "react";

export interface DiffKeyboardActions {
  toggleReviewedAndAdvance: () => void;
  jumpToNextUnreviewed: () => void;
  nextTab: () => void;
  prevTab: () => void;
  activateTabIndex: (index: number) => void;
  // Return false to decline (no tab open) and let the event bubble to
  // the app-level ⌘W handler, which closes the window.
  closeActiveTab: () => boolean;
  toggleDiffStyle: () => void;
  toggleTree: () => void;
  goToDashboard: () => void;
}

// A modal (new diff, add repo, confirm) owns the keyboard while open.
export function modalIsOpen(): boolean {
  return document.querySelector("[data-modal]") !== null;
}

export function useDiffKeyboard(actions: DiffKeyboardActions): void {
  // Actions close over fresh state every render; route the listener
  // through a ref so we register exactly once. Written in an effect
  // (not during render) so a render React throws away never leaks
  // uncommitted actions into the ref.
  const ref = useRef(actions);
  useEffect(() => {
    ref.current = actions;
  });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (modalIsOpen()) return;
      const a = ref.current;
      const mod = e.metaKey || e.ctrlKey;

      // ⌃Tab / ⌃⇧Tab tab switching (independent of ⌘).
      if (e.ctrlKey && !e.metaKey && !e.altKey && e.key === "Tab") {
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey) a.prevTab();
        else a.nextTab();
        return;
      }

      if (!mod || e.altKey) return;

      if (!e.shiftKey && e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        a.toggleReviewedAndAdvance();
        return;
      }
      if (!e.shiftKey && e.key.toLowerCase() === "j") {
        e.preventDefault();
        e.stopPropagation();
        a.jumpToNextUnreviewed();
        return;
      }
      if (e.shiftKey && e.code === "BracketRight") {
        e.preventDefault();
        e.stopPropagation();
        a.nextTab();
        return;
      }
      if (e.shiftKey && e.code === "BracketLeft") {
        e.preventDefault();
        e.stopPropagation();
        a.prevTab();
        return;
      }
      if (!e.shiftKey && /^Digit[1-9]$/.test(e.code)) {
        e.preventDefault();
        e.stopPropagation();
        a.activateTabIndex(Number(e.code.slice(5)) - 1);
        return;
      }
      if (!e.shiftKey && e.key.toLowerCase() === "w") {
        if (a.closeActiveTab()) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }
      if (e.shiftKey && e.key.toLowerCase() === "u") {
        e.preventDefault();
        e.stopPropagation();
        a.toggleDiffStyle();
        return;
      }
      if (!e.shiftKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        e.stopPropagation();
        a.toggleTree();
        return;
      }
      if (e.shiftKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        e.stopPropagation();
        a.goToDashboard();
      }
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);
}
