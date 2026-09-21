import { type AgentRole, type ChatLanguage, type EffortLevel, ROLE_TITLE } from "@ho/protocol";

export type ChecksState = "none" | "passed" | "failed" | "not_run";

export type Voice = {
  role: (role: AgentRole) => string;
  effort: (effort: EffortLevel) => string;
  handed: (task: string, to: string, reviewers: readonly string[], pullRequest: boolean) => string;
  handedBy: (
    by: string,
    task: string,
    to: string,
    reviewers: readonly string[],
    pullRequest: boolean,
  ) => string;
  askedToPlan: (to: string, task: string) => string;
  waitsInInbox: (task: string) => string;
  working: (who: string, task: string) => string;
  finished: (
    worker: string | null,
    task: string,
    pullRequest: string | null,
    reviewer: string,
  ) => string;
  changesRequested: (reviewer: string, task: string, worker: string | null) => string;
  approvedNext: (reviewer: string, task: string, next: string) => string;
  taskDone: (task: string) => string;
  taskDoneRemaining: (task: string, remaining: number) => string;
  taskDoneAllDone: (task: string) => string;
  timing: (since: string, sessions: number, spent: string, rounds: number) => string;
  pullRequest: (url: string) => string;
  branch: (branch: string) => string;
  taskBlocked: (task: string, reason: string | undefined) => string;
  taskFailed: (task: string, reason: string | undefined) => string;
  triageNeedsYou: (task: string, reason: string) => string;
  couldNotProcess: (reason: string) => string;
  planFailed: (who: string, task: string, reason: string) => string;
  verifying: (mandate: string, verifier: string | null, conditions: number) => string;
  requestDone: (mandate: string, verified: number, conditions: number) => string;
  outcome: (
    checks: ChecksState,
    approvedBy: readonly string[],
    verifiedBy: readonly string[],
  ) => string;
  mandateBlocked: (mandate: string, reason: string | undefined) => string;
  round: (round: number, mandate: string, reason: string) => string;
  showResult: string;
  somebody: string;
  colleague: string;
};

export const bold = (text: string): string => `**${text}**`;

export const quoteTitle = (title: string): string => `**“${title}”**`;

export const pullRequestLink = (url: string): string => {
  const number = /\/pull\/(?<number>\d+)/u.exec(url)?.groups?.["number"];
  return number === undefined ? `[pull request](${url})` : `pull request [#${number}](${url})`;
};

const joinWith = (names: readonly string[], and: string): string =>
  names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} ${and} ${names.at(-1) ?? ""}`;

const tail = (text: string | undefined): string => (text === undefined ? "" : `: ${text}`);

const pluralEn = (count: number, word: string): string =>
  `${String(count)} ${word}${count === 1 ? "" : "s"}`;

const EN_CHECKS: Readonly<Record<ChecksState, string>> = {
  none: "none configured on this floor",
  passed: "passed",
  failed: "failed",
  not_run: "not run",
};

const EN: Voice = {
  role: (role) => ROLE_TITLE[role],
  effort: (effort) => `${effort} effort`,
  handed: (task, to, reviewers, pullRequest) =>
    `👉 I have handed ${task} to ${to}${
      reviewers.length === 0
        ? ""
        : `; ${joinWith(reviewers, "and")} review${reviewers.length === 1 ? "s" : ""} it`
    }${pullRequest ? ", then a pull request follows" : ""}.`,
  handedBy: (by, task, to, reviewers, pullRequest) =>
    `👉 ${by} handed ${task} to ${to}${
      reviewers.length === 0
        ? ""
        : `; ${joinWith(reviewers, "and")} review${reviewers.length === 1 ? "s" : ""} it`
    }${pullRequest ? ", then a pull request follows" : ""}.`,
  askedToPlan: (to, task) => `🗺️ I have asked ${to} to plan ${task}.`,
  waitsInInbox: (task) => `📥 ${task} waits in the inbox for an assignee.`,
  working: (who, task) => `🔧 ${who} is working on ${task}.`,
  finished: (worker, task, pullRequest, reviewer) =>
    `🔍 ${worker ?? "I"} finished ${task}${pullRequest === null ? "" : ` (${pullRequest})`}; ${reviewer} is reviewing it.`,
  changesRequested: (reviewer, task, worker) =>
    `↩️ ${reviewer} asked for changes on ${task}; it is back with ${worker ?? "me"}.`,
  approvedNext: (reviewer, task, next) =>
    `✅ ${reviewer} approved ${task}; ${next} reviews it next.`,
  taskDone: (task) => `✅ ${task} is done.`,
  taskDoneRemaining: (task, remaining) =>
    `✅ ${task} is done; ${pluralEn(remaining, "task")} of the request remain${remaining === 1 ? "s" : ""}.`,
  taskDoneAllDone: (task) =>
    `✅ ${task} is done; every task of the request is done, so the office now integrates and verifies the whole.`,
  timing: (since, sessions, spent, rounds) =>
    `⏱️ From the request to here: ${bold(since)}; ${pluralEn(sessions, "session")} spent ${spent} on it${rounds === 0 ? "" : ` across ${pluralEn(rounds, "fix round")}`}.`,
  pullRequest: (url) => `🔗 ${pullRequestLink(url)}`,
  branch: (branch) => `🌿 Branch \`${branch}\``,
  taskBlocked: (task, reason) => `🚧 ${task} is blocked${tail(reason)}.`,
  taskFailed: (task, reason) => `❌ ${task} failed${tail(reason)}.`,
  triageNeedsYou: (task, reason) => `🚧 ${task} needs you: ${reason}`,
  couldNotProcess: (reason) => `❌ I could not process your message: ${reason}.`,
  planFailed: (who, task, reason) => `❌ ${who} could not finish planning ${task}: ${reason}.`,
  verifying: (mandate, verifier, conditions) =>
    `🧪 Every task for ${mandate} is done; ${verifier ?? bold("a colleague")} is verifying the whole result against ${pluralEn(conditions, "condition")}.`,
  requestDone: (mandate, verified, conditions) =>
    `✅ Your request ${mandate} is done${
      conditions === 0
        ? ""
        : `: ${String(verified)} of ${pluralEn(conditions, "condition")} verified on the combined result`
    }.`,
  outcome: (checks, approvedBy, verifiedBy) =>
    [
      `🧪 Checks: ${EN_CHECKS[checks]}`,
      approvedBy.length === 0 ? "" : `review approved by ${joinWith(approvedBy, "and")}`,
      verifiedBy.length === 0 ? "" : `whole result verified by ${joinWith(verifiedBy, "and")}`,
    ]
      .filter((part) => part !== "")
      .join(" · "),
  mandateBlocked: (mandate, reason) => `🚧 ${mandate} is blocked${tail(reason)}`,
  round: (round, mandate, reason) =>
    `🔁 Round ${String(round)} for ${mandate}: the combined result failed verification.\n${reason}`,
  showResult: "Have a look at the result:",
  somebody: "somebody",
  colleague: "a colleague",
};

const ROLE_CS: Readonly<Record<AgentRole, string>> = {
  boss: "šéf",
  secretary: "sekretariát",
  analyst: "analytik",
  backend: "backend vývojář",
  frontend: "frontend vývojář",
  devops: "DevOps inženýr",
  qa: "QA inženýr",
  security: "bezpečnostní inženýr",
  head: "vedoucí vývoje",
  developer: "vývojář",
};

const pluralCs = (count: number, one: string, few: string, many: string): string =>
  `${String(count)} ${count === 1 ? one : count >= 2 && count <= 4 ? few : many}`;

const CS_CHECKS: Readonly<Record<ChecksState, string>> = {
  none: "patro žádné nemá nastavené",
  passed: "prošly",
  failed: "selhaly",
  not_run: "neproběhly",
};

const csHandover = (
  head: string,
  to: string,
  reviewers: readonly string[],
  pullRequest: boolean,
): string =>
  `${head} teď dělá ${to}${
    reviewers.length === 0 ? "" : `; review: ${joinWith(reviewers, "a")}`
  }${pullRequest ? "; po ověření následuje pull request" : ""}.`;

const CS: Voice = {
  role: (role) => ROLE_CS[role],
  effort: (effort) => `úsilí ${effort}`,
  handed: (task, to, reviewers, pullRequest) =>
    csHandover(`👉 ${task}`, to, reviewers, pullRequest),
  handedBy: (by, task, to, reviewers, pullRequest) =>
    csHandover(`👉 ${task} (zadává ${by})`, to, reviewers, pullRequest),
  askedToPlan: (to, task) => `🗺️ ${task} plánuje ${to}.`,
  waitsInInbox: (task) => `📥 ${task} čeká ve schránce na přiřazení.`,
  working: (who, task) => `🔧 ${who} pracuje na ${task}.`,
  finished: (worker, task, pullRequest, reviewer) =>
    `🔍 ${task}: ${worker === null ? "mám hotovo" : `${worker} má hotovo`}${pullRequest === null ? "" : ` (${pullRequest})`}; review dělá ${reviewer}.`,
  changesRequested: (reviewer, task, worker) =>
    `↩️ ${reviewer} vrací ${task} k úpravám; ${worker === null ? "pokračuji já" : `pokračuje ${worker}`}.`,
  approvedNext: (reviewer, task, next) =>
    `✅ ${reviewer} schvaluje ${task}; další review dělá ${next}.`,
  taskDone: (task) => `✅ ${task} je hotový.`,
  taskDoneRemaining: (task, remaining) =>
    `✅ ${task} je hotový; z požadavku ${remaining === 1 ? "zbývá" : "zbývají"} ${pluralCs(remaining, "úkol", "úkoly", "úkolů")}.`,
  taskDoneAllDone: (task) =>
    `✅ ${task} je hotový; všechny úkoly požadavku jsou hotové, office teď spojí větve a ověří celek.`,
  timing: (since, sessions, spent, rounds) =>
    `⏱️ Od zadání sem: ${bold(since)} · čas agentů ${spent} · relace: ${String(sessions)}${rounds === 0 ? "" : ` · opravná kola: ${String(rounds)}`}`,
  pullRequest: (url) => `🔗 ${pullRequestLink(url)}`,
  branch: (branch) => `🌿 Větev \`${branch}\``,
  taskBlocked: (task, reason) => `🚧 ${task} je zablokovaný${tail(reason)}.`,
  taskFailed: (task, reason) => `❌ ${task} selhal${tail(reason)}.`,
  triageNeedsYou: (task, reason) => `🚧 ${task} potřebuje vás: ${reason}`,
  couldNotProcess: (reason) => `❌ Vaši zprávu se nepodařilo zpracovat: ${reason}.`,
  planFailed: (who, task, reason) => `❌ Plán ${task} se nepodařilo dokončit (${who}): ${reason}.`,
  verifying: (mandate, verifier, conditions) =>
    `🧪 Všechny úkoly požadavku ${mandate} jsou hotové; ${verifier ?? bold("kolega")} ověřuje celek proti ${conditions === 1 ? "1 podmínce" : `${String(conditions)} podmínkám`}.`,
  requestDone: (mandate, verified, conditions) =>
    `✅ Váš požadavek ${mandate} je hotový${
      conditions === 0
        ? ""
        : `: ${String(verified)} z ${conditions === 1 ? "1 podmínky" : `${String(conditions)} podmínek`} ověřeno na spojeném výsledku`
    }.`,
  outcome: (checks, approvedBy, verifiedBy) =>
    [
      `🧪 Kontroly: ${CS_CHECKS[checks]}`,
      approvedBy.length === 0 ? "" : `review schváleno: ${joinWith(approvedBy, "a")}`,
      verifiedBy.length === 0 ? "" : `celek ověřil tým: ${joinWith(verifiedBy, "a")}`,
    ]
      .filter((part) => part !== "")
      .join(" · "),
  mandateBlocked: (mandate, reason) => `🚧 ${mandate} je zablokovaný${tail(reason)}`,
  round: (round, mandate, reason) =>
    `🔁 Kolo ${String(round)} pro ${mandate}: spojený výsledek neprošel ověřením.\n${reason}`,
  showResult: "Podívejte se na výsledek:",
  somebody: "někdo",
  colleague: "kolega",
};

const VOICES: Readonly<Record<ChatLanguage, Voice>> = { en: EN, cs: CS };

export const voiceFor = (language: ChatLanguage): Voice => VOICES[language];
