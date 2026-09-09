/** One rhythm for every text field, select and textarea in the office. */
export const CONTROL =
  "w-full rounded-md border border-line bg-ink px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:border-accent/60 focus:outline-none";

const VARIANTS = {
  primary: "bg-accent text-black hover:brightness-110",
  quiet: "bg-line text-gray-100 hover:brightness-125",
  danger: "bg-red-950 text-red-200 hover:brightness-125",
} as const;

type Variant = keyof typeof VARIANTS;

export function Button({
  children,
  onClick,
  variant = "quiet",
  disabled = false,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: Variant;
  disabled?: boolean;
  title?: string;
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={`rounded-md px-3 py-1.5 text-xs font-medium transition disabled:opacity-40 ${VARIANTS[variant]}`}
      disabled={disabled}
      title={title}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** A labelled control with room around it: the label, the control, then one line of help or error. */
export function Field({
  id,
  label,
  hint,
  tone = "muted",
  children,
}: {
  /** The control's own id, so the label belongs to it even when a button shares the row. */
  id: string;
  label: string;
  hint?: React.ReactNode;
  tone?: "muted" | "error";
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-gray-400" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint === undefined ? null : (
        <span
          className={`mt-1.5 block text-2xs ${tone === "error" ? "text-red-300" : "text-gray-500"}`}
        >
          {hint}
        </span>
      )}
    </div>
  );
}

/** Two or three exclusive choices side by side, for a switch that changes which fields apply. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}): React.JSX.Element {
  return (
    <div className="inline-flex gap-1 rounded-lg border border-line bg-ink p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
            option.value === value
              ? "bg-line text-white"
              : "text-gray-400 hover:bg-line/50 hover:text-gray-200"
          }`}
          onClick={() => {
            onChange(option.value);
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** A section of a panel: an uppercase heading and its rows, separated from what comes before it. */
export function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section className="space-y-2.5">
      <div className="flex items-center gap-3">
        <h3 className="text-2xs font-semibold tracking-widest text-gray-500 uppercase">{title}</h3>
        <div className="h-px flex-1 bg-line" />
        {aside}
      </div>
      {children}
    </section>
  );
}

export function FolderIcon(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1.9 12.4V3.6h4.2l1.5 1.8h6.5v7a1 1 0 0 1-1 1h-10.2a1 1 0 0 1-1-1Z" />
    </svg>
  );
}
