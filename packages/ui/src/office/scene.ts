import "pixi.js/unsafe-eval";
import type { AgentId } from "@ho/protocol";
import { type Actor, CELL_PX, type World } from "@ho/sim";
import { Application, Container, Graphics } from "pixi.js";

/** The office is a blank sheet: a white plane, and one dot for every character on the shown floor. */
const SURFACE = "#ffffff";
const DOT_RADIUS = Math.round(CELL_PX * 0.45);
const DOT = 0x2b3140;
const DOT_SELECTED = 0xffd166;
const DOT_EDGE = 0x1f2430;

type DotView = { shape: Graphics; selected: boolean };

const paint = (shape: Graphics, selected: boolean): void => {
  shape
    .clear()
    .circle(0, 0, DOT_RADIUS)
    .fill(selected ? DOT_SELECTED : DOT)
    .stroke({ color: DOT_EDGE, width: 1 });
};

/** PixiJS view of the office while its art is being designed: the plane, the dots and the camera. */
export class OfficeScene {
  readonly app = new Application();
  readonly #stage = new Container();
  readonly #dots = new Map<AgentId, DotView>();
  #floorId: string | null = null;
  /** The shown floor's size in cells; the camera scales it to the pane's width. */
  #cells = { width: 1, height: 1 };
  #host: HTMLElement | null = null;
  #observer: ResizeObserver | null = null;
  onSelect: (agentId: AgentId | null) => void = () => undefined;

  async init(host: HTMLElement): Promise<void> {
    this.#host = host;
    await this.app.init({
      background: SURFACE,
      width: Math.max(1, host.clientWidth),
      height: Math.max(1, host.clientHeight),
      antialias: true,
      preference: "webgl",
      resolution: window.devicePixelRatio,
      autoDensity: true,
    });
    this.app.ticker.maxFPS = 30;
    host.append(this.app.canvas);
    this.app.stage.addChild(this.#stage);
    this.app.stage.eventMode = "static";
    this.app.stage.on("pointertap", () => {
      this.onSelect(null);
    });
    this.#observer = new ResizeObserver(() => {
      this.#fit();
    });
    this.#observer.observe(host);
  }

  destroy(): void {
    this.#observer?.disconnect();
    this.#dots.clear();
    this.app.destroy(true, { children: true });
  }

  /** Which floor the dots belong to; the plane's size follows that floor's grid. */
  showFloor(world: World, id: string | null): void {
    if (this.#floorId === id) {
      return;
    }
    this.#floorId = id;
    const floor = id === null ? undefined : world.floors.get(id);
    if (floor !== undefined) {
      this.#cells = { width: floor.template.width, height: floor.template.height };
    }
    this.#fit();
  }

  /** The plane spans the pane's width; a taller plane makes the canvas grow and the pane scroll. */
  #fit(): void {
    const host = this.#host;
    if (host === null || host.clientWidth === 0) {
      return;
    }
    const width = host.clientWidth;
    const scale = width / (this.#cells.width * CELL_PX);
    const planeHeight = Math.ceil(this.#cells.height * CELL_PX * scale);
    const height = Math.max(host.clientHeight, planeHeight);
    if (this.app.screen.width !== width || this.app.screen.height !== height) {
      this.app.renderer.resize(width, height);
      this.app.stage.hitArea = this.app.screen;
    }
    this.#stage.scale.set(scale);
    this.#stage.position.set(0, Math.floor((height - planeHeight) / 2));
  }

  #ensureDot(actor: Actor): DotView {
    const existing = this.#dots.get(actor.id);
    if (existing !== undefined) {
      return existing;
    }
    const shape = new Graphics({ eventMode: "static", cursor: "pointer" });
    paint(shape, false);
    shape.on("pointertap", (e) => {
      e.stopPropagation();
      this.onSelect(actor.id);
    });
    this.#stage.addChild(shape);
    const view: DotView = { shape, selected: false };
    this.#dots.set(actor.id, view);
    return view;
  }

  /** Called every frame with the current world: one dot per visible character of the shown floor. */
  update(world: World, selected: AgentId | null): void {
    for (const actor of world.actors.values()) {
      const view = this.#dots.get(actor.id);
      if (actor.floorId !== this.#floorId || actor.hidden) {
        if (view !== undefined) {
          view.shape.visible = false;
        }
        continue;
      }
      const dot = view ?? this.#ensureDot(actor);
      dot.shape.visible = true;
      dot.shape.position.set((actor.pos.x + 0.5) * CELL_PX, (actor.pos.y + 0.5) * CELL_PX);
      const isSelected = actor.id === selected;
      if (dot.selected !== isSelected) {
        dot.selected = isSelected;
        paint(dot.shape, isSelected);
      }
    }
    for (const [id, view] of this.#dots) {
      if (!world.actors.has(id)) {
        view.shape.destroy();
        this.#dots.delete(id);
      }
    }
  }
}
