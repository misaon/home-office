import { useTranslation } from "react-i18next";
import { CONNECTION_KEY, useUi } from "../store.ts";

/** Online, connecting or gone, in the pill the design puts next to the office's name. */
export function Connection(): React.JSX.Element {
  const { t } = useTranslation();
  const connection = useUi((s) => s.connection);
  const online = connection === "online";
  const colour = online ? "#5BD9A0" : connection === "connecting" ? "#FFC531" : "#FF9E9E";
  const label = t(CONNECTION_KEY[connection]);
  return (
    <div
      title={label}
      aria-label={label}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "5px",
        borderRadius: "99px",
        flex: "0 0 auto",
        background: online ? "rgba(91,217,160,.1)" : "rgba(255,197,49,.1)",
        border: `1px solid ${online ? "rgba(91,217,160,.26)" : "rgba(255,197,49,.26)"}`,
        transition: "background .3s,border-color .3s",
      }}
    >
      <span style={{ position: "relative", width: "6px", height: "6px", display: "inline-block" }}>
        <span
          style={{ position: "absolute", inset: "0", borderRadius: "50%", background: colour }}
        />
        {online ? (
          <span
            style={{
              position: "absolute",
              inset: "0",
              borderRadius: "50%",
              background: colour,
              animation: "ring 2.4s ease-out infinite",
            }}
          />
        ) : null}
      </span>
    </div>
  );
}
