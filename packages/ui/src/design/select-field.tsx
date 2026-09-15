import { Select } from "@base-ui/react/select";
import { MONO } from "./tokens.ts";

/** The caption every field in a dialog is labelled with. */
const LABEL = `${MONO} text-9h tracking-caps-wider uppercase text-ink-label mb-8`;

const TRIGGER =
  "w-full flex items-center justify-between gap-8 py-12 px-13 rounded-12 bg-card cursor-pointer text-left transition-all duration-200 border border-border-strong hover:border-accent-a45 data-popup-open:border-accent-a50";

const POPUP =
  "min-w-(--anchor-width) max-h-(--available-height) overflow-y-auto p-5 rounded-11 bg-menu border border-border-strong shadow-pop origin-(--transform-origin) transition-[opacity,translate] duration-240 ease-out data-starting-style:opacity-0 data-starting-style:-translate-y-6 data-ending-style:opacity-0";

const OPTION =
  "w-full grid grid-cols-[5px_1fr] items-center gap-8 py-8 px-9 rounded-8 cursor-pointer text-left transition-all duration-180 text-ink-soft data-highlighted:bg-accent-a13 data-highlighted:text-accent-soft data-selected:bg-accent-a12 data-selected:text-accent-soft";

const ELLIPSIS = "overflow-hidden text-ellipsis whitespace-nowrap";

const DOT = "w-5 h-5 rounded-half flex-[0_0_auto] bg-dot-idle group-data-selected:bg-accent";

/**
 * The design's own dropdown, over Base UI's Select: the library owns the open state, the keyboard,
 * the listbox semantics and the placement, so nothing here tracks which menu is up and Escape lands
 * on the select rather than on the dialog behind it.
 */
export function SelectField({
  label,
  options,
  value,
  mono = false,
  muted = false,
  onPick,
}: {
  label: string;
  options: readonly string[];
  value: string;
  /** Branches and paths are written in the office's monospace, names and models are not. */
  mono?: boolean;
  /** A value that is a placeholder rather than a choice. */
  muted?: boolean;
  onPick: (next: string) => void;
}): React.JSX.Element {
  const type = mono ? `${MONO} text-12` : "text-12h";

  return (
    <div>
      <Select.Root
        value={value}
        onValueChange={(next) => {
          if (typeof next === "string") {
            onPick(next);
          }
        }}
      >
        <Select.Label className={LABEL}>{label}</Select.Label>
        <Select.Trigger className={`${TRIGGER} ${type}`}>
          <Select.Value className={`${ELLIPSIS} ${muted ? "text-ink-ghost" : ""}`} />
          <Select.Icon
            className="flex-[0_0_auto] transition-transform duration-250 data-popup-open:rotate-180"
            render={
              <svg
                width="9"
                height="9"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                className="stroke-ink-meta"
              >
                <polyline points="3,4.5 6,8 9,4.5" />
              </svg>
            }
          />
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner
            className="z-80 outline-none"
            sideOffset={6}
            alignItemWithTrigger={false}
          >
            <Select.Popup className={POPUP}>
              <Select.List aria-label={label}>
                {options.map((option) => (
                  <Select.Item key={option} value={option} className={`group ${OPTION} ${type}`}>
                    <span className={DOT} />
                    <Select.ItemText className={ELLIPSIS}>{option}</Select.ItemText>
                  </Select.Item>
                ))}
              </Select.List>
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}
