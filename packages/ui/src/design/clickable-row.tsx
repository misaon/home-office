import { separator } from "./tokens.ts";

const ROW =
  "flex items-stretch cursor-pointer transition-[background] duration-200 hover:bg-row-hover";

const STRIPE = "w-3 flex-[0_0_3px]";

export function ClickableRow({
  label,
  first,
  stripe,
  onOpen,
  children,
}: {
  label: string;
  first: boolean;
  stripe: string;
  onOpen: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div
      /* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the row carries its own buttons, which a <button> element may not nest */
      role="button"
      aria-label={label}
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className={`${ROW} ${separator(first)}`}
    >
      <div className={`${STRIPE} ${stripe}`} />
      {children}
    </div>
  );
}
