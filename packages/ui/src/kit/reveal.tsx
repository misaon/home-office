import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";

/**
 * Something that opens and closes without the page jumping, in both directions and at the same speed.
 * shadcn's collapsible measures the content and animates its height; the trigger stays wherever the
 * panel already put it, so this takes the open state rather than drawing a button of its own.
 */
export function Reveal({
  open,
  className = "",
  children,
}: {
  open: boolean;
  className?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Collapsible open={open} className={className}>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  );
}
