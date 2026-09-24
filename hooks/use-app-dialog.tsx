import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useCallback, useState, type ReactNode } from "react";

type DialogVariant = "default" | "danger" | "warning" | "success";

interface DialogOptions {
  variant?: DialogVariant;
  confirmText?: string;
  cancelText?: string | null;
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void;
  secondaryText?: string;
  onSecondary?: () => void | Promise<void>;
}

interface DialogState extends DialogOptions {
  title: string;
  message: string;
}

export function useAppDialog() {
  const [state, setState] = useState<DialogState | null>(null);

  // Fecha só o diálogo que disparou a ação: se o callback abriu outro
  // diálogo (ex.: alerta de sucesso), ele precisa continuar visível.
  const closeIfCurrent = useCallback(
    (current: DialogState) => setState((s) => (s === current ? null : s)),
    []
  );

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
        secondaryText: options?.secondaryText,
        onSecondary: options?.onSecondary,
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
        secondaryText: options?.secondaryText,
        onSecondary: options?.onSecondary,
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
      secondaryText={state.secondaryText}
      onConfirm={async () => {
        await state.onConfirm?.();
        closeIfCurrent(state);
      }}
      onCancel={() => {
        state.onCancel?.();
        closeIfCurrent(state);
      }}
      onSecondary={
        state.onSecondary
          ? async () => {
              await state.onSecondary?.();
              closeIfCurrent(state);
            }
          : undefined
      }
    />
  ) : null;

  return { alert, confirm, dialog };
}
