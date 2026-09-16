import { OfficeLayout } from "@ho/protocol";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Caption } from "../design/controls.tsx";
import { Section } from "../design/section.tsx";
import { layoutsQuery } from "../queries.ts";
import { useOnline } from "../store.ts";

function LoadFile({ load }: { load: (office: OfficeLayout) => void }): React.JSX.Element {
  const { t } = useTranslation();
  const [problem, setProblem] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <div>
      <Caption>{t("editor.load")}</Caption>
      {/* A file input draws its own button and its own "no file chosen" in the system's language,
          neither of which the office can restyle, so the label is the button and the input is hidden. */}
      <label className="flex items-center gap-12 text-11h text-ink-meta">
        <span
          id="ho-editor-file"
          className="hover:text-ink hover:border-border-hover hover:bg-raised flex-[0_0_auto] cursor-pointer rounded-9 border border-border-strong bg-menu py-7 px-12 text-12 text-ink-soft transition-all duration-200"
        >
          {t("editor.chooseFile")}
        </span>
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono">
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
      {problem === null ? null : <span className="text-11h text-bad-soft">{problem}</span>}
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
      {available ? null : <p className="text-11h text-warn my-11h">{t("editor.noRepo")}</p>}
      <div className="flex flex-col gap-4">
        {(store.data?.layouts ?? []).map((office) => (
          <button
            key={office.id}
            type="button"
            className="hover:border-accent-a40 hover:-translate-y-1 block w-full rounded-9 border border-border bg-card-lit py-9 px-12 text-left cursor-pointer transition-all duration-200"
            onClick={() => {
              load(office);
            }}
          >
            {office.name}{" "}
            <span className="font-mono text-11 text-ink-meta">
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
