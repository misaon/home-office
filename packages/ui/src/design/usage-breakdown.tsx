import { DISPLAY, MONO, separator } from "./tokens.ts";

export type Row = { name: string; total: string; pct: string; detail: string; cache: string };

const HEADING = `${MONO} text-10 tracking-caps-wider uppercase text-ink-label`;

const CARD = "rounded-14 bg-card border border-edge overflow-hidden";

const NAME = `${MONO} text-12 text-ink-dim overflow-hidden text-ellipsis whitespace-nowrap max-w-[45%]`;

const LANE = "flex-1 h-4 rounded-pill bg-slot overflow-hidden min-w-40";

const FILL =
  "block h-full rounded-pill bg-[linear-gradient(90deg,var(--color-accent-deep),var(--color-accent))] origin-left animate-grow";

const TOTAL = `${DISPLAY} font-semibold text-13 text-accent-soft flex-[0_0_auto]`;

const DETAIL = `flex justify-between gap-9 mt-7 ${MONO} text-10 text-ink-meta`;

/** One way of slicing the spend: a name, its share as a bar, and its total. */
export function Breakdown({ name, rows }: { name: string; rows: Row[] }): React.JSX.Element {
  return (
    <div className="mb-18">
      <div className="flex items-center gap-8 mt-0 mx-2 mb-9">
        <span className={HEADING}>{name}</span>
        <span className="flex-1 h-1 bg-slot" />
      </div>
      <div className={CARD}>
        {rows.map((row, i) => (
          <div
            key={row.name}
            className={`py-12 px-13 transition-[background] duration-200 ${separator(i === 0)} hover:bg-row-hover`}
          >
            <div className="flex items-center gap-11">
              <span className={NAME}>{row.name}</span>
              <span className={LANE}>
                <span className={`${FILL} w-(--share)`} style={{ "--share": row.pct }} />
              </span>
              <span className={TOTAL}>{row.total}</span>
            </div>
            <div className={DETAIL}>
              <span>{row.detail}</span>
              <span>{row.cache}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
