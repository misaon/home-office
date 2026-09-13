import { isSessionActive, type LiveEvent, type Session, type Usage } from "@ho/protocol";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Badge } from "../kit/controls.tsx";
import { type Snapshot, useUi } from "../store.ts";

const fmt = (n: number): string => n.toLocaleString();

const usageLine = (u: Usage, t: TFunction): string =>
  t("session.usage", {
    input: fmt(u.inputTokens),
    output: fmt(u.outputTokens),
    cache: fmt(u.cacheReadTokens),
    turns: String(u.turns),
  });

function describe(live: LiveEvent, t: TFunction): string {
  const e = live.event;
  if (e.kind === "init") {
    return t("session.session", { id: e.runtimeSessionId.slice(0, 8), model: e.model });
  }
  if (e.kind === "text_delta") {
    return e.text.trim();
  }
  if (e.kind === "tool_call") {
    return t("session.call", { name: e.name });
  }
  if (e.kind === "tool_result") {
    return `${e.ok ? "✓" : "✗"} ${e.summary}`;
  }
  if (e.kind === "permission_request") {
    return t("session.permission", { tool: e.tool });
  }
  if (e.kind === "usage") {
    return "";
  }
  if (e.kind === "context") {
    const share =
      e.windowTokens === 0
        ? ""
        : ` (${String(Math.round((e.usedTokens / e.windowTokens) * 100))}%)`;
    const cost = e.cost === null ? "" : ` · ${e.cost.amount.toFixed(2)} ${e.cost.currency}`;
    return t("session.context", {
      used: fmt(e.usedTokens),
      window: fmt(e.windowTokens),
      share,
      cost,
    });
  }
  if (e.kind === "rate_limited") {
    return t("session.rateLimited");
  }
  if (e.kind === "result") {
    return t("session.result", {
      outcome: e.ok ? t("session.resultDone") : t("session.resultFailed"),
      text: e.text.slice(0, 300),
    });
  }
  return t("session.error", { code: e.code, message: e.message });
}

/** One session of this colleague: what it is doing and, while it runs, what it just did. */
export function SessionBlock({
  session,
  tasks,
}: {
  session: Session;
  tasks: Snapshot["tasks"];
}): React.JSX.Element {
  const { t } = useTranslation();
  const live = useUi((s) => s.live.get(session.id));
  const task = tasks.get(session.taskId);
  const events = (live ?? []).filter((l) => l.event.kind !== "usage").slice(-40);
  const active = isSessionActive(session.state);
  return (
    <div className="animate-rise space-y-2 rounded-lg border border-line bg-ink/40 p-3 text-xs">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block truncate font-medium">{task?.title ?? session.taskId}</span>
          <span className="text-2xs text-faint">{usageLine(session.usage, t)}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {session.services === undefined ? null : (
            <Badge tone={session.services === "ready" ? "good" : "warn"}>
              {t("session.services", { state: session.services })}
            </Badge>
          )}
          <Badge tone={active ? "accent" : "neutral"}>{session.mode}</Badge>
          <Badge tone={active ? "good" : "neutral"}>{session.state}</Badge>
        </span>
      </div>
      {task?.artifacts.branch === undefined ? null : (
        <div className="truncate font-mono text-2xs text-muted">{task.artifacts.branch}</div>
      )}
      {events.length === 0 ? null : (
        <ul className="max-h-48 space-y-1 overflow-y-auto font-mono text-2xs">
          {events.map((l, i) => {
            const text = describe(l, t);
            return text === "" ? null : (
              <li key={`${l.at}-${String(i)}`} className="truncate text-muted">
                <span className="text-faint">{new Date(l.at).toLocaleTimeString()} </span>
                {text}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
