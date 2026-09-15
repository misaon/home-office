import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";

/**
 * A row of choices where exactly one is on, drawn the way the design draws its tool picker. Base UI's
 * toggle group brings the arrow keys and the roving focus; what it also brings is the ability to press
 * the one that is already on, which this row does not want, so an empty answer keeps what was there.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (next: T) => void;
}): React.JSX.Element {
  return (
    <ToggleGroup
      value={[value]}
      onValueChange={(next) => {
        const picked = next.at(-1);
        if (picked !== undefined) {
          onChange(picked);
        }
      }}
      className="flex gap-4 p-3 rounded-11 bg-card border border-border"
    >
      {options.map((option) => (
        <Toggle
          key={option.value}
          value={option.value}
          className="flex-1 py-8 px-0 rounded-8 border-0 cursor-pointer text-12 transition-all duration-250 bg-transparent text-ink-label data-pressed:bg-accent-a16 data-pressed:text-accent-soft"
        >
          {option.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
