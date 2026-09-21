import { abandonMandate } from "@ho/core";
import { HUMAN_ACTOR, notFound } from "@ho/protocol";
import { DomainFailureError } from "../domain-failure.ts";
import { guarded } from "./guarded.ts";
import { os } from "./implement.ts";

const base = os.use(guarded);

export const mandateRoutes = {
  list: base.mandates.list.handler(({ input, context }) =>
    [...context.office.model.mandates.values()].filter(
      (mandate) =>
        (input.projectId === undefined || mandate.projectId === input.projectId) &&
        (input.status === undefined || input.status.includes(mandate.status)),
    ),
  ),
  get: base.mandates.get.handler(({ input, context }) => {
    const mandate = context.office.model.mandates.get(input.id);
    if (mandate === undefined) {
      throw new DomainFailureError(notFound("mandate", input.id));
    }
    return mandate;
  }),
  abandon: base.mandates.abandon.handler(({ input, context }) =>
    context.office.execute(HUMAN_ACTOR, (m, ctx) => abandonMandate(m, input, ctx)),
  ),
};
