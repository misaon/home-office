import type { Cred } from "./data-setup.ts";
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

const FIELD: React.CSSProperties = {
  flex: "1",
  minWidth: "120px",
  padding: "9px 11px",
  borderRadius: "10px",
  border: "1px solid #2C2C32",
  background: "#0A0A0C",
  ...MONO,
  fontSize: "11.5px",
};

const SAVE: React.CSSProperties = {
  padding: "9px 14px",
  borderRadius: "10px",
  border: "0",
  background: "var(--a,#FFC531)",
  color: "#150F02",
  fontSize: "12px",
  fontWeight: "600",
  cursor: "pointer",
  whiteSpace: "nowrap",
  flex: "0 0 auto",
  transition: "all .2s",
};

const FORGET: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: "10px",
  border: "1px solid #2C2C32",
  background: "transparent",
  fontSize: "12px",
  color: "#CFCCC6",
  cursor: "pointer",
  whiteSpace: "nowrap",
  flex: "0 0 auto",
  transition: "all .2s",
};

/** One key the office holds: whether it has it, what it is for, and where to paste a new one. */
export function CredRow({
  cred,
  index,
  first,
}: {
  cred: Cred;
  index: number;
  first: boolean;
}): React.JSX.Element {
  const credOpen = useDesign((s) => s.credOpen);
  const update = useDesign((s) => s.update);
  const flash = useDesign((s) => s.flash);
  const stored = cred.status === "stored";
  const open = credOpen === index;
  const setStatus = (status: Cred["status"], note: string): void => {
    update((s) => ({
      creds: s.creds.map((x, n) => (n === index ? { ...x, status, value: "" } : x)),
    }));
    flash(note);
  };

  return (
    <div
      style={{ display: "flex", alignItems: "stretch", borderTop: `1px solid ${separator(first)}` }}
    >
      <div style={{ width: "3px", flex: "0 0 3px", background: stored ? "#5BD9A0" : "#2C2C32" }} />
      <div style={{ flex: "1", minWidth: "0" }}>
        <button
          type="button"
          onClick={() => {
            update((s) => ({ credOpen: s.credOpen === index ? null : index }));
          }}
          style={HEAD}
          className="hopg"
        >
          <span style={NAME}>{cred.name}</span>
          <span
            style={{
              ...TAG,
              background: stored ? "rgba(91,217,160,.14)" : "#24242A",
              color: stored ? "#8FE8C4" : "#BEBBB4",
            }}
          >
            {cred.status}
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
        {open ? (
          <div style={{ padding: "0 13px 14px", animation: "riseIn .28s ease both" }}>
            <div
              style={{
                fontSize: "11.5px",
                color: "#A6A39C",
                lineHeight: "1.6",
                marginBottom: "11px",
              }}
            >
              {cred.desc}
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <input
                value={cred.value}
                onChange={(e) => {
                  const value = e.target.value;
                  update((s) => ({
                    creds: s.creds.map((x, n) => (n === index ? { ...x, value } : x)),
                  }));
                }}
                placeholder={stored ? "paste a new token to replace it" : "paste token"}
                style={FIELD}
              />
              <button
                type="button"
                onClick={() => {
                  setStatus("stored", `${cred.name} stored`);
                }}
                style={SAVE}
                className="hopn"
              >
                Save
              </button>
              {stored ? (
                <button
                  type="button"
                  onClick={() => {
                    setStatus("missing", `${cred.name} forgotten`);
                  }}
                  style={FORGET}
                  className="hopo"
                >
                  Forget
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
