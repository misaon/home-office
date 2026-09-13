import { useEffect, useRef } from "react";

/**
 * A real modal dialog: the browser puts it in the top layer, makes the page behind it inert, moves focus
 * into it and restores focus on close, and closes it on Escape. A header, a body on its own rhythm and a
 * footer for its actions.
 */
export function Modal({
  title,
  description,
  footer,
  onClose,
  children,
}: {
  title: string;
  description: React.ReactNode;
  footer: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => {
      element?.close();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-label={title}
      className="m-auto w-full max-w-xl overflow-hidden rounded-xl border border-line bg-panel p-0 text-gray-100 shadow-2xl backdrop:bg-black/75"
      // Escape closes a modal dialog itself; this is how the office hears about it.
      onClose={onClose}
    >
      <header className="border-b border-line px-6 py-5">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-2 text-xs leading-relaxed text-gray-400">{description}</p>
      </header>
      <div className="space-y-6 px-6 py-6">{children}</div>
      <footer className="flex items-center justify-end gap-3 border-t border-line bg-ink/50 px-6 py-4">
        {footer}
      </footer>
    </dialog>
  );
}
