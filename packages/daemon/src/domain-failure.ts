import { describeDomainError, type DomainError } from "@ho/protocol";

/** Thrown by the office when a command is rejected; the RPC layer maps it to typed errors. */
export class DomainFailureError extends Error {
  readonly error: DomainError;

  constructor(error: DomainError) {
    super(describeDomainError(error));
    this.name = "DomainFailureError";
    this.error = error;
  }
}
