import { guarded } from "./guarded.ts";
import { os } from "./implement.ts";

const base = os.use(guarded);

export const remoteRoutes = {
  status: base.remote.status.handler(({ context }) => context.remote.status()),
  configure: base.remote.configure.handler(({ input, context }) => context.remote.configure(input)),
  pair: base.remote.pair.handler(({ input, context }) => context.remote.pair(input.name)),
  revoke: base.remote.revoke.handler(({ input, context }) => context.remote.revoke(input.deviceId)),
};
