import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { NewDiffDialog } from "@/components/NewDiffDialog";
import { AddProjectView } from "@/components/palette/AddProjectView";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ModalShell } from "@/components/ui/modal-shell";

interface ConfirmRequest {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => Promise<void> | void;
}

interface DialogsContextValue {
  openAddRepo: () => void;
  openNewDiff: (repoId: string) => void;
  confirm: (req: ConfirmRequest) => void;
}

const DialogsContext = createContext<DialogsContextValue | null>(null);

type DialogState =
  | { kind: "addRepo" }
  | { kind: "newDiff"; repoId: string }
  | { kind: "confirm"; req: ConfirmRequest };

export function DialogsProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<DialogState | null>(null);
  const [confirmPending, setConfirmPending] = useState(false);

  const openAddRepo = useCallback(() => setActive({ kind: "addRepo" }), []);
  const openNewDiff = useCallback((repoId: string) => {
    setActive({ kind: "newDiff", repoId });
  }, []);
  const confirm = useCallback((req: ConfirmRequest) => {
    setActive({ kind: "confirm", req });
  }, []);
  const close = () => {
    setActive(null);
    setConfirmPending(false);
  };

  const onConfirm = async () => {
    if (active?.kind !== "confirm") return;
    setConfirmPending(true);
    try {
      await active.req.onConfirm();
      close();
    } catch {
      // Mutation hooks already own the error toast via their
      // meta.errorTitle (see MutationCache.onError in index.tsx). A
      // second generic "Action failed" toast here would race or hide
      // the better-titled one; just clear the pending state so the
      // user can retry or cancel.
      setConfirmPending(false);
    }
  };

  const value = useMemo(
    () => ({ openAddRepo, openNewDiff, confirm }),
    [openAddRepo, openNewDiff, confirm],
  );

  return (
    <DialogsContext.Provider value={value}>
      {children}
      {active?.kind === "addRepo" ? (
        // AddProjectView owns its own Escape handling (cancels scan stage,
        // or closes from the browse stage); ModalShell skips its default.
        <ModalShell onClose={close} closeOnEscape={false}>
          <AddProjectView onClose={close} />
        </ModalShell>
      ) : null}
      {active?.kind === "newDiff" ? (
        <NewDiffDialog initialRepoId={active.repoId} onClose={close} />
      ) : null}
      {active?.kind === "confirm" ? (
        <ConfirmDialog
          title={active.req.title}
          {...(active.req.body !== undefined ? { body: active.req.body } : {})}
          {...(active.req.confirmLabel !== undefined
            ? { confirmLabel: active.req.confirmLabel }
            : {})}
          destructive={active.req.destructive ?? false}
          pending={confirmPending}
          onConfirm={() => void onConfirm()}
          onCancel={close}
        />
      ) : null}
    </DialogsContext.Provider>
  );
}

export function useDialogs(): DialogsContextValue {
  const ctx = useContext(DialogsContext);
  if (!ctx) throw new Error("useDialogs must be used within DialogsProvider");
  return ctx;
}
