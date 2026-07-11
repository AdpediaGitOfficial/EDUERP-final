import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export type ConfirmOptions = {
  title: string;
  /** What will happen — name the specific record where possible. */
  description?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  /** Red confirm button for destructive actions (delete/remove/deactivate). */
  destructive?: boolean;
};

type ConfirmContextValue = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

/**
 * App-wide confirmation dialog. Replaces native window.confirm() with a styled,
 * accessible AlertDialog. Usage:
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: "Delete category?", description: "…", destructive: true }))) return;
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmContextValue>((options) => {
    setOpts(options);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = (result: boolean) => {
    setOpen(false);
    resolver.current?.(result);
    resolver.current = null;
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog
        open={open}
        onOpenChange={(o) => {
          if (!o) settle(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{opts?.title}</AlertDialogTitle>
            {opts?.description && (
              <AlertDialogDescription>{opts.description}</AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => settle(false)}>
              {opts?.cancelText ?? "Cancel"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => settle(true)}
              className={cn(
                opts?.destructive &&
                  "bg-destructive text-destructive-foreground hover:bg-destructive/90",
              )}
            >
              {opts?.confirmText ?? "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmContextValue {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within a ConfirmProvider");
  return ctx;
}
