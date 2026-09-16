import { describeDomainError, type DomainError } from "@ho/protocol";

export class DomainFailureError extends Error {
  readonly error: DomainError;

  constructor(error: DomainError) {
    super(describeDomainError(error));
    this.name = "DomainFailureError";
    this.error = error;
  }
}
