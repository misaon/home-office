import { OfficeLayout } from "@ho/protocol";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Field, Section } from "../kit/controls.tsx";
import { layoutsQuery } from "../queries.ts";
import { useOnline } from "../store.ts";

/** Any office JSON, not only the ones already in the repository. */
function LoadFile({ load }: { load: (office: OfficeLayout) => void }): React.JSX.Element {
  const { t } = useTranslation();
  const [problem, setProblem] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <Field id="ho-editor-file" label={t("editor.load")}>
      {/* A file input draws its own button and its own "no file chosen" in the system's language,
          neither of which the office can restyle, so the label is the button and the input is hidden. */}
      <label className="flex items-center gap-3 text-2xs text-faint">
        <span
          id="ho-editor-file"
          className="shrink-0 cursor-pointer rounded-lg border border-line bg-raised px-3 py-1.5 text-xs text-text hover:border-line-strong hover:bg-line/60"
        >
          {t("editor.chooseFile")}
        </span>
        <span className="min-w-0 truncate font-mono">{picked ?? t("editor.noFile")}</span>
        <input
          type="file"
          accept="application/json,.json"
          className="hidden"
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
      {problem === null ? null : <span className="text-2xs text-bad">{problem}</span>}
    </Field>
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
      {available ? null : <p className="text-2xs text-warn">{t("editor.noRepo")}</p>}
      <div className="space-y-1">
        {(store.data?.layouts ?? []).map((office) => (
          <button
            key={office.id}
            type="button"
            className="block w-full rounded-md px-3 py-2 text-left hover:bg-line"
            onClick={() => {
              load(office);
            }}
          >
            {office.name}{" "}
            <span className="font-mono text-2xs text-faint">
              {office.id} · {office.width}×{office.height}
            </span>
          </button>
        ))}
      </div>
      <Button variant="primary" disabled={!available} onClick={save}>
        {t("editor.saveOffice")}
      </Button>
      <LoadFile load={load} />
    </Section>
  );
}
