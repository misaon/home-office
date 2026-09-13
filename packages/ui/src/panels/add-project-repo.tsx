import {
  type AgentId,
  compact,
  errorMessage,
  type RepoInspection,
  RepoSource,
  repoSourceOf,
  repoUrl,
  REPO_URL_FORMS,
} from "@ho/protocol";
import { skipToken, useMutation, useQuery } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CONTROL, Field, FolderIcon, Segmented } from "../kit/controls.tsx";
import { requireClient } from "../rpc.ts";
import { useOnline } from "../store.ts";

const INSPECT_DEBOUNCE_MS = 600;

export type Source = "local" | "git";
export type RepoDraft = {
  kind: Source;
  path: string;
  url: string;
  name: string;
  branch: string;
  imports: Set<AgentId>;
};

const SOURCES = [
  { value: "local", label: "project.sourceLocal" },
  { value: "git", label: "project.sourceGit" },
] as const satisfies readonly { value: Source; label: string }[];

/** What the user typed for the source that is currently selected. */
export const typedIn = (draft: RepoDraft): string =>
  (draft.kind === "local" ? draft.path : draft.url).trim();

/** What the daemon would be asked about, or null while the field is empty or not yet a repository URL. */
const repoFrom = (kind: Source, text: string): RepoSource | null => {
  if (text === "") {
    return null;
  }
  const parsed = RepoSource.safeParse(
    kind === "local" ? { kind: "local", path: text } : { kind: "git", url: repoUrl(text) },
  );
  return parsed.success ? parsed.data : null;
};

/** The value once it has stopped changing for `ms`. */
function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSettled(value);
    }, ms);
    return () => {
      clearTimeout(timer);
    };
  }, [value, ms]);
  return settled;
}

export type Found = Extract<RepoInspection, { ok: true }>;
export type Inspecting = { result: RepoInspection | null; busy: boolean };

/** Asks the daemon about the typed repository once the typing pauses. */
export function useRepoInspection(kind: Source, text: string): Inspecting {
  const online = useOnline();
  const settled = useDebounced(text, INSPECT_DEBOUNCE_MS);
  const repo = repoFrom(kind, settled);
  const query = useQuery({
    queryKey: ["inspect", repo],
    queryFn:
      repo === null || !online
        ? skipToken
        : ({ signal }) => requireClient().projects.inspect({ repo }, { signal }),
  });
  if (repoFrom(kind, text) === null) {
    return { result: null, busy: false };
  }
  if (settled !== text || query.isFetching) {
    return { result: null, busy: true };
  }
  if (query.error !== null) {
    return { result: { ok: false, message: errorMessage(query.error) }, busy: false };
  }
  return { result: query.data ?? null, busy: false };
}

type Hint = { text: string; tone: "muted" | "error" };
const hintFor = (kind: Source, text: string, { result, busy }: Inspecting, t: TFunction): Hint => {
  if (text === "") {
    return {
      text:
        kind === "local"
          ? t("project.folderHint")
          : t("project.urlHint", { forms: REPO_URL_FORMS }),
      tone: "muted",
    };
  }
  if (repoFrom(kind, text) === null) {
    return { text: t("project.urlInvalid", { forms: REPO_URL_FORMS }), tone: "error" };
  }
  if (busy) {
    return { text: t("project.checkingGit"), tone: "muted" };
  }
  if (result === null) {
    return { text: " ", tone: "muted" };
  }
  return result.ok
    ? {
        text: t("project.gitRepo", { count: result.branches.length }),
        tone: "muted",
      }
    : { text: result.message, tone: "error" };
};

/**
 * A daemon older than the UI bundle it serves has no `system.pickDirectory`, and oRPC answers a bare
 * "Not Found" that explains nothing. Checked structurally, not with `instanceof`: the error crosses a
 * WebSocket and its class need not be the one this bundle imported.
 */
const isOldDaemon = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && error.code === "NOT_FOUND";
const pickFailure = (error: unknown, t: TFunction): string =>
  isOldDaemon(error) ? t("project.oldDaemon") : errorMessage(error);

type FieldProps = { draft: RepoDraft; setDraft: (draft: RepoDraft) => void; hint: Hint };

/** The local path, with the host's own directory dialog behind the folder button. */
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
    <Field
      id="ho-repo-path"
      label={t("project.folder")}
      hint={unavailable ?? hint.text}
      tone={unavailable === null ? hint.tone : "error"}
    >
      <div className="flex gap-2">
        <input
          id="ho-repo-path"
          className={`${CONTROL} font-mono`}
          placeholder="/Users/you/projects/app"
          value={draft.path}
          onChange={(e) => {
            typed(e.target.value);
          }}
        />
        <button
          type="button"
          className="shrink-0 rounded-md border border-line bg-ink px-3 text-gray-400 transition hover:border-accent/60 hover:text-white disabled:opacity-40"
          title={t("project.chooseFolder")}
          disabled={pick.isPending}
          onClick={() => {
            pick.mutate();
          }}
        >
          <FolderIcon />
        </button>
      </div>
    </Field>
  );
}

function UrlField({ draft, setDraft, hint }: FieldProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Field id="ho-repo-url" label={t("project.url")} hint={hint.text} tone={hint.tone}>
      <input
        id="ho-repo-url"
        className={`${CONTROL} font-mono`}
        placeholder="git@github.com:org/repo.git"
        value={draft.url}
        onChange={(e) => {
          setDraft({ ...draft, url: e.target.value, branch: "" });
        }}
      />
    </Field>
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
      <Segmented
        value={draft.kind}
        options={SOURCES.map(({ value, label }) => ({ value, label: t(label) }))}
        onChange={(kind) => {
          setDraft({ ...draft, kind, branch: "" });
        }}
      />
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
    <div className="grid grid-cols-2 gap-5">
      <Field id="ho-floor-name" label={t("project.name")}>
        <input
          id="ho-floor-name"
          className={CONTROL}
          placeholder={inspection?.name ?? t("project.nameHint")}
          value={draft.name}
          onChange={(e) => {
            setDraft({ ...draft, name: e.target.value });
          }}
        />
      </Field>
      <Field
        id="ho-default-branch"
        label={t("project.branch")}
        hint={options.length === 0 ? t("project.branchHint") : undefined}
      >
        <select
          id="ho-default-branch"
          className={`${CONTROL} font-mono`}
          disabled={options.length === 0}
          value={branch}
          onChange={(e) => {
            setDraft({ ...draft, branch: e.target.value });
          }}
        >
          {options.length === 0 ? <option value="">—</option> : null}
          {options.map((candidate) => (
            <option key={candidate} value={candidate}>
              {candidate}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}
