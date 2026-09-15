import { Accordion } from "@base-ui/react/accordion";
import type { SecretKeyName } from "@ho/protocol";
import { useTranslation } from "react-i18next";
import { CredForm, NAMED } from "./settings-cred-form.tsx";
import { Chevron } from "./icons.tsx";
import { MONO, separator } from "./tokens.ts";

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

  return (
    <Accordion.Item value={name} className={`flex items-stretch ${separator(first)}`}>
      <div className={`w-3 flex-[0_0_3px] ${stored ? "bg-good" : "bg-border-strong"}`} />
      <div className="flex-1 min-w-0">
        <Accordion.Header>
          <Accordion.Trigger className={`hover:bg-row-hover ${HEAD}`}>
            <span className={NAME}>{t(`tokens.${NAMED[name]}`)}</span>
            <span
              className={`${TAG} ${stored ? "bg-good-a14" : "bg-edge-lit"} ${stored ? "text-good-soft" : "text-ink-faint"}`}
            >
              {stored ? t("tokens.stored") : t("tokens.missing")}
            </span>
            <Chevron
              size={9}
              strokeWidth={1.5}
              className="flex-[0_0_auto] transition-transform duration-300 rotate-0 data-panel-open:rotate-90 stroke-ink-meta"
            />
          </Accordion.Trigger>
        </Accordion.Header>
        <Accordion.Panel>
          <CredForm name={name} stored={stored} />
        </Accordion.Panel>
      </div>
    </Accordion.Item>
  );
}
