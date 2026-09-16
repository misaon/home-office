import { SecretKeyName } from "@ho/protocol";
import { Accordion } from "@base-ui/react/accordion";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { secretsStatusQuery } from "../queries.ts";
import { useUi } from "../store.ts";
import { SettingsFloor } from "./settings-floor.tsx";
import { DISPLAY, MONO, pill, separator } from "./tokens.ts";
import { useFloors } from "./live.ts";
import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { LANGUAGES, type Language, setLanguage } from "../i18n/index.ts";
import { useDesign } from "./store.ts";
import { CredForm, NAMED } from "./settings-cred-form.tsx";
import { ChevronRight } from "lucide-react";

function LanguageCard(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const flash = useDesign((s) => s.flash);
  return (
    <div className="rounded-14 bg-card border border-edge overflow-hidden mb-18">
      <div className="flex items-center gap-11 p-13 flex-wrap">
        <div className="flex-1 min-w-120">
          <div className="text-13">{t("settings.language")}</div>
          <div className="text-11 text-ink-meta mt-4 leading-body">
            {t("settings.languageHint")}
          </div>
        </div>
        <ToggleGroup
          aria-label={t("settings.language")}
          value={[i18n.language]}
          onValueChange={(next) => {
            const picked = LANGUAGES.find((code: Language) => code === next.at(-1));
            if (picked !== undefined) {
              void setLanguage(picked).then(() => {
                flash(t("settings.languageSet"));
              });
            }
          }}
          className="flex gap-5 flex-[0_0_auto]"
        >
          {LANGUAGES.map((code: Language) => (
            <Toggle
              key={code}
              value={code}
              className={`py-6 px-13 rounded-pill cursor-pointer text-12 transition-all duration-220 hover:-translate-y-1 ${pill(i18n.language === code)}`}
            >
              {t(`settings.lang.${code}`)}
            </Toggle>
          ))}
        </ToggleGroup>
      </div>
    </div>
  );
}

const HEAD =
  "w-full flex items-center gap-10 p-13 border-0 bg-transparent cursor-pointer text-left transition-[background] duration-200";

const NAME = "flex-1 min-w-0 text-13 overflow-hidden text-ellipsis whitespace-nowrap";

const TAG = `${MONO} text-9h py-3 px-9 rounded-pill flex-[0_0_auto]`;

function CredRow({
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
            <ChevronRight
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

const HEADING = `${MONO} text-10 tracking-caps-wider uppercase text-ink-label`;

const CARD = "rounded-14 bg-card border border-edge overflow-hidden";

function Rule({ name, count }: { name: string; count: string }): React.JSX.Element {
  return (
    <div className="flex items-center gap-8 mt-0 mx-2 mb-9">
      <span className={HEADING}>{name}</span>
      <span className="flex-1 h-1 bg-slot" />
      <span className={`${MONO} text-10h text-ink-meta`}>{count}</span>
    </div>
  );
}

export function Settings(): React.JSX.Element {
  const { t } = useTranslation();
  const floors = useFloors();
  const setAddProjectOpen = useUi((s) => s.setAddProjectOpen);
  const secrets = useQuery(secretsStatusQuery);
  const present = secrets.data?.present ?? [];

  return (
    <div className="flex-1 min-h-0 overflow-y-auto animate-slide-420">
      <div className="pt-16 px-16 pb-14 border-b border-line mb-16">
        <div className={`${DISPLAY} font-bold text-26 tracking-display leading-flat`}>
          {t("settings.title")}
        </div>
        <div className="text-11h text-ink-label mt-8 leading-prose">{t("settings.intro")}</div>
      </div>
      <div className="pt-0 px-16 pb-16">
        <LanguageCard />
        <Rule
          name={t("settings.credentials")}
          count={`${String(present.length)}/${String(SecretKeyName.options.length)}`}
        />
        <Accordion.Root className={`${CARD} mb-18`}>
          {SecretKeyName.options.map((name, i) => (
            <CredRow key={name} name={name} stored={present.includes(name)} first={i === 0} />
          ))}
        </Accordion.Root>
        <Rule name={t("project.floors")} count={String(floors.length)} />
        <Accordion.Root className={CARD}>
          {floors.map((floor, index) => (
            <SettingsFloor key={floor.id} floor={floor} index={index} first={index === 0} />
          ))}
        </Accordion.Root>
        <button
          type="button"
          onClick={() => {
            setAddProjectOpen(true);
          }}
          className="hover:bg-accent-a14 hover:border-accent-a65 w-full mt-12 p-11 rounded-12 border border-dashed border-accent-a40 bg-accent-a07 text-accent-soft text-12h font-medium cursor-pointer transition-all duration-220"
        >
          {t("project.add")}
        </button>
      </div>
    </div>
  );
}
