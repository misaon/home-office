import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { Floor } from "./data.ts";
import { useBossSession } from "./live.ts";
import { requireClient } from "../rpc.ts";
import { useDesign } from "./store.ts";

const BAR: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  padding: "9px 11px",
  borderRadius: "12px",
  background: "rgba(255,197,49,.07)",
  border: "1px solid rgba(255,197,49,.26)",
  marginBottom: "10px",
  animation: "riseIn .3s ease both",
};

const STOP: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "7px",
  padding: "6px 11px",
  borderRadius: "9px",
  border: "1px solid rgba(255,122,122,.35)",
  background: "rgba(255,122,122,.1)",
  color: "#FFB3B3",
  fontSize: "11.5px",
  cursor: "pointer",
  flex: "0 0 auto",
  transition: "all .2s",
};

/** While the floor's boss is running: what it is at, and the one way to cut it off. */
export function ChatWorking({ floor }: { floor: Floor }): React.JSX.Element | null {
  const { t } = useTranslation();
  const flash = useDesign((s) => s.flash);
  const confirm = useDesign((s) => s.confirm);
  const running = useBossSession(floor.id);

  const stop = useMutation({
    mutationFn: (id: NonNullable<typeof running>["sessionId"]) =>
      requireClient().sessions.stop({ id }),
    onSuccess: () => {
      flash(t("chat.stopped", { name: running?.name ?? "" }));
    },
    onError: (error: Error) => {
      flash(error.message);
    },
  });

  if (running === null) {
    return null;
  }
  return (
    <div style={BAR}>
      <span style={{ position: "relative", width: "7px", height: "7px", flex: "0 0 7px" }}>
        <span
          style={{
            position: "absolute",
            inset: "0",
            borderRadius: "50%",
            background: "var(--a,#FFC531)",
          }}
        />
        <span
          style={{
            position: "absolute",
            inset: "0",
            borderRadius: "50%",
            background: "var(--a,#FFC531)",
            animation: "ring 2s ease-out infinite",
          }}
        />
      </span>
      <span
        style={{
          flex: "1",
          minWidth: "0",
          fontSize: "12px",
          color: "#F2EFE8",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {`${running.name} · ${running.doing}`}
      </span>
      <button
        type="button"
        disabled={stop.isPending}
        onClick={() => {
          confirm({
            danger: false,
            title: t("chat.stopTitle", { name: running.name }),
            body: t("chat.stopBody"),
            okLabel: t("chat.stopOk", { name: running.name }),
            cancelLabel: t("chat.stopCancel"),
            act: () => {
              stop.mutate(running.sessionId);
            },
          });
        }}
        style={STOP}
        className="ho-819fb6"
      >
        <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor">
          <rect x="2.5" y="2.5" width="7" height="7" rx="1.4" />
        </svg>
        {t("chat.stop")}
      </button>
    </div>
  );
}
