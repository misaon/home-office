import {
  type Actor,
  type OfficePlan,
  type PlanDoor,
  type PlanObject,
  type PlanRect,
  type World,
} from "@ho/sim";
import { Container, Graphics, Sprite, type Texture } from "pixi.js";
import type { FloorView } from "./scene.ts";
import { fitScale, type SpriteLibrary } from "./sprites.ts";
import { architecture, glassWall } from "./architecture.ts";
import { standIn, TILE } from "./stand-ins.ts";

type DoorView = { spec: PlanDoor; graphic: Graphics; amount: number };
/**
 * A placed sprite with the frames of its current animation. Multi-frame animations either loop at FRAME_MS or,
 * with `playback: "near"`, follow `amount` (0 closed … 1 open) driven by who stands within reach.
 */
type ObjectView = {
  item: PlanObject;
  sprite: Sprite;
  animation: string;
  frames: Texture[];
  frame: number;
  timeMs: number;
  amount: number;
};

/** Furniture animations (bubbling water, blinking screens) run at ~8 fps; one clock per object, no allocation per tick. */
const FRAME_MS = 120;
/** Full travel of a proximity-driven animation (elevator doors), forward and back. */
const NEAR_MS = 700;

const inRect = (p: { x: number; y: number }, rect: PlanRect): boolean =>
  p.x >= rect.x && p.x < rect.x + rect.w && p.y >= rect.y && p.y < rect.y + rect.h;

/**
 * True when an actor is about to pass through the rect: they stand in it, or one of the next LOOKAHEAD_CELLS
 * cells of their current walk leads into it. Walking past a door does not open it.
 */
const anyoneHeading = (people: readonly Actor[], rect: PlanRect): boolean =>
  people.some((a) => {
    if (inRect(a.tile, rect)) {
      return true;
    }
    const step = a.steps[0];
    const path = step?.kind === "walk" ? (step.path ?? []) : [];
    for (let index = 0; index < Math.min(path.length, LOOKAHEAD_CELLS); index += 1) {
      const point = path[index];
      if (point !== undefined && inRect(point, rect)) {
        return true;
      }
    }
    return false;
  });

/** Moves `amount` toward `target` at a fixed speed; returns the new value. */
const approach = (amount: number, target: number, dtMs: number, travelMs: number): number =>
  amount + Math.sign(target - amount) * Math.min(Math.abs(target - amount), dtMs / travelMs);

/** Frames of the object's current animation, falling back to its single `static` frame. */
const framesOf = (sprites: SpriteLibrary, item: PlanObject): Texture[] | undefined =>
  sprites.frames(item.sprite, item.animation) ?? sprites.frames(item.sprite, "static");

const DOOR_MS = 220;
const LOOKAHEAD_CELLS = 4;

/**
 * Renders the office plan: cached architecture, glass, doors that slide open when somebody comes close,
 * and one node per object — the delivered sprite when `furniture/<key>` exists in the manifest, a
 * geometric stand-in otherwise. Objects with state (the mailbox) swap textures when their animation changes.
 */
export function createPlanView(
  plan: OfficePlan,
  sprites: SpriteLibrary,
  report: (issue: string) => void,
): FloorView {
  const { template } = plan;
  const root = new Container({ visible: false });
  const floor = architecture(
    plan.rooms,
    plan.glass,
    template.walls,
    template.width,
    template.height,
    template.floor,
    (key) => sprites.frames(key, "static")?.[0],
  );
  const objects = new Container({ sortableChildren: true });
  const views: ObjectView[] = [];
  for (const item of plan.objects) {
    const frames = framesOf(sprites, item);
    const texture = frames?.[0];
    // Floor-layer art (the elevator cabin) is baked into the cached floor under everybody else.
    const layer = item.layer === "floor" ? floor : objects;
    if (frames === undefined || texture === undefined) {
      layer.addChild(standIn(item));
      continue;
    }
    const sprite = artSprite(item, texture, report);
    sprite.zIndex = (item.at.y + item.h) * TILE - (item.blocks ? 1 : 3);
    layer.addChild(sprite);
    if (layer === objects) {
      views.push({
        item,
        sprite,
        animation: item.animation,
        frames,
        frame: 0,
        timeMs: 0,
        amount: 0,
      });
    }
  }
  floor.cacheAsTexture(true);
  for (const pane of plan.glass) {
    objects.addChild(glassWall(pane));
  }
  // The elevator's doors belong to its sprite once real art exists; the stand-in door graphic then goes away.
  const doors: DoorView[] = plan.doors
    .filter((spec) => spec.kind !== "elevator" || !sprites.has("furniture/elevator-doors"))
    .map((spec) => {
      const graphic = new Graphics({ x: spec.x * TILE, y: spec.y * TILE });
      graphic.zIndex = (spec.y + spec.h) * TILE + 1;
      objects.addChild(graphic);
      return { spec, graphic, amount: 0 };
    });
  root.addChild(floor, objects);

  const update = (world: World, dtMs: number): void => {
    const people = [...world.actors.values()].filter((a) => a.floorId === template.id && !a.hidden);
    for (const view of views) {
      if (view.animation !== view.item.animation) {
        // State change (mailbox empty → full): swap to the new animation's frames, restart its clock.
        const frames = framesOf(sprites, view.item);
        const texture = frames?.[0];
        if (frames !== undefined && texture !== undefined) {
          view.frames = frames;
          view.frame = 0;
          view.timeMs = 0;
          view.sprite.texture = texture;
          view.animation = view.item.animation;
        }
      }
      if (view.frames.length > 1) {
        let frame = view.frame;
        if (view.item.playback === "sim") {
          // The simulation owns this animation (elevator doors): 0 closed … 1 open.
          const amount =
            world.floors
              .get(template.id)
              ?.animations.get(view.item.sprite.slice("furniture/".length)) ?? 0;
          frame = Math.round(amount * (view.frames.length - 1));
        } else if (view.item.playback === "near") {
          const target = anyoneHeading(people, { ...view.item.at, w: view.item.w, h: view.item.h })
            ? 1
            : 0;
          view.amount = approach(view.amount, target, dtMs, NEAR_MS);
          frame = Math.round(view.amount * (view.frames.length - 1));
        } else {
          const cycle = FRAME_MS * view.frames.length;
          view.timeMs = (view.timeMs + dtMs) % cycle;
          frame = Math.floor(view.timeMs / FRAME_MS);
        }
        const texture = view.frames[frame];
        if (frame !== view.frame && texture !== undefined) {
          view.frame = frame;
          view.sprite.texture = texture;
        }
      }
    }
    for (const door of doors) {
      const { spec } = door;
      const target = anyoneHeading(people, spec) ? 1 : 0;
      const amount = approach(door.amount, target, dtMs, DOOR_MS);
      if (door.amount !== amount) {
        door.amount = amount;
        drawDoor(door);
      }
    }
  };
  for (const door of doors) {
    drawDoor(door);
  }
  return { root, objects, width: template.width * TILE, height: template.height * TILE, update };
}

/** Sliding leaves retract toward the jambs; the threshold stays walkable regardless (visual only). */
/**
 * Art sits with its bottom-left corner on the footprint's bottom-left cell; art declared by its own width (chairs)
 * or height (plants) is centred on the footprint instead. A wrong size is scaled to the contract size and reported.
 */
function artSprite(item: PlanObject, texture: Texture, report: (issue: string) => void): Sprite {
  const bottom = (item.at.y + item.h + (item.artOffsetY ?? 0)) * TILE;
  const byHeight = item.artHeight !== undefined;
  const expected = (item.artHeight ?? item.artWidth ?? item.w) * TILE;
  const sprite =
    item.artWidth === undefined && !byHeight
      ? new Sprite({ texture, x: item.at.x * TILE, y: bottom, anchor: { x: 0, y: 1 } })
      : new Sprite({
          texture,
          x: (item.at.x + item.w / 2) * TILE,
          y: bottom,
          anchor: { x: 0.5, y: 1 },
        });
  const actual = byHeight ? texture.height : texture.width;
  const scale = fitScale(actual, expected);
  if (scale !== 1) {
    report(
      `${item.sprite} is ${String(actual)} px ${byHeight ? "tall" : "wide"}, expected ${String(expected)} px`,
    );
    sprite.scale.set(scale);
  }
  return sprite;
}

function drawDoor({ graphic: g, spec: d, amount }: DoorView): void {
  const w = d.w * TILE;
  const h = d.h * TILE;
  const horizontal = d.w >= d.h;
  const color = d.kind === "door" ? 0xc9a56a : 0x8cdae3;
  g.clear().rect(0, 0, w, h).fill({ color: 0x294447, alpha: 0.25 });
  if (horizontal) {
    const leaf = (w / 2) * (1 - amount);
    if (leaf > 0) {
      g.rect(0, 3, leaf, 10)
        .fill(color)
        .rect(w - leaf, 3, leaf, 10)
        .fill(color);
    }
    g.rect(0, 0, w, 2).fill(0x24373b);
  } else {
    const leaf = (h / 2) * (1 - amount);
    if (leaf > 0) {
      g.rect(3, 0, 10, leaf)
        .fill(color)
        .rect(3, h - leaf, 10, leaf)
        .fill(color);
    }
    g.rect(0, 0, 2, h).fill(0x24373b);
  }
}
