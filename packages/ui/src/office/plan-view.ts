/* eslint-disable unicorn/no-array-fill-with-reference-type -- Pixi Graphics.fill takes a FillStyle, not an Array value. */
import type { OfficePlan, PlanDoor, PlanObject, World } from "@ho/sim";
import { Container, Graphics, Sprite, type Texture } from "pixi.js";
import type { FloorView } from "./scene.ts";
import { fitScale, type SpriteLibrary } from "./sprites.ts";
import { architecture, glassWall, standIn, TILE } from "./stand-ins.ts";

type DoorView = { spec: PlanDoor; graphic: Graphics; amount: number };
/** A placed sprite with the frames of its current animation; multi-frame animations loop at FRAME_MS. */
type ObjectView = {
  item: PlanObject;
  sprite: Sprite;
  animation: string;
  frames: Texture[];
  frame: number;
  timeMs: number;
};

/** Furniture animations (bubbling water, blinking screens) run at ~8 fps; one clock per object, no allocation per tick. */
const FRAME_MS = 120;

/** Frames of the object's current animation, falling back to its single `static` frame. */
const framesOf = (sprites: SpriteLibrary, item: PlanObject): Texture[] | undefined =>
  sprites.frames(item.sprite, item.animation) ?? sprites.frames(item.sprite, "static");

const DOOR_MS = 220;
const NEAR_CELLS = 3;

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
  );
  floor.cacheAsTexture(true);
  const objects = new Container({ sortableChildren: true });
  const views: ObjectView[] = [];
  for (const item of plan.objects) {
    const frames = framesOf(sprites, item);
    const texture = frames?.[0];
    if (frames === undefined || texture === undefined) {
      objects.addChild(standIn(item));
      continue;
    }
    // Art sits with its bottom-left corner on the footprint's bottom-left cell; art declared wider than the
    // footprint (chairs) is centred on it instead. A wrong width is scaled to the contract size and reported.
    const bottom = (item.at.y + item.h) * TILE;
    const artWidth = (item.artWidth ?? item.w) * TILE;
    const sprite =
      item.artWidth === undefined
        ? new Sprite({ texture, x: item.at.x * TILE, y: bottom, anchor: { x: 0, y: 1 } })
        : new Sprite({
            texture,
            x: (item.at.x + item.w / 2) * TILE,
            y: bottom,
            anchor: { x: 0.5, y: 1 },
          });
    const scale = fitScale(texture.width, artWidth);
    if (scale !== 1) {
      report(`${item.sprite} is ${String(texture.width)} px wide, expected ${String(artWidth)} px`);
      sprite.scale.set(scale);
    }
    sprite.zIndex = (item.at.y + item.h) * TILE - (item.blocks ? 1 : 3);
    objects.addChild(sprite);
    views.push({ item, sprite, animation: item.animation, frames, frame: 0, timeMs: 0 });
  }
  for (const pane of plan.glass) {
    objects.addChild(glassWall(pane));
  }
  const doors: DoorView[] = plan.doors.map((spec) => {
    const graphic = new Graphics({ x: spec.x * TILE, y: spec.y * TILE });
    graphic.zIndex = (spec.y + spec.h) * TILE + 1;
    objects.addChild(graphic);
    return { spec, graphic, amount: 0 };
  });
  root.addChild(floor, objects);

  const update = (world: World, dtMs: number): void => {
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
        const cycle = FRAME_MS * view.frames.length;
        view.timeMs = (view.timeMs + dtMs) % cycle;
        const frame = Math.floor(view.timeMs / FRAME_MS);
        const texture = view.frames[frame];
        if (frame !== view.frame && texture !== undefined) {
          view.frame = frame;
          view.sprite.texture = texture;
        }
      }
    }
    const people = [...world.actors.values()].filter((a) => a.floorId === template.id && !a.hidden);
    for (const door of doors) {
      const { spec } = door;
      const near = people.some((a) => {
        const dx = Math.max(spec.x - a.pos.x, 0, a.pos.x - (spec.x + spec.w - 1));
        const dy = Math.max(spec.y - a.pos.y, 0, a.pos.y - (spec.y + spec.h - 1));
        return dx + dy < NEAR_CELLS;
      });
      const target = near ? 1 : 0;
      door.amount +=
        Math.sign(target - door.amount) * Math.min(Math.abs(target - door.amount), dtMs / DOOR_MS);
      drawDoor(door);
    }
  };
  for (const door of doors) {
    drawDoor(door);
  }
  return { root, objects, width: template.width * TILE, height: template.height * TILE, update };
}

/** Sliding leaves retract toward the jambs; the threshold stays walkable regardless (visual only). */
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
