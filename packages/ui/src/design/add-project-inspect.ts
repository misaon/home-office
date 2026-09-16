import {
  type AgentId,
  errorMessage,
  type RepoInspection,
  RepoSource,
  repoUrl,
  REPO_URL_FORMS,
} from "@ho/protocol";
import { skipToken, useQuery } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useEffect, useState } from "react";
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

export const typedIn = (draft: RepoDraft): string =>
  (draft.kind === "local" ? draft.path : draft.url).trim();

const repoFrom = (kind: Source, text: string): RepoSource | null => {
  if (text === "") {
    return null;
  }
  const parsed = RepoSource.safeParse(
    kind === "local" ? { kind: "local", path: text } : { kind: "git", url: repoUrl(text) },
  );
  return parsed.success ? parsed.data : null;
};

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

export type Hint = { text: string; tone: "muted" | "error" };
export const hintFor = (
  kind: Source,
  text: string,
  { result, busy }: Inspecting,
  t: TFunction,
): Hint => {
  if (text === "") {
    return {
      text: kind === "local" ? t("project.folderHint") : t("project.urlHint"),
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

const isOldDaemon = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && error.code === "NOT_FOUND";
export const pickFailure = (error: unknown, t: TFunction): string =>
  isOldDaemon(error) ? t("project.oldDaemon") : errorMessage(error);
