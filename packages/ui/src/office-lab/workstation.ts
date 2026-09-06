import type { Actor } from "@ho/sim";
import { Container, Sprite, type Texture } from "pixi.js";
import type { SpriteLibrary } from "../office/sprites.ts";

/** Art calibration at DEV 3; visual bounds are independent of the approved collision grid. */
export class Workstation {
  readonly floor = new Container({ eventMode: "none" });
  readonly desk: Sprite;
  readonly chair: Sprite;
  readonly #occupied: Texture;

  constructor(sprites: SpriteLibrary) {
    const texture = (name: string): Texture => {
      const result = sprites.frames(`furniture/sample-${name}-v1`, "static")?.[0];
      if (result === undefined) {
        throw new Error(`Missing workstation sample: ${name}`);
      }
      return result;
    };
    const carpet = texture("carpet");
    for (let y = 5; y < 12; y += 1) {
      for (let x = 29; x < 35; x += 1) {
        this.floor.addChild(new Sprite({ texture: carpet, x: x * 16, y: y * 16 }));
      }
    }
    this.desk = new Sprite({
      texture: texture("desk"),
      x: 29.5 * 16,
      y: 6 * 16,
      zIndex: 9 * 16 - 1,
      eventMode: "none",
    });
    this.chair = new Sprite({
      texture: texture("chair"),
      x: 31.5 * 16,
      y: 10 * 16,
      zIndex: 10 * 16 - 1,
      eventMode: "none",
    });
    this.chair.anchor.set(0.5, 1);
    this.#occupied = texture("seated");
  }

  actorTexture(actor: Actor): Texture | undefined {
    return this.#seated(actor) ? this.#occupied : undefined;
  }

  update(actor: Actor): void {
    this.chair.visible = !this.#seated(actor);
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
