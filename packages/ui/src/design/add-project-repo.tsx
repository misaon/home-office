import { compact, repoSourceOf } from "@ho/protocol";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Caption, FIELD } from "./controls.tsx";
import { requireClient } from "../rpc.ts";
import {
  hintFor,
  pickFailure,
  SOURCES,
  typedIn,
  type FieldProps,
  type Found,
  type Inspecting,
  type RepoDraft,
} from "./add-project-inspect.ts";

const HINT: Record<"error" | "ok" | "muted", string> = {
  error: "#FFB3B3",
  ok: "#8FE8C4",
  muted: "#A6A39C",
};

/** A field with its caption above and whatever git said about it below. */
function Labelled({
  label,
  hint,
  tone = "muted",
  children,
}: {
  label: string;
  hint?: string | undefined;
  tone?: "error" | "ok" | "muted";
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div>
      <Caption>{label}</Caption>
      {children}
      {hint === undefined || hint === "" ? null : (
        <div style={{ fontSize: "11px", color: HINT[tone], marginTop: "6px", lineHeight: "1.5" }}>
          {hint}
        </div>
      )}
    </div>
  );
}

function PathField({ draft, setDraft, hint }: FieldProps): React.JSX.Element {
  const { t } = useTranslation();
  const pick = useMutation({
    mutationFn: () =>
      requireClient().system.pickDirectory(
        compact({ startIn: draft.path.trim() === "" ? undefined : draft.path.trim() }),
      ),
    onSuccess: (picked) => {
      if (picked.status === "picked") {
        setDraft({ ...draft, kind: "local", path: picked.path, branch: "" });
      }
    },
  });
  const unavailable =
    pick.error !== null
      ? pickFailure(pick.error, t)
      : pick.data?.status === "unavailable"
        ? pick.data.message
        : null;
  // A URL pasted into the path field belongs to the other tab; the switch follows the paste.
  const typed = (value: string): void => {
    setDraft(
      repoSourceOf(value).kind === "git"
        ? { ...draft, kind: "git", url: value, path: "", branch: "" }
        : { ...draft, path: value, branch: "" },
    );
  };
  return (
    <Labelled
      label={t("project.folder")}
      hint={unavailable ?? hint.text}
      tone={unavailable === null ? hint.tone : "error"}
    >
      <div style={{ display: "flex", gap: "8px" }}>
        <input
          placeholder="/Users/you/projects/app"
          value={draft.path}
          onChange={(e) => {
            typed(e.target.value);
          }}
          style={{ ...FIELD, flex: "1", minWidth: "0", fontFamily: "'JetBrains Mono',monospace" }}
        />
        <button
          type="button"
          title={t("project.chooseFolder")}
          aria-label={t("project.chooseFolder")}
          disabled={pick.isPending}
          onClick={() => {
            pick.mutate();
          }}
          style={{
            flex: "0 0 auto",
            display: "grid",
            placeItems: "center",
            padding: "0 12px",
            borderRadius: "10px",
            border: "1px solid #2C2C32",
            background: "transparent",
            color: "#CFCCC6",
            cursor: "pointer",
            transition: "all .2s",
          }}
          className="hop3"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          >
            <path d="M2 4.2a1 1 0 0 1 1-1h3l1.4 1.6H13a1 1 0 0 1 1 1v6.4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" />
          </svg>
        </button>
      </div>
    </Labelled>
  );
}

function UrlField({ draft, setDraft, hint }: FieldProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Labelled label={t("project.url")} hint={hint.text} tone={hint.tone}>
      <input
        placeholder="git@github.com:org/repo.git"
        value={draft.url}
        onChange={(e) => {
          setDraft({ ...draft, url: e.target.value, branch: "" });
        }}
        style={{ ...FIELD, fontFamily: "'JetBrains Mono',monospace" }}
      />
    </Labelled>
  );
}

/** Where the floor's repository comes from: a folder on this machine, chosen or typed, or a git URL. */
export function RepoFields({
  draft,
  setDraft,
  inspecting,
}: {
  draft: RepoDraft;
  setDraft: (draft: RepoDraft) => void;
  inspecting: Inspecting;
}): React.JSX.Element {
  const { t } = useTranslation();
  const hint = hintFor(draft.kind, typedIn(draft), inspecting, t);
  return (
    <>
      <div
        style={{
          display: "flex",
          gap: "4px",
          padding: "3px",
          borderRadius: "11px",
          background: "#101013",
          border: "1px solid #26262C",
        }}
      >
        {SOURCES.map(({ value, label }) => (
          <button
            type="button"
            key={value}
            onClick={() => {
              setDraft({ ...draft, kind: value, branch: "" });
            }}
            style={{
              flex: "1",
              padding: "8px 0",
              borderRadius: "8px",
              border: "0",
              cursor: "pointer",
              fontSize: "12px",
              transition: "all .25s",
              background: draft.kind === value ? "rgba(255,197,49,.16)" : "transparent",
              color: draft.kind === value ? "#FFD666" : "#ABA8A1",
            }}
          >
            {t(label)}
          </button>
        ))}
      </div>
      {draft.kind === "local" ? (
        <PathField draft={draft} setDraft={setDraft} hint={hint} />
      ) : (
        <UrlField draft={draft} setDraft={setDraft} hint={hint} />
      )}
    </>
  );
}

/** Floor name and the default branch; what git reported stands in until the user decides otherwise. */
export function Details({
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
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
      <Labelled label={t("project.name")}>
        <input
          placeholder={inspection?.name ?? t("project.nameHint")}
          value={draft.name}
          onChange={(e) => {
            setDraft({ ...draft, name: e.target.value });
          }}
          style={FIELD}
        />
      </Labelled>
      <Labelled
        label={t("project.branch")}
        hint={options.length === 0 ? t("project.branchHint") : undefined}
      >
        <select
          value={branch}
          onChange={(e) => {
            setDraft({ ...draft, branch: e.target.value });
          }}
          style={{ ...FIELD, fontFamily: "'JetBrains Mono',monospace", cursor: "pointer" }}
        >
          {options.length === 0 ? <option value="">—</option> : null}
          {options.map((candidate) => (
            <option key={candidate} value={candidate}>
              {candidate}
            </option>
          ))}
        </select>
      </Labelled>
    </div>
  );
}
