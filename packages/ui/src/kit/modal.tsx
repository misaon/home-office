import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * shadcn's dialog, under the office's own name. It brings its own overlay, focus trap, Escape handling
 * and the animation both ways, which is why nothing here draws or times any of that.
 */
export function Modal({
  open,
  title,
  description,
  footer,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description: React.ReactNode;
  footer: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-6">{children}</div>
        <DialogFooter>{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
