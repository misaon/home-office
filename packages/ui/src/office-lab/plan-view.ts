/* eslint-disable unicorn/no-array-fill-with-reference-type -- Pixi Graphics.fill takes a FillStyle, not an Array value. */
import { type Actor, type OfficePlan, type PlanDoor, type Point, type World } from "@ho/sim";
import { Container, Graphics, Rectangle, type Text } from "pixi.js";
import type { SpriteLibrary } from "../office/sprites.ts";
import { Workstation } from "./workstation.ts";
import type { FloorView } from "../office/scene.ts";
import { architecture, furniture, glassWall, label, TILE } from "./drawing.ts";

type DoorView = { spec: PlanDoor; graphic: Graphics; amount: number };

/** The lab supplies floor graphics; OfficeScene still owns actors, animation and Y sorting. */
export class PlanView {
  readonly view: FloorView;
  readonly #grid = new Graphics();
  readonly #route = new Graphics();
  readonly #doors: DoorView[] = [];
  readonly #indicator: Text;
  readonly #plan: OfficePlan;
  readonly #workstation: Workstation;

  constructor(plan: OfficePlan, onPoint: (point: Point) => void, sprites: SpriteLibrary) {
    this.#plan = plan;
    const root = new Container();
    const floor = architecture(plan);
    this.#workstation = new Workstation(
      sprites,
      plan.objects.filter((item) => /^dev-\d$/u.test(item.id)),
    );
    floor.addChild(this.#workstation.floor);
    floor.eventMode = "static";
    floor.cursor = "crosshair";
    floor.hitArea = new Rectangle(0, 0, plan.template.width * TILE, plan.template.height * TILE);
    floor.on("pointertap", (e) => {
      const local = floor.toLocal(e.global);
      onPoint({ x: Math.floor(local.x / TILE), y: Math.floor(local.y / TILE) });
    });
    const objects = new Container({ sortableChildren: true, eventMode: "passive" });
    for (const f of plan.objects) {
      if (!/^dev-\d(?:-chair)?$/u.test(f.id)) {
        objects.addChild(furniture(f));
      }
    }
    objects.addChild(this.#workstation.objects);
    for (const pane of plan.glass) {
      objects.addChild(glassWall(pane));
    }
    for (const spec of plan.doors) {
      const graphic = new Graphics({ x: spec.x * TILE, y: spec.y * TILE });
      graphic.zIndex = (spec.y + spec.h) * TILE + 1;
      objects.addChild(graphic);
      this.#doors.push({ spec, graphic, amount: 0 });
    }
    this.#indicator = label("↑ 01", 4 * TILE, 24 * TILE, "#bbf78b", 12);
    this.#indicator.zIndex = 29 * TILE;
    objects.addChild(this.#indicator);
    root.addChild(floor, this.#grid, this.#route, objects);
    this.view = {
      root,
      objects,
      actorTexture: (actor) => this.#workstation.actorTexture(actor),
      actorScale: (actor) => this.#workstation.actorScale(actor),
      width: plan.template.width * TILE,
      height: plan.template.height * TILE,
    };
    for (let x = 0; x <= plan.template.width; x += 1) {
      this.#grid.moveTo(x * TILE, 0).lineTo(x * TILE, this.view.height);
    }
    for (let y = 0; y <= plan.template.height; y += 1) {
      this.#grid.moveTo(0, y * TILE).lineTo(this.view.width, y * TILE);
    }
    this.#grid.stroke({ color: 0xffedca, width: 0.5, alpha: 0.16 });
    this.#grid.visible = false;
  }

  grid(visible: boolean): void {
    this.#grid.visible = visible;
  }

  route(points: Point[]): void {
    this.#route.clear();
    for (const [i, p] of points.entries()) {
      if (i === 0) {
        this.#route.moveTo((p.x + 0.5) * TILE, (p.y + 0.5) * TILE);
      } else {
        this.#route.lineTo((p.x + 0.5) * TILE, (p.y + 0.5) * TILE);
      }
    }
    this.#route.stroke({ color: 0xf7d677, width: 3, alpha: 0.85 });
    const last = points.at(-1);
    if (last !== undefined) {
      this.#route.circle((last.x + 0.5) * TILE, (last.y + 0.5) * TILE, 5).fill(0xffedb3);
    }
  }

  update(world: World, actor: Actor, dt: number): void {
    this.#workstation.update(actor);
    const arriving = actor.steps.some(
      (s) => s.kind === "elevator" && s.toFloorId === this.#plan.template.id,
    );
    this.#indicator.text = arriving ? "↑ …" : "01";
    for (const door of this.#doors) {
      const { spec } = door;
      const dx = Math.max(spec.x - actor.pos.x, 0, actor.pos.x - (spec.x + spec.w - 1));
      const dy = Math.max(spec.y - actor.pos.y, 0, actor.pos.y - (spec.y + spec.h - 1));
      const close = actor.floorId === this.#plan.template.id && !actor.hidden && dx + dy < 3;
      const target = close || (arriving && spec.kind === "elevator") ? 1 : 0;
      door.amount +=
        Math.sign(target - door.amount) * Math.min(Math.abs(target - door.amount), dt / 220);
      this.#drawDoor(door);
    }
    // The pool shimmer is deferred to production sprites; world time drives the elevator indicator.
    this.#indicator.alpha = arriving ? 0.65 + 0.35 * Math.sin(world.time / 180) ** 2 : 1;
  }

  #drawDoor({ graphic: g, spec: d, amount }: DoorView): void {
    const w = d.w * TILE;
    const h = d.h * TILE;
    const horizontal = d.w >= d.h;
    const color = d.kind === "door" ? 0xc9a56a : 0x8cdae3;
    g.clear().rect(0, 0, w, h).fill({ color: 0x294447, alpha: 0.25 });
    // Retracting leaves are visual only: the validated threshold remains walkable.
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
}
