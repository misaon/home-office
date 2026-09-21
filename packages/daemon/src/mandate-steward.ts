import {
  type Assessment,
  assessMandate,
  mandatesOf,
  openDecision,
  openFixTask,
  openMandateRound,
  openVerification,
  stateAcceptance,
  tasksOfMandate,
  verifierFor,
} from "@ho/core";
import {
  clip,
  CRITERION_MAX,
  errorMessage,
  isMandateOpen,
  type Mandate,
  type MandateId,
  type Project,
  type StoredEvent,
  SYSTEM_ACTOR,
} from "@ho/protocol";
import { baselineWorthRunning } from "./baseline.ts";
import {
  fulfil,
  integrate,
  recordBaselineFor,
  setMandateStatus,
  type StewardDeps,
} from "./mandate-actions.ts";
import { decisionBrief, failureReason } from "./mandate-report.ts";
import { followEvents, type Office } from "./office.ts";

const FOLLOWED: readonly StoredEvent["type"][] = [
  "task.created",
  "task.status_changed",
  "task.review_waived",
  "mandate.opened",
  "mandate.acceptance_stated",
  "mandate.evidence_recorded",
  "mandate.artifacts_changed",
  "mandate.round_opened",
];

const REQUEST_LEAD = "The request holds as the human wrote it: ";

const mandateIdOf = (office: Office, event: StoredEvent): MandateId | undefined => {
  if (event.type === "mandate.opened") {
    return event.payload.mandate.id;
  }
  if (
    event.type === "mandate.acceptance_stated" ||
    event.type === "mandate.evidence_recorded" ||
    event.type === "mandate.artifacts_changed" ||
    event.type === "mandate.round_opened"
  ) {
    return event.payload.mandateId;
  }
  if (event.type === "task.created") {
    return event.payload.task.mandateId;
  }
  if (event.type === "task.status_changed" || event.type === "task.review_waived") {
    return office.model.tasks.get(event.payload.taskId)?.mandateId;
  }
  return undefined;
};

type Failed = Extract<Assessment, { kind: "failed" }>;

const soleTaskFailure = (assessment: Failed): Failed["taskCriteria"][number] | undefined =>
  assessment.criteria.length === 0 && !assessment.checks && assessment.taskCriteria.length === 1
    ? assessment.taskCriteria[0]
    : undefined;

export class MandateSteward {
  readonly #deps: StewardDeps;
  readonly #chains = new Map<MandateId, Promise<void>>();
  readonly #baselines = new Map<MandateId, Promise<void>>();
  #following: { stop: () => Promise<void> } | null = null;

  constructor(deps: StewardDeps) {
    this.#deps = deps;
  }

  start(): void {
    const { office, log } = this.#deps;
    this.#following = followEvents(
      office,
      FOLLOWED,
      (event) => {
        const mandateId = mandateIdOf(office, event);
        if (mandateId !== undefined) {
          this.steer(mandateId);
        }
      },
      log,
      "mandate steward",
    );
    for (const project of office.model.projects.values()) {
      for (const mandate of mandatesOf(office.model, project.id)) {
        if (isMandateOpen(mandate.status)) {
          this.steer(mandate.id);
        }
      }
    }
  }

  async stop(): Promise<void> {
    await this.#following?.stop();
    await Promise.allSettled([...this.#chains.values(), ...this.#baselines.values()]);
  }

  #baseline(mandate: Mandate, project: Project): void {
    if (
      mandate.baseline !== undefined ||
      this.#baselines.has(mandate.id) ||
      !baselineWorthRunning(project)
    ) {
      return;
    }
    const running = recordBaselineFor(this.#deps, mandate, project).finally(() => {
      this.#baselines.delete(mandate.id);
    });
    this.#baselines.set(mandate.id, running);
  }

  steer(mandateId: MandateId): void {
    const previous = this.#chains.get(mandateId) ?? Promise.resolve();
    const next: Promise<void> = previous
      .then(() => this.#act(mandateId))
      .catch((error: unknown) => {
        this.#deps.log.error({ mandateId, err: errorMessage(error) }, "mandate steering failed");
      })
      .finally(() => {
        if (this.#chains.get(mandateId) === next) {
          this.#chains.delete(mandateId);
        }
      });
    this.#chains.set(mandateId, next);
  }

  async #act(mandateId: MandateId): Promise<void> {
    const { office, log } = this.#deps;
    const mandate = office.model.mandates.get(mandateId);
    const project =
      mandate === undefined ? undefined : office.model.projects.get(mandate.projectId);
    if (mandate === undefined || project === undefined || !isMandateOpen(mandate.status)) {
      return;
    }
    this.#baseline(mandate, project);
    const assessment = assessMandate(office.model, mandate, project.acceptance);
    log.debug(
      { mandateId, status: mandate.status, round: mandate.round, assessment: assessment.kind },
      "mandate assessed",
    );
    switch (assessment.kind) {
      case "waiting":
      case "verifying": {
        if (mandate.status === "blocked") {
          await setMandateStatus(this.#deps, mandate, "open", "the work resumed");
        }
        return;
      }
      case "stalled": {
        const names = assessment.tasks.map((task) => `"${task.title}" (${task.status})`).join(", ");
        await setMandateStatus(
          this.#deps,
          mandate,
          "blocked",
          names === "" ? assessment.reason : `${assessment.reason}: ${names}`,
        );
        return;
      }
      case "integrate": {
        const outcome = await integrate(this.#deps, mandate, project, assessment.tasks);
        if (outcome.kind === "conflict") {
          await this.#fixRound(mandate, project, outcome.reason, null);
        } else if (outcome.kind === "failed") {
          await setMandateStatus(this.#deps, mandate, "blocked", outcome.reason);
        }
        return;
      }
      case "verify": {
        await this.#verify(mandate, assessment);
        return;
      }
      case "failed": {
        await this.#fixRound(
          mandate,
          project,
          failureReason(office.model, mandate, assessment),
          assessment,
        );
        return;
      }
      case "fulfilled": {
        await fulfil(this.#deps, mandate, project, assessment.tasks);
      }
    }
  }

  async #verify(
    mandate: Mandate,
    assessment: Extract<Assessment, { kind: "verify" }>,
  ): Promise<void> {
    const { office } = this.#deps;
    if (mandate.acceptance.length === 0) {
      await office.execute(SYSTEM_ACTOR, (m, c) =>
        stateAcceptance(
          m,
          mandate.id,
          [`${REQUEST_LEAD}${clip(mandate.request, CRITERION_MAX - REQUEST_LEAD.length)}`],
          "request",
          c,
        ),
      );
      return;
    }
    const verifier = verifierFor(office.model, mandate);
    if (verifier === undefined) {
      await setMandateStatus(
        this.#deps,
        mandate,
        "blocked",
        "nobody on this floor can verify the request independently of its authors; hire a QA engineer or a head of development",
      );
      return;
    }
    const browser = tasksOfMandate(office.model, mandate).some((task) => task.browser === true);
    await office.execute(SYSTEM_ACTOR, (m, c) =>
      openVerification(
        m,
        mandate.id,
        {
          verifierId: verifier.id,
          browser,
          scope: { criteria: assessment.criteria, taskCriteria: assessment.taskCriteria },
        },
        c,
      ),
    );
  }

  async #fixRound(
    mandate: Mandate,
    project: Project,
    reason: string,
    assessment: Failed | null,
  ): Promise<void> {
    const { office, log } = this.#deps;
    const tasks = tasksOfMandate(office.model, mandate);
    const decisions = tasks.filter(
      (task) => task.kind === "triage" && task.source.kind === "mandate",
    ).length;
    if (mandate.round >= project.acceptance.maxFixRounds) {
      await setMandateStatus(
        this.#deps,
        mandate,
        "blocked",
        `fix rounds exhausted (${String(mandate.round)} of ${String(project.acceptance.maxFixRounds)}); the result still fails:\n${reason}`,
      );
      return;
    }
    if (mandate.round > 0 && decisions >= mandate.round) {
      await setMandateStatus(
        this.#deps,
        mandate,
        "blocked",
        `the boss closed round ${String(mandate.round)} without new work; the result still fails:\n${reason}`,
      );
      return;
    }
    await office.execute(SYSTEM_ACTOR, (m, c) => openMandateRound(m, mandate.id, reason, c));
    const single = assessment === null ? undefined : soleTaskFailure(assessment);
    log.info(
      { mandateId: mandate.id, round: mandate.round + 1, deterministic: single !== undefined },
      "the request enters a fix round",
    );
    if (single !== undefined) {
      await office.execute(SYSTEM_ACTOR, (m, c) =>
        openFixTask(m, mandate.id, { originalId: single.task.id, reason }, c),
      );
      return;
    }
    const work = tasks.filter((task) => task.kind === "work" && task.status === "done");
    const current = office.model.mandates.get(mandate.id) ?? mandate;
    await office.execute(SYSTEM_ACTOR, (m, c) =>
      openDecision(m, mandate.id, { brief: decisionBrief(current, work, reason) }, c),
    );
  }
}
