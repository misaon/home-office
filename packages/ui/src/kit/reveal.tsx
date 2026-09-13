import { useEffect, useState } from "react";
import { EXIT_MS } from "./motion.ts";

/**
 * Something that opens and closes without the page jumping, in both directions and at the same speed;
 * `.reveal` in `styles.css` does the moving. Closed content is inert while it is still on its way out,
 * so the keyboard cannot reach what the eye cannot, and then it leaves the document entirely — an empty
 * wrapper left behind would still collect the spacing its parent hands to every child.
 */
export function Reveal({
  open,
  className = "",
  children,
}: {
  open: boolean;
  /** For the wrapper, so a revealed thing can still be placed by whatever contains it. */
  className?: string;
  children: React.ReactNode;
}): React.JSX.Element | null {
  const [present, setPresent] = useState(open);
  if (open && !present) {
    // Adjusted during render, which React re-runs at once: from an effect the closed state would paint
    // for one frame first, and that frame is the jump this component exists to remove.
    setPresent(true);
  }
  useEffect(() => {
    const timer = open
      ? null
      : setTimeout(() => {
          setPresent(false);
        }, EXIT_MS);
    return () => {
      if (timer !== null) {
        clearTimeout(timer);
      }
    };
  }, [open]);
  if (!present) {
    return null;
  }
  return (
    <div className={`reveal ${className}`} data-open={String(open)}>
      <div className="overflow-hidden" inert={!open}>
        {children}
      </div>
    </div>
  );
}
