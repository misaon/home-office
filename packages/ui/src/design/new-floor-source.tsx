import { compact, repoSourceOf } from "@ho/protocol";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { pickFailure, type RepoDraft } from "./add-project-inspect.ts";
import { CAP } from "./dialog-sheet.tsx";
import { SourceCard } from "./new-floor-card.tsx";
import { requireClient } from "../rpc.ts";
import { MONO } from "./tokens.ts";

/** The caption above a field, with what the office can say about it on the right. */
function FieldCap({ label, hint }: { label: string; hint: string }): React.JSX.Element {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
      <span style={CAP}>{label}</span>
      <span style={{ flex: "1" }} />
      <span style={{ fontSize: "11px", color: "#A6A39C" }}>{hint}</span>
    </div>
  );
}

/** A folder on this machine, typed or chosen with the host's own dialog. */
function LocalField({
  draft,
  setDraft,
  hint,
  border,
  browsing,
  onBrowse,
}: {
  draft: RepoDraft;
  setDraft: (draft: RepoDraft) => void;
  hint: string;
  border: string;
  browsing: boolean;
  onBrowse: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div style={{ animation: "fadeIn .24s ease both" }}>
      <FieldCap label={t("project.folderCap")} hint={hint} />
      <div style={{ display: "flex", gap: "8px" }}>
        <div style={{ ...FIELD_ROW, border: `1px solid ${border}` }}>
          <svg
            style={{ flex: "0 0 auto" }}
            width="13"
            height="13"
            viewBox="0 0 16 16"
            fill="none"
            stroke="#8A8780"
            strokeWidth="1.5"
            strokeLinejoin="round"
          >
            <path d="M2 4.6a1 1 0 0 1 1-1h3l1.4 1.6H13a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" />
          </svg>
          <input
            value={draft.path}
            placeholder="/Users/you/projects/app"
            onChange={(e) => {
              const value = e.target.value;
              setDraft(
                repoSourceOf(value).kind === "git"
                  ? { ...draft, kind: "git", url: value, path: "", branch: "" }
                  : { ...draft, path: value, branch: "" },
              );
            }}
            style={BARE}
          />
        </div>
        <button
          type="button"
          disabled={browsing}
          onClick={onBrowse}
          style={BROWSE}
          className="ho-96ee65"
        >
          {t("project.browse")}
        </button>
      </div>
    </div>
  );
}

/** A repository the office clones into the sandbox itself. */
function GitField({
  draft,
  setDraft,
  hint,
  border,
}: {
  draft: RepoDraft;
  setDraft: (draft: RepoDraft) => void;
  hint: string;
  border: string;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div style={{ animation: "fadeIn .24s ease both" }}>
      <FieldCap label={t("project.urlCap")} hint={hint} />
      <div style={{ ...FIELD_ROW, border: `1px solid ${border}` }}>
        <svg
          style={{ flex: "0 0 auto" }}
          width="13"
          height="13"
          viewBox="0 0 16 16"
          fill="none"
          stroke="#8A8780"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <circle cx="8" cy="8" r="6" />
          <path d="M2.4 6.4h11.2M2.4 9.6h11.2M8 2a11 11 0 0 0 0 12A11 11 0 0 0 8 2z" />
        </svg>
        <input
          value={draft.url}
          placeholder="git@github.com:org/repo.git"
          onChange={(e) => {
            setDraft({ ...draft, url: e.target.value, branch: "" });
          }}
          style={BARE}
        />
      </div>
    </div>
  );
}

/** Where the code lives: the two cards, and the one field the chosen card asks for. */
const FIELD_ROW: React.CSSProperties = {
  flex: "1",
  minWidth: "0",
  display: "flex",
  alignItems: "center",
  gap: "9px",
  padding: "0 13px",
  borderRadius: "12px",
  background: "#101013",
  transition: "border-color .22s",
};

const BARE: React.CSSProperties = {
  flex: "1",
  minWidth: "0",
  padding: "12px 0",
  border: "0",
  background: "transparent",
  ...MONO,
  fontSize: "12px",
};

const BROWSE: React.CSSProperties = {
  padding: "0 15px",
  flex: "0 0 auto",
  borderRadius: "12px",
  border: "1px solid #2C2C32",
  background: "#141417",
  color: "#CFCCC6",
  fontSize: "12.5px",
  cursor: "pointer",
  whiteSpace: "nowrap",
  transition: "all .2s",
};

export function FloorSource({
  draft,
  setDraft,
  hint,
  onFail,
}: {
  draft: RepoDraft;
  setDraft: (draft: RepoDraft) => void;
  hint: string;
  onFail: (message: string) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const typed = (draft.kind === "local" ? draft.path : draft.url).trim();
  const border = typed === "" ? "#2C2C32" : "rgba(255,197,49,.4)";
  const pick = useMutation({
    mutationFn: () =>
      requireClient().system.pickDirectory(
        compact({ startIn: draft.path.trim() === "" ? undefined : draft.path.trim() }),
      ),
    onSuccess: (picked) => {
      if (picked.status === "picked") {
        setDraft({ ...draft, kind: "local", path: picked.path, branch: "" });
      } else if (picked.status === "unavailable") {
        onFail(picked.message);
      }
    },
    onError: (error: unknown) => {
      onFail(pickFailure(error, t));
    },
  });

  return (
    <>
      <div style={{ ...CAP, marginBottom: "10px" }}>{t("project.whereCode")}</div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "10px",
          marginBottom: "20px",
        }}
      >
        <SourceCard
          kind="local"
          on={draft.kind === "local"}
          onPick={() => {
            setDraft({ ...draft, kind: "local", branch: "" });
          }}
        />
        <SourceCard
          kind="git"
          on={draft.kind === "git"}
          onPick={() => {
            setDraft({ ...draft, kind: "git", branch: "" });
          }}
        />
      </div>
      {draft.kind === "local" ? (
        <LocalField
          draft={draft}
          setDraft={setDraft}
          hint={hint}
          border={border}
          onBrowse={() => {
            pick.mutate();
          }}
          browsing={pick.isPending}
        />
      ) : (
        <GitField draft={draft} setDraft={setDraft} hint={hint} border={border} />
      )}
    </>
  );
}
