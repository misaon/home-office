import { DISPLAY, MONO } from "./tokens.ts";
import { useTranslation } from "react-i18next";
import type { Floor, Member } from "./data.ts";
import { useDesign } from "./store.ts";

const BAR: React.CSSProperties = {
  flex: "0 0 auto",
  display: "flex",
  alignItems: "center",
  gap: "11px",
  padding: "14px 16px",
  borderBottom: "1px solid #1B1B1F",
};

const AVATAR: React.CSSProperties = {
  width: "34px",
  height: "34px",
  borderRadius: "11px",
  background: "linear-gradient(145deg,#FFD666,#E0A400)",
  display: "grid",
  placeItems: "center",
  ...DISPLAY,
  fontWeight: "700",
  fontSize: "14px",
  color: "#1A1300",
};

const ONLINE: React.CSSProperties = {
  position: "absolute",
  right: "-2px",
  bottom: "-2px",
  width: "10px",
  height: "10px",
  borderRadius: "50%",
  background: "#5BD9A0",
  border: "2px solid #0C0C0E",
};

const SEARCH: React.CSSProperties = {
  flex: "1",
  minWidth: "0",
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "8px 11px",
  borderRadius: "10px",
  background: "#0C0C0E",
  border: "1px solid rgba(255,197,49,.35)",
  animation: "fadeIn .2s ease both",
};

const SPEC: React.CSSProperties = {
  ...MONO,
  fontSize: "10.5px",
  color: "#ABA8A1",
  marginTop: "2px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

/** Who you are talking to — or, once you ask for it, the search over what was said. */
export function ChatHeader({
  floor,
  boss,
  hits,
}: {
  floor: Floor;
  boss: Member | undefined;
  hits: string;
}): React.JSX.Element {
  const { t } = useTranslation();
  const query = useDesign((s) => s.query);
  const searchOpen = useDesign((s) => s.searchOpen);
  const set = useDesign((s) => s.set);
  const update = useDesign((s) => s.update);

  return (
    <div style={BAR}>
      <div style={{ position: "relative", width: "34px", height: "34px", flex: "0 0 34px" }}>
        <div style={AVATAR}>
          <span>{boss?.i ?? "?"}</span>
        </div>
        <span style={ONLINE} />
      </div>
      {searchOpen ? (
        <div style={SEARCH}>
          <input
            value={query}
            onChange={(e) => {
              set({ query: e.target.value });
            }}
            placeholder={t("chat.search")}
            style={{
              flex: "1",
              minWidth: "0",
              border: "0",
              background: "transparent",
              fontSize: "12.5px",
            }}
          />
          <span style={{ ...MONO, fontSize: "10px", color: "#ABA8A1", flex: "0 0 auto" }}>
            {hits}
          </span>
        </div>
      ) : (
        <div style={{ flex: "1", minWidth: "0" }}>
          <div style={{ ...DISPLAY, fontWeight: "600", fontSize: "14px" }}>
            {boss?.name ?? t("chat.noBoss")}
          </div>
          <div style={SPEC}>
            {boss === undefined
              ? floor.name
              : `${boss.role} · ${boss.model.toLowerCase()} / ${boss.effort} · ${floor.name}`}
          </div>
        </div>
      )}
      <button
        type="button"
        aria-label={t("chat.search")}
        onClick={() => {
          update((s) => ({ searchOpen: !s.searchOpen, query: "" }));
        }}
        style={{
          width: "30px",
          height: "30px",
          flex: "0 0 30px",
          display: "grid",
          placeItems: "center",
          border: "1px solid #2C2C32",
          borderRadius: "9px",
          background: "transparent",
          color: searchOpen ? "#FFD666" : "#CFCCC6",
          cursor: "pointer",
          transition: "all .2s",
        }}
        className="hop8"
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <circle cx="6" cy="6" r="4.2" />
          <line x1="9.2" y1="9.2" x2="12.4" y2="12.4" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
