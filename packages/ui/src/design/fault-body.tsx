import { Collapsible } from "@base-ui/react/collapsible";
import type { ParseKeys } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { type Check, CheckRow } from "./fault-check.tsx";
import { ChevronRight } from "lucide-react";
import {
  BODY,
  CARD,
  GROUND,
  ICONS,
  KIND,
  LOG,
  PRIMARY,
  QUIET,
  TILE,
  TITLE,
  TOGGLE,
} from "./fault-look.tsx";
import { MONO } from "./tokens.ts";

export type Variant = "crash" | "config" | "offline";

export type Fault = {
  variant: Variant;
  kind: ParseKeys;
  title: ParseKeys;
  body: ParseKeys;
  primary: ParseKeys;
  glow: string;
  tile: string;
  ink: string;
  checks: Check[];
  log: string;
};

function FaultHead({ fault }: { fault: Fault }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="flex items-start gap-16">
      <div className={`${TILE} border ${fault.tile}`}>{ICONS[fault.variant]}</div>
      <div className="flex-1 min-w-0">
        <div className={`${KIND} ${fault.ink}`}>{t(fault.kind)}</div>
        <div className={TITLE}>{t(fault.title)}</div>
        <div className={BODY}>{t(fault.body)}</div>
      </div>
    </div>
  );
}

function FaultActions({
  primary,
  onSetup,
  onCopy,
}: {
  primary: ParseKeys;
  onSetup: () => void;
  onCopy: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-9 mt-24 flex-wrap">
      <button
        type="button"
        onClick={() => {
          window.location.reload();
        }}
        className={`hover:-translate-y-2 hover:shadow-lift-xl ${PRIMARY}`}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M13.4 8a5.4 5.4 0 1 1-1.6-3.8" />
          <polyline points="13.6,2 13.6,5 10.6,5" />
        </svg>{" "}
        <span>{t(primary)}</span>
      </button>
      <button
        type="button"
        onClick={onSetup}
        className={`hover:text-ink hover:border-border-hover hover:bg-raised ${QUIET} px-18`}
      >
        {t("fault.openSetup")}
      </button>
      <div className="flex-1" />
      <button
        type="button"
        onClick={onCopy}
        className={`hover:text-accent-soft hover:border-accent-a45 ${QUIET} px-16 whitespace-nowrap`}
      >
        {t("fault.copy")}
      </button>
    </div>
  );
}

export function FaultBody({
  fault,
  reference,
  onSetup,
  onCopy,
}: {
  fault: Fault;
  reference: string;
  onSetup: () => void;
  onCopy: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [logOpen, setLogOpen] = useState(false);

  return (
    <div className={GROUND}>
      <div
        className="absolute -top-200 left-1/2 -translate-x-1/2 w-760 h-560 rounded-half pointer-events-none bg-[radial-gradient(circle,var(--glow),transparent_68%)]"
        style={{ "--glow": `var(${fault.glow})` }}
      />
      <div className="relative w-[min(620px,100%)] animate-pop-500">
        <FaultHead fault={fault} />
        <div className={CARD}>
          {fault.checks.map((check, i) => (
            <CheckRow key={check.name} check={check} first={i === 0} />
          ))}
        </div>
        <Collapsible.Root open={logOpen} onOpenChange={setLogOpen}>
          <Collapsible.Trigger className={`hover:text-accent-soft ${TOGGLE}`}>
            <ChevronRight
              size={9}
              strokeWidth={1.6}
              className="transition-transform duration-300 rotate-0 data-panel-open:rotate-90"
            />{" "}
            <span>{t(logOpen ? "fault.hideLog" : "fault.showLog")}</span>
          </Collapsible.Trigger>
          <Collapsible.Panel>
            <pre className={LOG}>{fault.log}</pre>
          </Collapsible.Panel>
        </Collapsible.Root>
        <FaultActions primary={fault.primary} onSetup={onSetup} onCopy={onCopy} />
        <div className={`mt-16 ${MONO} text-10h text-ink-ghost`}>{reference}</div>
      </div>
    </div>
  );
}
