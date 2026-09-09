import { Bridge } from "./bridge.ts";

/** One simulation per page; React components and the sync loop share it. */
export const bridge = new Bridge();
