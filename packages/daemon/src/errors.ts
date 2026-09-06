import type { DomainError } from "@ho/core";

const describe = (error: DomainError): string => {
  if (error.code === "not_found") {
    return `${error.entity} ${error.id} not found`;
  }
  if (error.code === "conflict") {
    return error.reason;
  }
  return `cannot move task from ${error.from} to ${error.to}`;
};

/** Thrown by the office when a command is rejected; the RPC layer maps it to typed errors. */
export class DomainFailure extends Error {
  readonly error: DomainError;

  constructor(error: DomainError) {
    super(describe(error));
    this.name = "DomainFailure";
    this.error = error;
  }
}
