import { Dialog } from "@base-ui/react/dialog";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { hintFor, typedIn, useRepoInspection, type RepoDraft } from "./add-project-inspect.ts";
import { CANCEL, COMMIT, DialogSheet, HINT } from "./dialog-sheet.tsx";
import { FloorImports } from "./new-floor-imports.tsx";
import { FloorDetails, FloorPreview } from "./new-floor-preview.tsx";
import { FloorSource } from "./new-floor-source.tsx";
import { type Client, requireClient } from "../rpc.ts";
import { useUi } from "../store.ts";
import { DISPLAY } from "./tokens.ts";
import { useDesign, useOfficeMutation } from "./store.ts";

const EMPTY: RepoDraft = {
  kind: "local",
  path: "",
  url: "",
  name: "",
  branch: "",
  imports: new Set(),
};

const ICON = "w-40 h-40 flex-[0_0_40px] rounded-13 bg-accent grid place-items-center shadow-gold";

/** The gold house and the two lines that say what a floor is. */
function NewFloorHead(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <>
      <div className={ICON}>
        <svg
          className="stroke-accent-ink"
          width="19"
          height="19"
          viewBox="0 0 20 20"
          fill="none"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 17V8l7-4 7 4v9" />
          <path d="M8 17v-5h4v5" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <div className={`${DISPLAY} font-bold text-21 tracking-tighter leading-title`}>
          {t("project.newTitle")}
        </div>
        <div className="text-12h text-ink-label mt-7 leading-prose text-pretty">
          {t("project.newSub")}
        </div>
      </div>
    </>
  );
}

/**
 * A floor is one project with its own boss, its own board and its own sandboxes. Point it at a
 * repository — a folder on this machine or a git URL — and the daemon checks it before it is made.
 */
export function NewFloor(): React.JSX.Element | null {
  const { t } = useTranslation();
  const open = useUi((s) => s.addProjectOpen);
  const setOpen = useUi((s) => s.setAddProjectOpen);
  const selectFloor = useUi((s) => s.selectFloor);
  const floors = useUi((s) => s.snapshot.projects.size);
  const flash = useDesign((s) => s.flash);
  const set = useDesign((s) => s.set);
  const [draft, setDraft] = useState<RepoDraft>(EMPTY);

  const inspecting = useRepoInspection(draft.kind, open ? typedIn(draft) : "");
  const inspection = inspecting.result?.ok === true ? inspecting.result : null;
  const typed = typedIn(draft);
  const typedName = draft.name.trim();
  const name = typedName === "" ? (inspection?.name ?? "") : typedName;

  const close = (): void => {
    setOpen(false);
    setDraft(EMPTY);
  };
  const create = useOfficeMutation({
    mutationFn: (input: Parameters<Client["projects"]["create"]>[0]) =>
      requireClient().projects.create(input),
    onSuccess: (project) => {
      selectFloor(project.id);
      close();
      set({ tab: "Team" });
      flash(t("project.created", { name: project.name }));
    },
  });

  const ready = inspection !== null && name !== "";
  const submit = (): void => {
    if (!ready) {
      flash(t("project.pointFirst"));
      return;
    }
    create.mutate({
      name,
      repo: inspection.repo,
      defaultBranch: draft.branch === "" ? inspection.defaultBranch : draft.branch,
      importAgentIds: [...draft.imports],
    });
  };

  return (
    <DialogSheet
      open={open}
      width="min(620px,100%)"
      label={t("project.newTitle")}
      onClose={close}
      head={<NewFloorHead />}
      footer={
        <>
          <span className={HINT}>
            {typed === ""
              ? t("project.repoIsAll")
              : t("project.changeLater", { number: floors + 1 })}
          </span>
          <Dialog.Close
            onClick={close}
            className={`hover:text-ink hover:border-border-hover hover:bg-raised ${CANCEL}`}
          >
            {t("common.cancel")}
          </Dialog.Close>
          <button
            type="button"
            disabled={create.isPending}
            onClick={submit}
            className={`hover:-translate-y-2 hover:shadow-lift-lg ${COMMIT} ${ready ? "bg-accent" : "bg-edge-lit"} ${ready ? "text-accent-ink" : "text-ink-ghost"}`}
          >
            {t("project.createFloor")}
          </button>
        </>
      }
    >
      <FloorSource
        draft={draft}
        setDraft={setDraft}
        hint={hintFor(draft.kind, typed, inspecting, t).text}
        onFail={flash}
      />
      <FloorDetails draft={draft} setDraft={setDraft} inspection={inspection} />
      <FloorPreview
        number={floors + 1}
        name={name === "" ? null : name}
        meta={
          typed === ""
            ? t("project.previewNothing")
            : t("project.previewMeta", {
                source: t(draft.kind === "local" ? "project.previewLocal" : "project.previewGit"),
                branch: draft.branch === "" ? (inspection?.defaultBranch ?? "—") : draft.branch,
              })
        }
      />
      <FloorImports draft={draft} setDraft={setDraft} />
    </DialogSheet>
  );
}
