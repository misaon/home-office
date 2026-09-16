import { MONO } from "./tokens.ts";
import { useDesign } from "./store.ts";

const CHIP =
  "flex items-center gap-9 py-7 px-9 rounded-10 bg-accent-a09 border border-accent-a28 mb-10 animate-rise-300";

const SWATCH =
  "w-22 h-22 flex-[0_0_22px] rounded-6 bg-[repeating-linear-gradient(135deg,var(--color-accent-a40)_0_4px,var(--color-accent-a12)_4px_8px)]";

const NAME = `flex-1 min-w-0 ${MONO} text-11 text-accent-soft overflow-hidden text-ellipsis whitespace-nowrap`;

const CLEAR =
  "w-20 h-20 flex-[0_0_20px] grid place-items-center border-0 rounded-6 bg-transparent text-accent-quote cursor-pointer transition-all duration-200";

export function ChatAttachment({ file }: { file: string }): React.JSX.Element {
  const set = useDesign((s) => s.set);
  return (
    <div className={CHIP}>
      <span className={SWATCH} />
      <span className={NAME}>{file}</span>
      <button
        type="button"
        aria-label="Remove the attachment"
        onClick={() => {
          set({ attachment: null });
        }}
        className={`hover:bg-accent-a18 ${CLEAR}`}
      >
        <svg
          width="9"
          height="9"
          viewBox="0 0 10 10"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <line x1="2" y1="2" x2="8" y2="8" />
          <line x1="8" y1="2" x2="2" y2="8" />
        </svg>
      </button>
    </div>
  );
}
