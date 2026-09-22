import { ChevronRight, Flag } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { RequestBody } from "./chat-request-body.tsx";
import type { Request } from "./data.ts";
import { DISPLAY, ELLIPSIS, MONO } from "./tokens.ts";

const WRAP =
  "sticky top-0 z-20 px-12 pt-10 pb-6 bg-[linear-gradient(180deg,var(--color-panel)_78%,transparent)]";

const CARD =
  "relative rounded-14 border overflow-hidden backdrop-blur-[10px] shadow-[0_12px_30px_var(--color-shade-a45)] transition-[border-color] duration-300";

type Tone = { card: string; chip: string; bar: string; flag: string };

const TONE: Readonly<Record<Request["status"], Tone>> = {
  open: {
    card: "border-accent-a30 bg-[linear-gradient(90deg,var(--color-accent-a10),var(--color-card-lit)_55%)]",
    chip: "bg-accent-a14 text-accent-soft",
    bar: "bg-accent",
    flag: "text-accent",
  },
  verifying: {
    card: "border-mode-verify/35 bg-[linear-gradient(90deg,color-mix(in_srgb,var(--color-mode-verify)_12%,transparent),var(--color-card-lit)_55%)]",
    chip: "bg-mode-verify/15 text-mode-verify",
    bar: "bg-mode-verify",
    flag: "text-mode-verify",
  },
  fulfilled: {
    card: "border-good-a26 bg-[linear-gradient(90deg,var(--color-good-a10),var(--color-card-lit)_55%)]",
    chip: "bg-good-a14 text-good-soft",
    bar: "bg-good",
    flag: "text-good",
  },
  blocked: {
    card: "border-bad-a45 bg-[linear-gradient(90deg,var(--color-bad-a12),var(--color-card-lit)_55%)]",
    chip: "bg-bad-a12 text-bad",
    bar: "bg-bad-mid",
    flag: "text-bad",
  },
  abandoned: {
    card: "border-border bg-card-lit",
    chip: "bg-chip text-ink-faint",
    bar: "bg-ink-idle",
    flag: "text-ink-idle",
  },
};

const HEAD =
  "flex items-center gap-8 w-full py-9 pl-10 pr-10 border-0 bg-transparent text-left cursor-pointer select-none";

const TITLE = `flex-1 min-w-0 ${DISPLAY} font-semibold text-12h text-ink-pale ${ELLIPSIS}`;

const CHIP = `${MONO} text-9h h-18 px-7 rounded-pill flex items-center flex-[0_0_auto] leading-none`;

const METER = "block w-44 h-3 rounded-pill bg-slot overflow-hidden flex-[0_0_44px]";

const FILL = "block h-full rounded-pill transition-[width] duration-500 ease-glide w-(--share)";

const SHIMMER =
  "absolute inset-x-0 bottom-0 h-px bg-[linear-gradient(90deg,transparent,var(--color-accent-a55),transparent)] bg-[length:200%_100%] animate-shimmer";

const FOLD = "grid transition-[grid-template-rows] duration-300 ease-glide";

const BODY =
  "max-h-[46vh] overflow-y-auto px-11 pt-9 pb-11 flex flex-col gap-9 border-t border-line";

export function ChatRequest({ request }: { request: Request }): React.JSX.Element {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const tone = TONE[request.status];
  const { done, total } = request.progress;
  const share = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className={WRAP}>
      <div className={`${CARD} ${tone.card}`}>
        <button
          type="button"
          aria-expanded={open}
          title={t(open ? "mandate.collapse" : "mandate.expand")}
          onClick={() => {
            setOpen((shown) => !shown);
          }}
          className={HEAD}
        >
          <ChevronRight
            size={12}
            aria-hidden="true"
            className={`flex-[0_0_auto] text-ink-label transition-transform duration-300 ${open ? "rotate-90" : ""}`}
          />
          <Flag
            size={12}
            strokeWidth={1.7}
            aria-hidden="true"
            className={`flex-[0_0_auto] ${tone.flag}`}
          />
          <span className={TITLE}>{request.title}</span>
          {total === 0 ? null : (
            <span
              className="flex items-center gap-6 flex-[0_0_auto]"
              title={t("mandate.progress", { done, total })}
            >
              <span className={METER}>
                <span
                  className={`${FILL} ${tone.bar}`}
                  style={{ "--share": `${String(share)}%` }}
                />
              </span>
              <span
                className={`${MONO} text-9h text-ink-label`}
              >{`${String(done)}/${String(total)}`}</span>
            </span>
          )}
          <span className={`${CHIP} ${tone.chip}`}>{t(`mandate.status.${request.status}`)}</span>
          {request.round === 0 ? null : (
            <span className={`${CHIP} bg-edge-lit text-ink-faint`}>
              {t("mandate.round", { count: request.round })}
            </span>
          )}
        </button>
        {request.open ? <span className={SHIMMER} aria-hidden="true" /> : null}
        <div className={`${FOLD} ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
          <div className="min-h-0 overflow-hidden">
            <div className={BODY}>
              <RequestBody request={request} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
