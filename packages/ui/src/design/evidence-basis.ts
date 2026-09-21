import type { TFunction } from "i18next";
import type { CriterionEvidence } from "./data.ts";

const FIDELITY = {
  live: "mandate.fidelityLive",
  substitute: "mandate.fidelitySubstitute",
  static: "mandate.fidelityStatic",
} as const;

const BLOCKER = {
  not_prepared: "mandate.blockerNotPrepared",
  not_attempted: "mandate.blockerNotAttempted",
  attempt_failed: "mandate.blockerAttemptFailed",
} as const;

export const evidenceBasis = (t: TFunction, evidence: CriterionEvidence): string => {
  if (evidence.fidelity === null || evidence.fidelity === "live") {
    return "";
  }
  const blocker = evidence.blocker === null ? "" : `, ${t(BLOCKER[evidence.blocker])}`;
  return `${t(FIDELITY[evidence.fidelity])}${blocker}`;
};
