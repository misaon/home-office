import { scorecard } from "../evals.ts";
import { usageSummary } from "../usage.ts";
import { guarded } from "./guarded.ts";
import { os } from "./implement.ts";

const base = os.use(guarded);

export const usageRoutes = {
  summary: base.usage.summary.handler(({ input, context }) =>
    usageSummary(context.office.model, context.office.clock.now().getTime(), input.sinceHours),
  ),
  plan: base.usage.plan.handler(({ context }) => context.planUsage()),
};

export const evalRoutes = {
  scorecard: base.evals.scorecard.handler(({ input, context }) =>
    scorecard(context.office.model, context.office.clock.now().getTime(), input),
  ),
};
