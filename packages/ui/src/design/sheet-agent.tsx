import type { BudgetGuarantee } from "@ho/protocol";
import { type Member } from "./data.ts";
import { useTranslation } from "react-i18next";
import { draftOf } from "./agent-dialog.tsx";
import { useAgentWork } from "./live.ts";
import { CAPS, PRIMARY, SheetShell } from "./sheet-shell.tsx";
import { MONO, separator } from "./tokens.ts";
import { useDesign } from "./store.ts";

function AgentStatus({ draft }: { draft: Member }): React.JSX.Element {
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

const LIST = "rounded-13 bg-card border border-edge overflow-hidden mb-16";

const GUARANTEE_KEY = {
  runtime: "agent.guarantee_runtime",
  office: "agent.guarantee_office",
  none: "agent.guarantee_none",
} as const satisfies Record<BudgetGuarantee, string>;

function AgentBudget({ draft }: { draft: Member }): React.JSX.Element {
  const { t } = useTranslation();
  const rows: [string, string][] = [
    [
      t("agent.budgetTurns", { count: draft.budgets.maxTurnsPerTask }),
      t(GUARANTEE_KEY[draft.guarantees.turns]),
    ],
    [
      draft.budgets.maxUsdPerTask === undefined
        ? t("agent.budgetUsdNone")
        : t("agent.budgetUsd", { amount: draft.budgets.maxUsdPerTask.toFixed(2) }),
      t(GUARANTEE_KEY[draft.budgets.maxUsdPerTask === undefined ? "none" : draft.guarantees.usd]),
    ],
    [
      t("agent.budgetMinutes", { count: draft.budgets.maxWallMinutes }),
      t("agent.guaranteeMinutes"),
    ],
  ];
  return (
    <>
      <div className={`${CAPS} mb-10`}>{t("agent.budgetTitle")}</div>
      <div className={LIST}>
        {rows.map(([amount, guarantee], i) => (
          <div key={amount} className={`flex gap-11 py-10 px-13 ${separator(i === 0)}`}>
            <span className={`${MONO} text-11 text-ink-pale flex-[0_0_auto]`}>{amount}</span>
            <span className="text-12h text-ink-meta leading-body">{guarantee}</span>
          </div>
        ))}
      </div>
    </>
  );
}

export function AgentSheet({ draft }: { draft: Member }): React.JSX.Element {
  const { t } = useTranslation();
  const set = useDesign((s) => s.set);
  const work = useAgentWork(draft.id);

  return (
    <SheetShell
      title={draft.name}
      subtitle={`${draft.provider} · ${draft.model} / ${draft.effort}`}
    >
      <AgentStatus draft={draft} />
      <AgentBudget draft={draft} />
      <div className={`${CAPS} mb-10`}>{t("agent.recentWork")}</div>
      <div className={LIST}>
        {work.map((row, i) => (
          <div key={row.id} className={`flex gap-11 py-12 px-13 ${separator(i === 0)}`}>
            <span className={`${MONO} text-10 text-ink-meta flex-[0_0_auto]`}>{row.when}</span>
            <span className="text-12h text-ink-dim leading-body">{row.title}</span>
          </div>
        ))}
        {work.length === 0 ? (
          <div className="py-12 px-13 text-12 text-ink-meta">{t("agent.noWork")}</div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => {
          set({
            agentDlg: { mode: "edit", id: draft.id },
            agentDraft: draftOf(draft),
            sheet: null,
            sheetDraft: null,
          });
        }}
        className={`hover:-translate-y-2 hover:shadow-lift ${PRIMARY} w-full`}
      >
        {t("agent.configure")}
      </button>
    </SheetShell>
  );
}
