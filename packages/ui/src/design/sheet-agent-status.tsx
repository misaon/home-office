import type { Member } from "./data.ts";
import { MONO } from "./tokens.ts";

/** What this colleague is at right now, and for how long. */
export function AgentStatus({ draft }: { draft: Member }): React.JSX.Element {
  const dot =
    draft.status === "working" ? "bg-accent shadow-glow-gold" : "bg-ink-idle shadow-glow-idle";
  return (
    <div className="p-14 rounded-14 bg-card-lit border border-border mb-16">
      <div className="flex items-center gap-11">
        <span className={`w-8 h-8 rounded-half flex-[0_0_auto] ${dot}`} />
        <div className="flex-1 min-w-0">
          <div className="text-13">{draft.doing}</div>
          <div className={`${MONO} text-10h text-ink-meta mt-3`}>{draft.since}</div>
        </div>
      </div>
    </div>
  );
}
