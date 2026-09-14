import { DISPLAY } from "./tokens.ts";

/** The office's mark and its name. */
export function HeaderBrand(): React.JSX.Element {
  return (
    <div className="flex items-center gap-10 flex-[0_0_auto]">
      <div className="w-19 h-19 rounded-6 bg-accent animate-breathe" />
      <span className={`${DISPLAY} font-bold text-12h tracking-brand uppercase whitespace-nowrap`}>
        Home Office
      </span>
    </div>
  );
}
