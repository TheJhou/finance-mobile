import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useCallback, useState, type ReactNode } from "react";

type DialogVariant = "default" | "danger" | "warning" | "success";

interface DialogOptions {
  variant?: DialogVariant;
  confirmText?: string;
  cancelText?: string | null;
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void;
}

interface DialogState extends DialogOptions {
  title: string;
  message: string;
}

export function useAppDialog() {
  const [state, setState] = useState<DialogState | null>(null);

  const close = useCallback(() => setState(null), []);

  const alert = useCallback(
    (title: string, message: string, options?: DialogOptions) => {
      setState({
        title,
        message,
        variant: options?.variant ?? "default",
        confirmText: options?.confirmText ?? "OK",
        cancelText: options?.cancelText ?? null,
        onConfirm: options?.onConfirm,
        onCancel: options?.onCancel,
      });
    },
    []
  );

  const confirm = useCallback(
    (title: string, message: string, options?: DialogOptions) => {
      setState({
        title,
        message,
        variant: options?.variant ?? "default",
        confirmText: options?.confirmText ?? "Confirmar",
        cancelText: options?.cancelText ?? "Cancelar",
        onConfirm: options?.onConfirm,
        onCancel: options?.onCancel,
      });
    },
    []
  );

  const dialog: ReactNode = state ? (
    <ConfirmDialog
      visible={!!state}
      title={state.title}
      message={state.message}
      variant={state.variant}
      confirmText={state.confirmText}
      cancelText={state.cancelText ?? undefined}
      onConfirm={async () => {
        await state.onConfirm?.();
        close();
      }}
      onCancel={() => {
        state.onCancel?.();
        close();
      }}
    />
  ) : null;

  return { alert, confirm, dialog };
}
