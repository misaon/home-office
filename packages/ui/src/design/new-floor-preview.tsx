import { useTranslation } from "react-i18next";
import { CAP, INPUT } from "./dialog-sheet.tsx";
import type { Found, RepoDraft } from "./add-project-inspect.ts";
import { SelectField } from "./select-field.tsx";
import { ELLIPSIS, MONO } from "./tokens.ts";

const ROW = "flex items-center gap-11 mt-18 py-13 px-14 rounded-13 transition-all duration-280";

const BADGE = `w-26 h-26 flex-[0_0_26px] rounded-8 grid place-items-center ${MONO} text-11`;

export function FloorDetails({
  draft,
  setDraft,
  inspection,
}: {
  draft: RepoDraft;
  setDraft: (draft: RepoDraft) => void;
  inspection: Found | null;
}): React.JSX.Element {
  const { t } = useTranslation();
  const branches = inspection?.branches ?? [];
  const branch = draft.branch === "" ? (inspection?.defaultBranch ?? "") : draft.branch;
  const options = branch === "" || branches.includes(branch) ? branches : [branch, ...branches];
  return (
    <div className="grid grid-cols-[1fr_150px] gap-12 mt-16">
      <div>
        <div className={`${CAP} text-9h mb-8`}>{t("project.nameCap")}</div>
        <input
          value={draft.name}
          placeholder={inspection?.name ?? t("project.nameHint")}
          onChange={(e) => {
            setDraft({ ...draft, name: e.target.value });
          }}
          className={`${INPUT} placeholder:text-ink-ghost`}
        />
      </div>
      <SelectField
        label={t("project.branchCap")}
        mono
        muted={branch === ""}
        options={options.length === 0 ? ["—"] : options}
        value={branch === "" ? "—" : branch}
        onPick={(next) => {
          setDraft({ ...draft, branch: next });
        }}
      />
    </div>
  );
}

export function FloorPreview({
  number,
  name,
  meta,
}: {
  number: number;
  name: string | null;
  meta: string;
}): React.JSX.Element {
  const { t } = useTranslation();
  const named = name !== null;
  return (
    <div
      className={`${ROW} border ${named ? "border-accent-a28" : "border-border"} ${named ? "bg-accent-a05" : "bg-panel"}`}
    >
      <span
        className={`${BADGE} ${named ? "bg-accent" : "bg-tile"} ${named ? "text-accent-ink" : "text-ink-ghost"}`}
      >
        <span>{number}</span>
      </span>
      <div className="flex-1 min-w-0">
        <div
          className={`${MONO} text-12 ${named ? "text-accent-soft" : "text-ink-ghost"} ${ELLIPSIS}`}
        >
          {name ?? t("project.previewUnnamed")}
        </div>
        <div className={`text-11 text-ink-meta mt-4 ${ELLIPSIS}`}>{meta}</div>
      </div>
    </div>
  );
}
