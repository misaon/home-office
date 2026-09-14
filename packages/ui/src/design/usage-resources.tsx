import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { resourcesQuery } from "../queries.ts";
import type { Floor } from "./data.ts";
import { MONO, separator } from "./tokens.ts";

const CARD: React.CSSProperties = {
  borderRadius: "14px",
  background: "#101013",
  border: "1px solid #232328",
  overflow: "hidden",
  marginBottom: "18px",
};

const RULE: React.CSSProperties = {
  ...MONO,
  fontSize: "10px",
  letterSpacing: ".16em",
  textTransform: "uppercase",
  color: "#ABA8A1",
};

const NAME: React.CSSProperties = {
  ...MONO,
  fontSize: "12px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const gb = (bytes: number): string => `${(bytes / 1024 ** 3).toFixed(1)} GB`;

/** A rule with its count on the right. */
function Rule({ name, count }: { name: string; count: string }): React.JSX.Element {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", margin: "0 2px 9px" }}>
      <span style={RULE}>{name}</span>
      <span style={{ flex: "1", height: "1px", background: "#1F1F24" }} />
      <span style={{ ...MONO, fontSize: "10.5px", color: "#A6A39C" }}>{count}</span>
    </div>
  );
}

/** What the office is actually running on: the sandboxes that exist and the disk they hold. */
export function UsageResources({ floor }: { floor: Floor }): React.JSX.Element {
  const { t } = useTranslation();
  const query = useQuery({ ...resourcesQuery, refetchInterval: 20_000 });
  const inventory = query.data;

  if (inventory === undefined) {
    return (
      <div style={{ padding: "16px 2px", fontSize: "12px", color: "#A6A39C" }}>
        {query.isError ? t("resources.failed") : t("common.checking")}
      </div>
    );
  }

  return (
    <div style={{ animation: "fadeUp .35s ease both" }}>
      <Rule name={t("resources.containers")} count={String(inventory.containers.length)} />
      <div style={CARD}>
        {inventory.containers.map((box, i) => {
          const up = box.state === "running";
          return (
            <div
              key={box.name}
              style={{
                display: "flex",
                alignItems: "stretch",
                borderTop: `1px solid ${separator(i === 0)}`,
              }}
            >
              <div
                style={{ width: "3px", flex: "0 0 3px", background: up ? "#5BD9A0" : "#3A3A41" }}
              />
              <div style={{ flex: "1", minWidth: "0", padding: "12px 13px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={NAME}>{box.name}</span>
                  <div style={{ flex: "1" }} />
                  <span style={{ ...MONO, fontSize: "10px", color: "#A6A39C", flex: "0 0 auto" }}>
                    {box.state}
                  </span>
                </div>
                <div style={{ ...MONO, fontSize: "10px", color: "#A6A39C", marginTop: "6px" }}>
                  {box.kind}
                </div>
              </div>
            </div>
          );
        })}
        {inventory.containers.length === 0 ? (
          <div style={{ padding: "16px 13px", fontSize: "12px", color: "#A6A39C" }}>
            {t("resources.noneRunning")}
          </div>
        ) : null}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "11px",
            padding: "13px",
            borderTop: "1px solid #1E1E23",
            background: "#0D0D10",
          }}
        >
          <span
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: "#5BD9A0",
              boxShadow: "0 0 10px rgba(91,217,160,.7)",
              flex: "0 0 auto",
            }}
          />
          <div style={{ flex: "1", minWidth: "0" }}>
            <div style={{ fontSize: "13px" }}>{t("resources.engine")}</div>
            <div style={{ ...MONO, fontSize: "10.5px", color: "#A6A39C", marginTop: "3px" }}>
              {t("resources.held", {
                volumes: inventory.snapshot.volumes,
                images: gb(inventory.snapshot.imagesBytes),
                disk: gb(inventory.snapshot.volumesBytes),
              })}
            </div>
          </div>
        </div>
      </div>
      <Rule name={t("resources.floor")} count={floor.name} />
    </div>
  );
}
