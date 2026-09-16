import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import type { ParseKeys } from "i18next";
import { useTranslation } from "react-i18next";
import { MONO, pill } from "./tokens.ts";

/**
 * The row of chips a panel narrows itself with: a dot in the lane's own colour, what the lane is
 * called, and how many things are in it. The board filters its cards this way and the team filters its
 * people, and they are the same row.
 */

const CHIP =
  "flex items-center gap-7 py-6 px-11 rounded-pill cursor-pointer text-12 transition-all duration-220 ease-soft";

/** One chip: `dot` is the colour class of its mark, or null for the chip that filters nothing out. */
export type Chip<K extends string> = {
  key: K;
  label: ParseKeys;
  dot: string | null;
  count: number;
};

export function FilterChips<K extends string>({
  label: groupLabel,
  chips,
  value,
  onPick,
}: {
  /** What the row narrows; a toggle group carries its own name. */
  label: string;
  chips: readonly Chip<K>[];
  value: K;
  onPick: (key: K) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <ToggleGroup
      aria-label={groupLabel}
      value={[value]}
      onValueChange={(next) => {
        const picked = next.at(-1);
        if (picked !== undefined) {
          onPick(picked);
        }
      }}
      className="flex gap-6 flex-wrap"
    >
      {chips.map(({ key, label, dot, count }) => (
        <Toggle
          key={key}
          value={key}
          className={`${CHIP} ${pill(value === key)} hover:-translate-y-1`}
        >
          {dot === null ? null : <span className={`w-6 h-6 rounded-half ${dot}`} />}
          <span>{t(label)}</span>
          <span className={`${MONO} text-10h opacity-75`}>{count}</span>
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
