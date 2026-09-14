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
    <div
      style={{
        display: "flex",
        gap: "4px",
        padding: "3px",
        borderRadius: "11px",
        background: "#101013",
        border: "1px solid #26262C",
      }}
    >
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
            style={{
              flex: "1",
              padding: "8px 0",
              borderRadius: "8px",
              border: "0",
              cursor: "pointer",
              fontSize: "12px",
              transition: "all .25s",
              background: on ? "rgba(255,197,49,.16)" : "transparent",
              color: on ? "#FFD666" : "#ABA8A1",
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
