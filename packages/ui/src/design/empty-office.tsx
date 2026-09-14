import { useTranslation } from "react-i18next";
import { DISPLAY, MONO } from "./tokens.ts";
import { useUi } from "../store.ts";

const STEPS = ["1", "2", "3"] as const;

const CARD: React.CSSProperties = {
  flex: "1 1 150px",
  minWidth: "150px",
  padding: "14px",
  borderRadius: "14px",
  background: "#101013",
  border: "1px solid #232328",
};

const PRIMARY: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "9px",
  padding: "13px 22px",
  borderRadius: "13px",
  border: "0",
  background: "var(--a,#FFC531)",
  color: "#150F02",
  fontSize: "13.5px",
  fontWeight: "600",
  cursor: "pointer",
  transition: "all .22s cubic-bezier(.2,.8,.3,1)",
};

const SECONDARY: React.CSSProperties = {
  padding: "13px 18px",
  borderRadius: "13px",
  border: "1px solid #2C2C32",
  background: "transparent",
  fontSize: "13.5px",
  color: "#CFCCC6",
  cursor: "pointer",
  transition: "all .2s",
};

/** The gold house with its slow halo: the office's own mark, at rest. */
function EmptyMark(): React.JSX.Element {
  return (
    <div style={{ position: "relative", width: "96px", height: "96px", margin: "0 auto 26px" }}>
      <div
        style={{
          position: "absolute",
          inset: "0",
          borderRadius: "28px",
          background: "var(--a,#FFC531)",
          display: "grid",
          placeItems: "center",
          boxShadow: "0 18px 44px rgba(255,197,49,.28)",
        }}
      >
        <svg
          width="42"
          height="42"
          viewBox="0 0 20 20"
          fill="none"
          stroke="#150F02"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 17V8l7-4 7 4v9" />
          <path d="M8 17v-5h4v5" />
        </svg>
      </div>
      <div
        style={{
          position: "absolute",
          inset: "-10px",
          borderRadius: "36px",
          border: "1.5px solid rgba(255,197,49,.45)",
          animation: "ring 3.4s ease-out infinite",
        }}
      />
    </div>
  );
}

/** The only two things worth doing before the first floor exists. */
function EmptyActions(): React.JSX.Element {
  const { t } = useTranslation();
  const setAddProjectOpen = useUi((s) => s.setAddProjectOpen);
  const setSetupOpen = useUi((s) => s.setSetupOpen);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "9px",
        marginTop: "26px",
        flexWrap: "wrap",
      }}
    >
      <button
        type="button"
        onClick={() => {
          setAddProjectOpen(true);
        }}
        style={PRIMARY}
        className="ho-9d2067"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 12 12"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        >
          <line x1="6" y1="2" x2="6" y2="10" />
          <line x1="2" y1="6" x2="10" y2="6" />
        </svg>
        {t("app.emptyCreate")}
      </button>
      <button
        type="button"
        onClick={() => {
          setSetupOpen(true);
        }}
        style={SECONDARY}
        className="ho-2955a9"
      >
        {t("app.emptySetup")}
      </button>
    </div>
  );
}

/** Three cards that say what happens after the first floor. */
function EmptySteps(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div
      style={{
        display: "flex",
        gap: "10px",
        marginTop: "34px",
        textAlign: "left",
        flexWrap: "wrap",
        justifyContent: "center",
      }}
    >
      {STEPS.map((n) => (
        <div key={n} style={CARD}>
          <div
            style={{
              width: "24px",
              height: "24px",
              borderRadius: "8px",
              background: "rgba(255,197,49,.14)",
              color: "#FFD666",
              display: "grid",
              placeItems: "center",
              ...MONO,
              fontSize: "11px",
              marginBottom: "11px",
            }}
          >
            <span>{n}</span>
          </div>
          <div style={{ fontSize: "12.5px", fontWeight: "600", color: "#F2EFE8" }}>
            {t(`app.emptyStep${n}Title`)}
          </div>
          <div
            style={{
              fontSize: "11.5px",
              color: "#A6A39C",
              marginTop: "5px",
              lineHeight: "1.55",
            }}
          >
            {t(`app.emptyStep${n}Body`)}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Before the first project: the office says what it is for and offers the one thing worth doing. */
export function EmptyOffice(): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <main
      style={{
        flex: "1",
        minHeight: "0",
        position: "relative",
        zIndex: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px",
        backgroundImage: "radial-gradient(rgba(255,255,255,.05) 1px,transparent 1px)",
        backgroundSize: "26px 26px",
      }}
    >
      <div
        style={{
          width: "min(560px,100%)",
          textAlign: "center",
          animation: "popIn .5s cubic-bezier(.2,.9,.3,1.05) both",
        }}
      >
        <EmptyMark />
        <div
          style={{
            ...DISPLAY,
            fontWeight: "700",
            fontSize: "32px",
            letterSpacing: "-.025em",
            lineHeight: "1.1",
          }}
        >
          {t("app.emptyTitle")}
        </div>
        <div
          style={{
            fontSize: "13.5px",
            color: "#ABA8A1",
            marginTop: "14px",
            lineHeight: "1.65",
            maxWidth: "420px",
            marginLeft: "auto",
            marginRight: "auto",
            textWrap: "pretty",
          }}
        >
          {t("app.emptyBody")}
        </div>
        <EmptyActions />
        <EmptySteps />
      </div>
    </main>
  );
}
