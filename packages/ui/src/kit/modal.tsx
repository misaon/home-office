import { useEffect } from "react";

/** A centred dialog with a header, a body on its own rhythm and a footer for its actions. Escape closes it. */
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
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return (
    <div className="absolute inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/75 p-8">
      <div className="my-auto w-full max-w-xl overflow-hidden rounded-xl border border-line bg-panel shadow-2xl">
        <header className="border-b border-line px-6 py-5">
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="mt-2 text-xs leading-relaxed text-gray-400">{description}</p>
        </header>
        <div className="space-y-6 px-6 py-6">{children}</div>
        <footer className="flex items-center justify-end gap-3 border-t border-line bg-ink/50 px-6 py-4">
          {footer}
        </footer>
      </div>
    </div>
  );
}
