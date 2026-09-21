import type { EvidenceBlocker, EvidenceFidelity } from "@ho/protocol";

type Judged = {
  index: number;
  fidelity: EvidenceFidelity;
  blocker?: EvidenceBlocker | undefined;
  files: readonly string[];
  verdict?: string | undefined;
};

export const checkFidelity = (
  label: string,
  judgements: readonly Judged[],
  applicationReady: boolean,
  approving: boolean,
): void => {
  for (const judgement of judgements) {
    if (judgement.fidelity === "live") {
      continue;
    }
    const number = String(judgement.index);
    if (judgement.blocker === undefined) {
      throw new Error(
        `${label} ${number}: fidelity ${judgement.fidelity} needs a blocker (not_prepared, not_attempted or attempt_failed) saying why the running application was not used`,
      );
    }
    const passes = judgement.verdict === undefined || judgement.verdict === "pass";
    if (applicationReady && approving && passes) {
      throw new Error(
        `${label} ${number} was judged ${judgement.fidelity} while the office started the application and it answers; exercise it on the running application, or judge it fail or not_checked with the reason`,
      );
    }
  }
};

export const checkNamedFiles = (
  label: string,
  judgements: readonly Judged[],
  allowed: readonly string[],
): void => {
  for (const judgement of judgements) {
    for (const name of judgement.files) {
      if (!allowed.includes(name)) {
        throw new Error(
          `${label} ${String(judgement.index)} names ${name}, which is not in this call's files`,
        );
      }
    }
  }
};
