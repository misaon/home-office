import type { AgentId } from "@ho/protocol";
import type { Actor, World } from "@ho/sim";

type Point = { x: number; y: number };

const TELEPORT_TILES = 2;

export class Interpolation {
  readonly #previous = new Map<AgentId, Point>();

  remember(world: World): void {
    for (const actor of world.actors.values()) {
      const slot = this.#previous.get(actor.id);
      if (slot === undefined) {
        this.#previous.set(actor.id, { x: actor.pos.x, y: actor.pos.y });
      } else {
        slot.x = actor.pos.x;
        slot.y = actor.pos.y;
      }
    }
    for (const id of this.#previous.keys()) {
      if (!world.actors.has(id)) {
        this.#previous.delete(id);
      }
    }
  }

  positionOf(actor: Actor, alpha: number): Point {
    const previous = this.#previous.get(actor.id);
    if (previous === undefined || actor.hidden) {
      return actor.pos;
    }
    const dx = actor.pos.x - previous.x;
    const dy = actor.pos.y - previous.y;
    if (Math.abs(dx) > TELEPORT_TILES || Math.abs(dy) > TELEPORT_TILES) {
      return actor.pos;
    }
    return { x: previous.x + dx * alpha, y: previous.y + dy * alpha };
  }
}
