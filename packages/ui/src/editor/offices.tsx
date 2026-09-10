import { OfficeLayout } from "@ho/protocol";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, CONTROL, Field, Section } from "../kit/controls.tsx";
import { requireClient } from "../rpc.ts";
import { useUi } from "../store.ts";

export const layoutsQuery = {
  queryKey: ["layouts"],
  queryFn: () => requireClient().layouts.list(),
} as const;

/** Any office JSON, not only the ones already in the repository. */
function LoadFile({ load }: { load: (office: OfficeLayout) => void }): React.JSX.Element {
  const { t } = useTranslation();
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <Field id="ho-editor-file" label={t("editor.load")}>
      <input
        id="ho-editor-file"
        type="file"
        accept="application/json,.json"
        className={`${CONTROL} file:mr-3 file:rounded file:border-0 file:bg-line file:px-2 file:py-1 file:text-gray-100`}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file === undefined) {
            return;
          }
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
      {problem === null ? null : <span className="text-2xs text-red-300">{problem}</span>}
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
  const connection = useUi((s) => s.connection);
  const store = useQuery({ ...layoutsQuery, enabled: connection === "online" });
  const available = store.data?.available ?? false;
  return (
    <Section title={t("editor.saved")}>
      {available ? null : <p className="text-2xs text-amber-300">{t("editor.noRepo")}</p>}
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
            <span className="font-mono text-2xs text-gray-500">
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
