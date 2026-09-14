import type { SecretKeyName } from "@ho/protocol";
import { useTranslation } from "react-i18next";
import { CredForm, NAMED } from "./settings-cred-form.tsx";
import { MONO, separator } from "./tokens.ts";
import { useDesign } from "./store.ts";

const HEAD: React.CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  gap: "10px",
  padding: "13px",
  border: "0",
  background: "transparent",
  cursor: "pointer",
  textAlign: "left",
  transition: "background .2s",
};

const NAME: React.CSSProperties = {
  flex: "1",
  minWidth: "0",
  fontSize: "13px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const TAG: React.CSSProperties = {
  ...MONO,
  fontSize: "9.5px",
  padding: "3px 9px",
  borderRadius: "99px",
  flex: "0 0 auto",
};

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
    <div
      style={{ display: "flex", alignItems: "stretch", borderTop: `1px solid ${separator(first)}` }}
    >
      <div style={{ width: "3px", flex: "0 0 3px", background: stored ? "#5BD9A0" : "#2C2C32" }} />
      <div style={{ flex: "1", minWidth: "0" }}>
        <button
          type="button"
          onClick={() => {
            set({ credOpen: open ? null : name });
          }}
          style={HEAD}
          className="ho-0b4177"
        >
          <span style={NAME}>{t(`tokens.${NAMED[name]}`)}</span>
          <span
            style={{
              ...TAG,
              background: stored ? "rgba(91,217,160,.14)" : "#24242A",
              color: stored ? "#8FE8C4" : "#BEBBB4",
            }}
          >
            {stored ? t("tokens.stored") : t("tokens.missing")}
          </span>
          <svg
            style={{
              flex: "0 0 auto",
              transition: "transform .3s",
              transform: `rotate(${open ? "90deg" : "0deg"})`,
            }}
            width="9"
            height="9"
            viewBox="0 0 12 12"
            fill="none"
            stroke="#A6A39C"
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
