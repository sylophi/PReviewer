import { useEffect, useRef, type ReactNode } from "react";
import { ModalShell } from "./modal-shell";
import { Button } from "./button";

interface ConfirmDialogProps {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  pending = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    confirmRef.current?.focus();
  }, []);
  return (
    <ModalShell onClose={onCancel} popoverClassName="max-w-md">
      <div className="flex flex-col gap-4 p-5">
        <div>
          <h2 className="text-base font-medium text-foreground">{title}</h2>
          {body ? <div className="mt-1.5 text-sm text-muted-foreground">{body}</div> : null}
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button
            ref={confirmRef}
            variant={destructive ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={pending}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}
