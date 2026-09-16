import type { OfficeFileSync } from "@ho/protocol";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./controls.tsx";
import type { Floor } from "./data.ts";
import { requireClient } from "../rpc.ts";
import { useDesign, useOfficeMutation } from "./store.ts";
import { MONO } from "./tokens.ts";

const LINE = `${MONO} text-10h leading-prose overflow-hidden text-ellipsis`;

/** The diff the daemon reported, in the order it planned it: what moved, then what it could not do. */
function Report({ sync }: { sync: OfficeFileSync }): React.JSX.Element {
  const { t } = useTranslation();
  const quiet = sync.changes.length === 0 && sync.problems.length === 0;
  return (
    <div className="mt-10 py-9 px-11 rounded-10 border border-border-strong bg-well">
      <div className={`${LINE} text-ink-meta`}>{sync.source ?? t("project.configNone")}</div>
      {quiet ? (
        <div className={`${LINE} text-ink-meta mt-4`}>{t("project.configNothing")}</div>
      ) : null}
      {sync.changes.map((change) => (
        <div key={change} className={`${LINE} text-ink mt-4`}>
          {change}
        </div>
      ))}
      {sync.problems.map((problem) => (
        <div key={problem} className={`${LINE} text-bad-soft mt-4`}>
          {problem}
        </div>
      ))}
    </div>
  );
}

/**
 * The floor and its repository, in both directions: apply what `.ho/config.json` says, or write the
 * floor as it stands into that file. Applying is what the daemon does by itself on start and on every
 * change of the file; this button is for saying "now".
 */
export function FloorConfigFile({ floor }: { floor: Floor }): React.JSX.Element {
  const { t } = useTranslation();
  const flash = useDesign((s) => s.flash);
  const [report, setReport] = useState<OfficeFileSync | null>(null);

  const sync = useOfficeMutation({
    mutationFn: () => requireClient().projects.sync({ id: floor.id, dryRun: false }),
    onSuccess: setReport,
  });
  const write = useOfficeMutation({
    mutationFn: () => requireClient().projects.export({ id: floor.id }),
    onSuccess: (written) => {
      setReport(null);
      flash(t("project.configWrote", { path: written.path }));
    },
  });

  return (
    <div className="mt-14">
      <div className="text-13">{t("project.configTitle")}</div>
      <div className="text-11h text-ink-meta leading-prose mt-4">{t("project.configHint")}</div>
      <div className={`${LINE} text-ink-meta mt-7`}>
        {floor.verify === ""
          ? t("project.verifyNone")
          : t("project.verifyCommand", { command: floor.verify })}
      </div>
      <div className="flex gap-9 mt-10 flex-wrap">
        <Button
          disabled={sync.isPending || write.isPending}
          onClick={() => {
            sync.mutate();
          }}
        >
          {t("project.configSync")}
        </Button>
        <Button
          disabled={sync.isPending || write.isPending}
          onClick={() => {
            write.mutate();
          }}
        >
          {t("project.configExport")}
        </Button>
      </div>
      {report === null ? null : <Report sync={report} />}
    </div>
  );
}
