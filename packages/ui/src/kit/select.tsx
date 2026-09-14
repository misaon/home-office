import {
  Select as ShadcnSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** shadcn's select, under the office's own name and with the office's own props. */
export function Select<T extends string>({
  id,
  value,
  options,
  onChange,
  placeholder,
  disabled = false,
  mono = false,
}: {
  id?: string;
  /** The empty string means nothing is chosen yet, which is what the placeholder is for. */
  value: T | "";
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  placeholder?: string;
  disabled?: boolean;
  mono?: boolean;
}): React.JSX.Element {
  return (
    <ShadcnSelect
      value={value === "" ? undefined : value}
      disabled={disabled || options.length === 0}
      onValueChange={(next) => {
        const picked = options.find((option) => option.value === next);
        if (picked !== undefined) {
          onChange(picked.value);
        }
      }}
    >
      <SelectTrigger id={id} className={`w-full ${mono ? "font-mono" : ""}`}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} className={mono ? "font-mono" : ""}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </ShadcnSelect>
  );
}
