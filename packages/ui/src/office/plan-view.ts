/* eslint-disable unicorn/no-array-fill-with-reference-type -- Pixi Graphics.fill takes a FillStyle, not an Array value. */
import type { OfficePlan, PlanDoor, PlanObject, World } from "@ho/sim";
import { Container, Graphics, Sprite } from "pixi.js";
import type { FloorView } from "./scene.ts";
import { fitScale, type SpriteLibrary } from "./sprites.ts";
import { architecture, glassWall, standIn, TILE } from "./stand-ins.ts";

type DoorView = { spec: PlanDoor; graphic: Graphics; amount: number };
type ObjectView = { item: PlanObject; sprite: Sprite; animation: string };

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
    const texture = sprites.frames(item.sprite, item.animation)?.[0];
    if (texture === undefined) {
      objects.addChild(standIn(item));
      continue;
    }
    const sprite = new Sprite({ texture, x: item.at.x * TILE, y: (item.at.y + item.h) * TILE });
    sprite.anchor.set(0, 1);
    // Art is drawn at its own pixel size; a delivery at the wrong width is scaled to the footprint and reported.
    const scale = fitScale(texture.width, item.w * TILE);
    if (scale !== 1) {
      report(
        `${item.sprite} is ${String(texture.width)} px wide, footprint ${String(item.w * TILE)} px`,
      );
      sprite.scale.set(scale);
    }
    sprite.zIndex = (item.at.y + item.h) * TILE - (item.blocks ? 1 : 3);
    objects.addChild(sprite);
    views.push({ item, sprite, animation: item.animation });
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
        const texture = sprites.frames(view.item.sprite, view.item.animation)?.[0];
        if (texture !== undefined) {
          view.sprite.texture = texture;
          view.animation = view.item.animation;
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
