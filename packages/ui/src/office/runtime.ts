import { Bridge } from "./bridge.ts";
import { SpriteLibrary } from "./sprites.ts";

/** One simulation and one sprite library per page; React components and the sync loop share them. */
export const bridge = new Bridge();
export const sprites = new SpriteLibrary();
