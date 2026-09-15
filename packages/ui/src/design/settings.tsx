import { Accordion } from "@base-ui/react/accordion";
import { SecretKeyName } from "@ho/protocol";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { secretsStatusQuery } from "../queries.ts";
import { useUi } from "../store.ts";
import { CredRow } from "./settings-cred-row.tsx";
import { LanguageCard } from "./settings-language.tsx";
import { SettingsFloor } from "./settings-floor.tsx";
import { DISPLAY, MONO } from "./tokens.ts";
import { useFloors } from "./live.ts";

const HEADING = `${MONO} text-10 tracking-caps-wider uppercase text-ink-label`;

const CARD = "rounded-14 bg-card border border-edge overflow-hidden";

/** A section rule with its name on the left and its count on the right. */
function Rule({ name, count }: { name: string; count: string }): React.JSX.Element {
  return (
    <div className="flex items-center gap-8 mt-0 mx-2 mb-9">
      <span className={HEADING}>{name}</span>
      <span className="flex-1 h-1 bg-slot" />
      <span className={`${MONO} text-10h text-ink-meta`}>{count}</span>
    </div>
  );
}

/** The office itself: the language it speaks, the keys it holds and the floors it has. */
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
