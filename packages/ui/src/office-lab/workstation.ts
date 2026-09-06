import type { Actor, PlanObject } from "@ho/sim";
import { Container, Sprite, type Texture } from "pixi.js";
import type { SpriteLibrary } from "../office/sprites.ts";

type WorkstationPair = { desk: Sprite; chair: Sprite; id: string };

/** Reusable developer workstation presentation; visual scale is independent of grid collision. */
export class Workstation {
  readonly floor = new Container({ eventMode: "none" });
  readonly objects = new Container({ sortableChildren: true, eventMode: "none" });
  readonly #occupied: Texture[];
  readonly #pairs: WorkstationPair[] = [];

  constructor(sprites: SpriteLibrary, desks: readonly PlanObject[]) {
    const texture = (name: string, version = "v2"): Texture => {
      const result = sprites.frames(`furniture/sample-${name}-${version}`, "static")?.[0];
      if (result === undefined) {
        throw new Error(`Missing workstation sample: ${name}`);
      }
      return result;
    };
    const carpet = texture("carpet", "v1");
    const deskTexture = texture("desk");
    const chairTexture = texture("chair");
    for (const item of desks.filter((candidate) => /^dev-\d$/u.test(candidate.id))) {
      for (let y = item.at.y - 2; y < item.at.y + 5; y += 1) {
        for (let x = item.at.x; x < item.at.x + 5; x += 1) {
          this.floor.addChild(new Sprite({ texture: carpet, x: x * 16, y: y * 16 }));
        }
      }
      const desk = new Sprite({
        texture: deskTexture,
        x: (item.at.x - 0.5) * 16,
        y: item.at.y * 16 - 46,
        zIndex: (item.at.y + 2) * 16 - 1,
        eventMode: "none",
      });
      const chair = new Sprite({
        texture: chairTexture,
        x: (item.at.x + 2.5) * 16,
        y: (item.at.y + 3) * 16,
        zIndex: (item.at.y + 3) * 16 - 1,
        eventMode: "none",
      });
      desk.scale.set(0.136);
      chair.scale.set(0.08);
      chair.anchor.set(0.5, 1);
      this.objects.addChild(desk, chair);
      this.#pairs.push({ desk, chair, id: item.id });
    }
    // Use the native-resolution seated source so the chair and character share
    // one authored baseline. The source currently contains one reviewed pose;
    // keeping it static avoids mixing the old downsampled chair into the new
    // workstation set.
    const occupied = sprites.frames("furniture/sample-seated-v2", "static");
    if (occupied === undefined || occupied.length === 0) {
      throw new Error("Missing Alex typing animation");
    }
    this.#occupied = occupied;
  }

  actorTexture(actor: Actor): Texture | undefined {
    return this.#seated(actor)
      ? this.#occupied[Math.floor(actor.animTime / 180) % this.#occupied.length]
      : undefined;
  }

  actorScale(actor: Actor): number {
    return this.#seated(actor) ? 0.105 : 2;
  }

  update(actor: Actor): void {
    for (const pair of this.#pairs) {
      pair.chair.visible = !(this.#seated(actor) && pair.id === "dev-3");
    }
  }

  #seated(actor: Actor): boolean {
    return (
      !actor.hidden &&
      actor.activity === "type" &&
      actor.work?.anchorId === "dev-3" &&
      actor.tile.x === 31 &&
      actor.tile.y === 9
    );
  }
}
