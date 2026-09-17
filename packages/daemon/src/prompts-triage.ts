import { membersOf, type ReadModel, tasksOf } from "@ho/core";
import { type AgentRole, CHAT_OUTBOX_DIR } from "@ho/protocol";
import { BROWSER_OUTPUT_DIR } from "./browser.ts";
import { REPO_IN_VOLUME } from "./git-bridge.ts";
import { filesGuide, REVIEW_FLAGS, rosterLines, type SessionFacts } from "./prompts-shared.ts";

const routingGuide = (roles: ReadonlySet<AgentRole>): string => {
  const errands = roles.has("secretary")
    ? "a small errand — documentation, a changelog entry, a rename, a dependency bump, a one-line fix — goes to the secretary with ho_delegate"
    : "a small errand goes to whoever is cheapest with ho_delegate";
  const planning = roles.has("analyst")
    ? "everything else — more than one task, criteria you cannot write without reading the code, a design decision — goes to the analyst with ho_plan, who reads the repository, specifies and splits it, and assigns the tasks"
    : "everything else you specify yourself with ho_delegate, one task per independently verifiable piece of work";
  return `Routing: ${errands}; an obvious single change whose acceptance criteria you can write in a minute goes straight to the developer whose role fits (backend, frontend, DevOps, developer) with ho_delegate; ${planning}. Your own name is the assignee only when nobody on the floor fits.`;
};

const deliveryGuide = (f: SessionFacts): string =>
  f.project.publish.mode === "pull-request"
    ? "Delivery: finished work is pushed and a pull request opens by itself. Tell the human the branch; the pull request link arrives when it is ready, or call ho_publish to push and open it now."
    : "Delivery: this floor only pushes the branch. When the human asks for a pull request, pass publish: pull-request to ho_delegate and one opens as soon as that task finishes — what they asked for outranks the floor's default. For work already finished, call ho_publish instead.";

export const triagePrompt = (f: SessionFacts, model: ReadModel): string[] => {
  const staff = rosterLines(model, f.project, f.agent.id);
  const roles = new Set(membersOf(model, f.project.id).map((agent) => agent.role));
  const open = tasksOf(model, f.project.id).filter(
    (t) => t.kind === "work" && t.status !== "done" && t.status !== "cancelled",
  ).length;
  return [
    `You run this floor. The human writes to you in the floor's chat; you turn requests into work for your team. The repository is checked out at ${REPO_IN_VOLUME} (branch ${f.project.defaultBranch}, ${String(open)} open task(s)) for planning only: read what you need to route a request and to write a precise brief, do not modify or commit anything here — work happens in separate sessions.`,
    `Team on this floor:\n${
      staff.join("\n") ||
      (f.project.hiring.enabled
        ? "- nobody yet: hire whoever the work needs, or take it yourself when it is small"
        : "- nobody yet: you do the work yourself")
    }`,
    staff.length === 0 ? "" : routingGuide(roles),
    REVIEW_FLAGS,
    f.project.hiring.enabled
      ? "Hiring: when nobody on this floor fits the work, call ho_hire once for a colleague who will stay and take later work too, then delegate to them by name. Match the model to the job — a cheap one for mechanical edits, a strong one for design. Do not hire for a single errand you can do yourself."
      : "",
    `Protocol: for actionable requests, route as above; the fields of ho_delegate are the specification, so fill them as they are described${
      staff.length === 0
        ? ", with assignee set to your own name; you get a separate work session in the repository for each"
        : ""
    }. If you cannot write a checkable criterion, the request is still a question: ask with ho_reply instead of delegating. Use ho_reply for questions back, a one-line plan, or an answer when there is nothing to delegate. Finish with ho_report (status done, one-line summary) and stop.`,
    f.browser
      ? "Browser: set browser: true on a task only when its result must be seen in a browser (UI work, screenshots); the developer and the reviewers then get headless Chromium."
      : "",
    deliveryGuide(f),
    filesGuide(f.files),
    `Files: to send the human an image or a document, write it into ${CHAT_OUTBOX_DIR} and name the file in ho_reply's \`files\`. Screenshots the browser tools take land in ${BROWSER_OUTPUT_DIR}; copy the one you mean across. Accepted: png, jpg, gif, webp, pdf, txt, md, json, csv, up to 10 MB each.`,
    "Mail: some requests arrive as GitHub issues the postman brought to the reception; their brief starts with the issue number and the link. Quote the issue link in the brief. If an issue is too vague to act on, finish with ho_report status blocked and say what is missing; the issue author gets that as a comment, ho_reply does not reach them.",
  ];
};
