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
import { useMutation } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useState } from "react";
import { CONTROL, Field, FolderIcon, Segmented } from "../kit/controls.tsx";
import { getClient, requireClient } from "../rpc.ts";

const INSPECT_DEBOUNCE_MS = 600;

export type Source = "local" | "git";
export type Draft = {
  kind: Source;
  path: string;
  url: string;
  name: string;
  branch: string;
  imports: Set<AgentId>;
};

const SOURCES = [
  { value: "local", label: "Folder on this machine" },
  { value: "git", label: "Git URL" },
] as const satisfies readonly { value: Source; label: string }[];

/** What the user typed for the source that is currently selected. */
export const typedIn = (draft: Draft): string =>
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

type Found = Extract<RepoInspection, { ok: true }>;
export type Inspecting = { result: RepoInspection | null; busy: boolean };

/** Asks the daemon about the typed repository once the typing pauses; `onFound` fills in name and branch. */
export function useRepoInspection(
  kind: Source,
  text: string,
  onFound: (result: Found) => void,
): Inspecting {
  const [state, setState] = useState<Inspecting & { key: string }>({
    key: "",
    result: null,
    busy: false,
  });
  const found = useEffectEvent(onFound);
  const key = `${kind}:${text}`;
  useEffect(() => {
    const repo = repoFrom(kind, text);
    if (repo === null) {
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      const client = getClient();
      if (client === null) {
        return;
      }
      setState({ key, result: null, busy: true });
      client.projects.inspect({ repo }).then(
        (result) => {
          if (!cancelled) {
            setState({ key, result, busy: false });
            if (result.ok) {
              found(result);
            }
          }
        },
        (e: unknown) => {
          if (!cancelled) {
            setState({ key, result: { ok: false, message: errorMessage(e) }, busy: false });
          }
        },
      );
    }, INSPECT_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [kind, text, key]);
  return state.key === key ? state : { result: null, busy: repoFrom(kind, text) !== null };
}

type Hint = { text: string; tone: "muted" | "error" };

const hintFor = (kind: Source, text: string, { result, busy }: Inspecting): Hint => {
  if (text === "") {
    return {
      text:
        kind === "local"
          ? "The repository itself or any folder inside it."
          : `Supported: ${REPO_URL_FORMS}`,
      tone: "muted",
    };
  }
  if (repoFrom(kind, text) === null) {
    return { text: `Not a repository URL — use ${REPO_URL_FORMS}`, tone: "error" };
  }
  if (busy) {
    return { text: "checking with git…", tone: "muted" };
  }
  if (result === null) {
    return { text: " ", tone: "muted" };
  }
  return result.ok
    ? {
        text: `git repository · ${String(result.branches.length)} branch${result.branches.length === 1 ? "" : "es"}`,
        tone: "muted",
      }
    : { text: result.message, tone: "error" };
};

/**
 * A daemon older than the UI bundle it serves has no `system.pickDirectory`, and oRPC answers a bare
 * "Not Found" that explains nothing. Checked structurally, not with `instanceof`: the error crosses a
 * WebSocket and its class need not be the one this bundle imported.
 */
const pickFailure = (error: unknown): string =>
  typeof error === "object" && error !== null && "code" in error && error.code === "NOT_FOUND"
    ? "This daemon is older than the office and cannot open a folder dialog — restart it, reload, or type the path."
    : errorMessage(error);

type FieldProps = { draft: Draft; setDraft: (draft: Draft) => void; hint: Hint };

/** The local path, with the host's own directory dialog behind the folder button. */
function PathField({ draft, setDraft, hint }: FieldProps): React.JSX.Element {
  const pick = useMutation({
    mutationFn: () =>
      requireClient().system.pickDirectory(
        compact({ startIn: draft.path.trim() === "" ? undefined : draft.path.trim() }),
      ),
    onSuccess: (picked) => {
      if (picked.status === "picked") {
        setDraft({ ...draft, kind: "local", path: picked.path, name: "", branch: "" });
      }
    },
  });
  const unavailable =
    pick.error !== null
      ? pickFailure(pick.error)
      : pick.data?.status === "unavailable"
        ? pick.data.message
        : null;
  // A URL pasted into the path field belongs to the other tab; the switch follows the paste.
  const typed = (value: string): void => {
    setDraft(
      repoSourceOf(value).kind === "git"
        ? { ...draft, kind: "git", url: value, path: "", name: "", branch: "" }
        : { ...draft, path: value, name: "", branch: "" },
    );
  };
  return (
    <Field
      id="ho-repo-path"
      label="Repository folder"
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
          title="Choose a folder…"
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
  return (
    <Field id="ho-repo-url" label="Git repository URL" hint={hint.text} tone={hint.tone}>
      <input
        id="ho-repo-url"
        className={`${CONTROL} font-mono`}
        placeholder="git@github.com:org/repo.git"
        value={draft.url}
        onChange={(e) => {
          setDraft({ ...draft, url: e.target.value, name: "", branch: "" });
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
  draft: Draft;
  setDraft: (draft: Draft) => void;
  inspecting: Inspecting;
}): React.JSX.Element {
  const hint = hintFor(draft.kind, typedIn(draft), inspecting);
  return (
    <>
      <Segmented
        value={draft.kind}
        options={SOURCES}
        onChange={(kind) => {
          setDraft({ ...draft, kind, name: "", branch: "" });
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

/** Floor name and the default branch, which is a choice among the branches git reported. */
export function Details({
  draft,
  setDraft,
  branches,
}: {
  draft: Draft;
  setDraft: (draft: Draft) => void;
  branches: readonly string[];
}): React.JSX.Element {
  const options =
    draft.branch === "" || branches.includes(draft.branch) ? branches : [draft.branch, ...branches];
  return (
    <div className="grid grid-cols-2 gap-5">
      <Field id="ho-floor-name" label="Floor name">
        <input
          id="ho-floor-name"
          className={CONTROL}
          placeholder="taken from the repository"
          value={draft.name}
          onChange={(e) => {
            setDraft({ ...draft, name: e.target.value });
          }}
        />
      </Field>
      <Field
        id="ho-default-branch"
        label="Default branch"
        hint={options.length === 0 ? "filled in once git answers" : undefined}
      >
        <select
          id="ho-default-branch"
          className={`${CONTROL} font-mono`}
          disabled={options.length === 0}
          value={draft.branch}
          onChange={(e) => {
            setDraft({ ...draft, branch: e.target.value });
          }}
        >
          {options.length === 0 ? <option value="">—</option> : null}
          {options.map((branch) => (
            <option key={branch} value={branch}>
              {branch}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}
