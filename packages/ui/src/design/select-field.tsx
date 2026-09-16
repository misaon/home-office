import { Select } from "@base-ui/react/select";
import { MONO } from "./tokens.ts";

const LABEL = `${MONO} text-9h tracking-caps-wider uppercase text-ink-label mb-8`;

const TRIGGER =
  "w-full flex items-center justify-between gap-8 py-16 px-13 rounded-12 bg-card cursor-pointer text-left transition-all duration-200 border border-border-strong hover:border-accent-a45 data-popup-open:border-accent-a50";

const POPUP =
  "min-w-(--anchor-width) max-h-(--available-height) overflow-y-auto p-5 rounded-11 bg-menu border border-border-strong shadow-pop origin-(--transform-origin) transition-[opacity,translate] duration-240 ease-out data-starting-style:opacity-0 data-starting-style:-translate-y-6 data-ending-style:opacity-0";

const OPTION =
  "w-full grid grid-cols-[14px_1fr] items-center gap-8 py-11 px-10 rounded-8 cursor-pointer text-left transition-all duration-180 text-ink-soft data-highlighted:bg-accent-a13 data-highlighted:text-accent-soft data-selected:bg-accent-a12 data-selected:text-accent-soft";

const ELLIPSIS = "overflow-hidden text-ellipsis whitespace-nowrap";

const DOT = "w-5 h-5 rounded-half justify-self-center bg-dot-idle group-data-selected:bg-accent";

export function SelectField({
  label,
  options,
  value,
  mono = false,
  muted = false,
  markOf,
  onPick,
}: {
  label: string;
  options: readonly string[];
  value: string;
  markOf?: (option: string) => React.ReactNode;
  mono?: boolean;
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
          <span className="flex-1 min-w-0 flex items-center gap-8">
            {markOf?.(value)}
            <Select.Value className={`${ELLIPSIS} ${muted ? "text-ink-ghost" : ""}`} />
          </span>
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
              <Select.List aria-label={label} className="flex flex-col gap-2">
                {options.map((option) => (
                  <Select.Item key={option} value={option} className={`group ${OPTION} ${type}`}>
                    {markOf === undefined ? <span className={DOT} /> : markOf(option)}
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
