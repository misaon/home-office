import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import type { ParseKeys } from "i18next";
import { useTranslation } from "react-i18next";
import { MONO, pill } from "./tokens.ts";

const CHIP =
  "flex items-center gap-7 py-6 px-11 rounded-pill cursor-pointer text-12 transition-all duration-220 ease-soft";

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
