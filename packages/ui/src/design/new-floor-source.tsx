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
    <div className="flex items-center gap-8 mb-8">
      <span className={`${CAP} text-9h`}>{label}</span>
      <span className="flex-1" />
      <span className="text-11 text-ink-meta">{hint}</span>
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
    <div className="animate-fade-240">
      <FieldCap label={t("project.folderCap")} hint={hint} />
      <div className="flex gap-8">
        <div className={`${FIELD_ROW} border ${border}`}>
          <svg
            className="flex-[0_0_auto] stroke-ink-ghost"
            width="13"
            height="13"
            viewBox="0 0 16 16"
            fill="none"
            strokeWidth="1.5"
            strokeLinejoin="round"
          >
            <path d="M2 4.6a1 1 0 0 1 1-1h3l1.4 1.6H13a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" />
          </svg>
          <input
            value={draft.path}
            placeholder="/Users/you/projects/app"
            onChange={(e) => {
              const { value } = e.target;
              setDraft(
                repoSourceOf(value).kind === "git"
                  ? { ...draft, kind: "git", url: value, path: "", branch: "" }
                  : { ...draft, path: value, branch: "" },
              );
            }}
            className={`${BARE} placeholder:text-ink-ghost`}
          />
        </div>
        <button
          type="button"
          disabled={browsing}
          onClick={onBrowse}
          className={`hover:text-accent-soft hover:border-accent-a45 ${BROWSE}`}
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
    <div className="animate-fade-240">
      <FieldCap label={t("project.urlCap")} hint={hint} />
      <div className={`${FIELD_ROW} border ${border}`}>
        <svg
          className="flex-[0_0_auto] stroke-ink-ghost"
          width="13"
          height="13"
          viewBox="0 0 16 16"
          fill="none"
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
          className={`${BARE} placeholder:text-ink-ghost`}
        />
      </div>
    </div>
  );
}

/** Where the code lives: the two cards, and the one field the chosen card asks for. */
const FIELD_ROW =
  "flex-1 min-w-0 flex items-center gap-9 py-0 px-13 rounded-12 bg-card transition-[border-color] duration-220";

const BARE = `flex-1 min-w-0 py-12 px-0 border-0 bg-transparent ${MONO} text-12`;

const BROWSE =
  "py-0 px-15 flex-[0_0_auto] rounded-12 border border-border-strong bg-raised text-ink-quiet text-12h cursor-pointer whitespace-nowrap transition-all duration-200";

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
  const border = typed === "" ? "border-border-strong" : "border-accent-a40";
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
      <div className={`${CAP} text-9h mb-10`}>{t("project.whereCode")}</div>
      <div className="grid grid-cols-2 gap-10 mb-20">
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
