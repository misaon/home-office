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

const HEADING: React.CSSProperties = {
  ...MONO,
  fontSize: "10px",
  letterSpacing: ".16em",
  textTransform: "uppercase",
  color: "#ABA8A1",
};

const CARD: React.CSSProperties = {
  borderRadius: "14px",
  background: "#101013",
  border: "1px solid #232328",
  overflow: "hidden",
};

/** A section rule with its name on the left and its count on the right. */
function Rule({ name, count }: { name: string; count: string }): React.JSX.Element {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", margin: "0 2px 9px" }}>
      <span style={HEADING}>{name}</span>
      <span style={{ flex: "1", height: "1px", background: "#1F1F24" }} />
      <span style={{ ...MONO, fontSize: "10.5px", color: "#A6A39C" }}>{count}</span>
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
    <div
      style={{
        flex: "1",
        minHeight: "0",
        overflowY: "auto",
        animation: "slideLeft .42s cubic-bezier(.2,.8,.3,1) both",
      }}
    >
      <div
        style={{
          padding: "16px 16px 14px",
          borderBottom: "1px solid #1B1B1F",
          marginBottom: "16px",
        }}
      >
        <div
          style={{
            ...DISPLAY,
            fontWeight: "700",
            fontSize: "26px",
            letterSpacing: "-.02em",
            lineHeight: "1",
          }}
        >
          {t("settings.title")}
        </div>
        <div style={{ fontSize: "11.5px", color: "#ABA8A1", marginTop: "8px", lineHeight: "1.6" }}>
          {t("settings.intro")}
        </div>
      </div>
      <div style={{ padding: "0 16px 16px" }}>
        <LanguageCard />
        <Rule
          name={t("settings.credentials")}
          count={`${String(present.length)}/${String(SecretKeyName.options.length)}`}
        />
        <div style={{ ...CARD, marginBottom: "18px" }}>
          {SecretKeyName.options.map((name, i) => (
            <CredRow key={name} name={name} stored={present.includes(name)} first={i === 0} />
          ))}
        </div>
        <Rule name={t("project.floors")} count={String(floors.length)} />
        <div style={CARD}>
          {floors.map((floor, index) => (
            <SettingsFloor key={floor.id} floor={floor} index={index} first={index === 0} />
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            setAddProjectOpen(true);
          }}
          style={{
            width: "100%",
            marginTop: "12px",
            padding: "11px",
            borderRadius: "12px",
            border: "1px dashed rgba(255,197,49,.4)",
            background: "rgba(255,197,49,.07)",
            color: "#FFD666",
            fontSize: "12.5px",
            fontWeight: "500",
            cursor: "pointer",
            transition: "all .22s",
          }}
          className="ho-4ede91"
        >
          {t("project.add")}
        </button>
      </div>
    </div>
  );
}
