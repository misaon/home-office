import { OfficeLayout } from "@ho/protocol";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Caption } from "../design/controls.tsx";
import { Section } from "../design/modal.tsx";
import { layoutsQuery } from "../queries.ts";
import { useOnline } from "../store.ts";

/** Any office JSON, not only the ones already in the repository. */
function LoadFile({ load }: { load: (office: OfficeLayout) => void }): React.JSX.Element {
  const { t } = useTranslation();
  const [problem, setProblem] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <div>
      <Caption>{t("editor.load")}</Caption>
      {/* A file input draws its own button and its own "no file chosen" in the system's language,
          neither of which the office can restyle, so the label is the button and the input is hidden. */}
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          fontSize: "11.5px",
          color: "#A6A39C",
        }}
      >
        <span
          id="ho-editor-file"
          style={{
            flex: "0 0 auto",
            cursor: "pointer",
            borderRadius: "9px",
            border: "1px solid #2C2C32",
            background: "#17171C",
            padding: "7px 12px",
            fontSize: "12px",
            color: "#E9E7E2",
            transition: "all .2s",
          }}
          className="hop3"
        >
          {t("editor.chooseFile")}
        </span>
        <span
          style={{
            minWidth: "0",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontFamily: "'JetBrains Mono',monospace",
          }}
        >
          {picked ?? t("editor.noFile")}
        </span>
        <input
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file === undefined) {
              return;
            }
            setPicked(file.name);
            void file.text().then((text) => {
              const parsed = OfficeLayout.safeParse(parseJson(text));
              if (parsed.success) {
                setProblem(null);
                load(parsed.data);
              } else {
                setProblem(parsed.error.issues[0]?.message ?? t("editor.notALayout"));
              }
            });
          }}
        />
      </label>
      {problem === null ? null : (
        <span style={{ fontSize: "11.5px", color: "#FFB3B3" }}>{problem}</span>
      )}
    </div>
  );
}

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

export function SavedOffices({
  load,
  save,
}: {
  load: (office: OfficeLayout) => void;
  save: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const online = useOnline();
  const store = useQuery({ ...layoutsQuery, enabled: online });
  const available = store.data?.available ?? false;
  return (
    <Section title={t("editor.saved")}>
      {available ? null : (
        <p style={{ fontSize: "11.5px", color: "#F2994A" }}>{t("editor.noRepo")}</p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        {(store.data?.layouts ?? []).map((office) => (
          <button
            key={office.id}
            type="button"
            style={{
              display: "block",
              width: "100%",
              borderRadius: "9px",
              border: "1px solid #26262C",
              background: "#111114",
              padding: "9px 12px",
              textAlign: "left",
              cursor: "pointer",
              transition: "all .2s",
            }}
            className="hopq"
            onClick={() => {
              load(office);
            }}
          >
            {office.name}{" "}
            <span
              style={{
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: "11px",
                color: "#A6A39C",
              }}
            >
              {office.id} · {office.width}×{office.height}
            </span>
          </button>
        ))}
      </div>
      <Button tone="primary" disabled={!available} onClick={save}>
        {t("editor.saveOffice")}
      </Button>
      <LoadFile load={load} />
    </Section>
  );
}
