import { useMutation } from "@tanstack/react-query";
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
import { useDesign } from "./store.ts";

const EMPTY: RepoDraft = {
  kind: "local",
  path: "",
  url: "",
  name: "",
  branch: "",
  imports: new Set(),
};

const ICON: React.CSSProperties = {
  width: "40px",
  height: "40px",
  flex: "0 0 40px",
  borderRadius: "13px",
  background: "var(--a,#FFC531)",
  display: "grid",
  placeItems: "center",
  boxShadow: "0 10px 26px rgba(255,197,49,.28)",
};

/** The gold house and the two lines that say what a floor is. */
function NewFloorHead(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <>
      <div style={ICON}>
        <svg
          width="19"
          height="19"
          viewBox="0 0 20 20"
          fill="none"
          stroke="#150F02"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 17V8l7-4 7 4v9" />
          <path d="M8 17v-5h4v5" />
        </svg>
      </div>
      <div style={{ flex: "1", minWidth: "0" }}>
        <div
          style={{
            ...DISPLAY,
            fontWeight: "700",
            fontSize: "21px",
            letterSpacing: "-.015em",
            lineHeight: "1.15",
          }}
        >
          {t("project.newTitle")}
        </div>
        <div
          style={{
            fontSize: "12.5px",
            color: "#ABA8A1",
            marginTop: "7px",
            lineHeight: "1.6",
            textWrap: "pretty",
          }}
        >
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
    set({ openSelect: null });
  };
  const create = useMutation({
    mutationFn: (input: Parameters<Client["projects"]["create"]>[0]) =>
      requireClient().projects.create(input),
    onSuccess: (project) => {
      selectFloor(project.id);
      close();
      set({ tab: "Team" });
      flash(t("project.created", { name: project.name }));
    },
    onError: (error: Error) => {
      flash(error.message);
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
          <span style={HINT}>
            {typed === ""
              ? t("project.repoIsAll")
              : t("project.changeLater", { number: floors + 1 })}
          </span>
          <button type="button" onClick={close} style={CANCEL} className="ho-2955a9">
            {t("common.cancel")}
          </button>
          <button
            type="button"
            disabled={create.isPending}
            onClick={submit}
            style={{
              ...COMMIT,
              background: ready ? "var(--a,#FFC531)" : "#24242A",
              color: ready ? "#150F02" : "#8A8780",
            }}
            className="ho-373252"
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
