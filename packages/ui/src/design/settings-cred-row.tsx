import type { SecretKeyName } from "@ho/protocol";
import { useTranslation } from "react-i18next";
import { CredForm, NAMED } from "./settings-cred-form.tsx";
import { MONO, separator } from "./tokens.ts";
import { useDesign } from "./store.ts";

const HEAD =
  "w-full flex items-center gap-10 p-13 border-0 bg-transparent cursor-pointer text-left transition-[background] duration-200";

const NAME = "flex-1 min-w-0 text-13 overflow-hidden text-ellipsis whitespace-nowrap";

const TAG = `${MONO} text-9h py-3 px-9 rounded-pill flex-[0_0_auto]`;

/** One key the office holds: whether it has it, and the door to pasting a new one. */
export function CredRow({
  name,
  stored,
  first,
}: {
  name: SecretKeyName;
  stored: boolean;
  first: boolean;
}): React.JSX.Element {
  const { t } = useTranslation();
  const credOpen = useDesign((s) => s.credOpen);
  const set = useDesign((s) => s.set);
  const open = credOpen === name;

  return (
    <div className={`flex items-stretch ${separator(first)}`}>
      <div className={`w-3 flex-[0_0_3px] ${stored ? "bg-good" : "bg-border-strong"}`} />
      <div className="flex-1 min-w-0">
        <button
          type="button"
          onClick={() => {
            set({ credOpen: open ? null : name });
          }}
          className={`hover:bg-row-hover ${HEAD}`}
        >
          <span className={NAME}>{t(`tokens.${NAMED[name]}`)}</span>
          <span
            className={`${TAG} ${stored ? "bg-good-a14" : "bg-edge-lit"} ${stored ? "text-good-soft" : "text-ink-faint"}`}
          >
            {stored ? t("tokens.stored") : t("tokens.missing")}
          </span>
          <svg
            className={`flex-[0_0_auto] transition-transform duration-300 ${open ? "rotate-90" : "rotate-0"} stroke-ink-meta`}
            width="9"
            height="9"
            viewBox="0 0 12 12"
            fill="none"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <polyline points="4.5,3 8,6 4.5,9" />
          </svg>
        </button>
        {open ? <CredForm name={name} stored={stored} /> : null}
      </div>
    </div>
  );
}
