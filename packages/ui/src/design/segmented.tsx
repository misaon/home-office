/** A row of choices where exactly one is on, drawn the way the design draws its tool picker. */
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
    <div className="flex gap-4 p-3 rounded-11 bg-card border border-border">
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            type="button"
            key={option.value}
            aria-pressed={on}
            onClick={() => {
              onChange(option.value);
            }}
            className={`flex-1 py-8 px-0 rounded-8 border-0 cursor-pointer text-12 transition-all duration-250 ${on ? "bg-accent-a16" : "bg-transparent"} ${on ? "text-accent-soft" : "text-ink-label"}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
