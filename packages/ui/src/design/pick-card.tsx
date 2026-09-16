import { Radio } from "@base-ui/react/radio";
import { Check } from "lucide-react";

const CARD =
  "relative flex flex-col items-start p-14 rounded-14 cursor-pointer text-left outline-none transition-all duration-240 ease-soft border bg-card border-border data-checked:border-accent-a45 data-checked:bg-accent-a07";

const TILE =
  "w-30 h-30 rounded-10 grid place-items-center bg-tile text-ink-faint group-data-checked:bg-accent-a16 group-data-checked:text-accent-soft";

const TICK = "absolute top-12 right-12 w-16 h-16 rounded-half bg-accent grid place-items-center";

export function PickCard({
  value,
  mark,
  title,
  hint,
  gap,
}: {
  value: string;
  mark: React.JSX.Element;
  title: string;
  hint: string;
  gap: "gap-9" | "gap-10";
}): React.JSX.Element {
  return (
    <Radio.Root
      value={value}
      className={`group hover:-translate-y-2 hover:border-accent-a50 ${CARD} ${gap}`}
    >
      <span className={TILE}>{mark}</span>
      <span className="block">
        <span className="block text-13 font-semibold text-ink-warm group-data-checked:text-accent-soft">
          {title}
        </span>
        <span className="block text-11h text-ink-meta mt-4 leading-body">{hint}</span>
      </span>
      <Radio.Indicator className={TICK}>
        <Check size={9} strokeWidth={2.2} className="stroke-accent-ink" />
      </Radio.Indicator>
    </Radio.Root>
  );
}
