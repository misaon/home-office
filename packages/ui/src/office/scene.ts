import "pixi.js/unsafe-eval";
import type { AgentId } from "@ho/protocol";
import { type Actor, CELL_PX, type FloorTemplate, type World } from "@ho/sim";
import { Application, Container, Graphics } from "pixi.js";
import { Camera } from "./camera.ts";
import { DOT, DOT_EDGE, DOT_SELECTED } from "./palette.ts";
import { floorTiles, gridLines } from "./tiles.ts";

/**
 * A character is about two cells across, which is what keeps them proportional to the furniture the
 * editor places: a chair is 2×2 and a desk 3×6 at roughly 25 cm per cell.
 */
const DOT_RADIUS = Math.round(CELL_PX * 0.9);
/** How far the pointer may travel before a click counts as a drag instead of a selection. */
const DRAG_SLOP_PX = 4;
const WHEEL_STEP = 1.15;
/** Views kept built while floors are switched. */
const FLOOR_CACHE = 2;

type DotView = { shape: Graphics; selected: boolean };
type FloorView = { tiles: Container; template: FloorTemplate };

const paint = (shape: Graphics, selected: boolean): void => {
  shape
    .clear()
    .circle(0, 0, DOT_RADIUS)
    .fill(selected ? DOT_SELECTED : DOT)
    .stroke({ color: DOT_EDGE, width: 1 });
};

/**
 * PixiJS view of the map: the grid of cells a layout is compiled into, whatever that layout fills them
 * with, and one dot per character. Zoom with the wheel, drag to pan; nothing here places anything —
 * layouts are written in code.
 */
export class OfficeScene {
  readonly app = new Application();
  readonly camera = new Camera();
  readonly #world = new Container();
  readonly #tiles = new Container();
  readonly #dots = new Map<AgentId, DotView>();
  readonly #floors = new Map<string, FloorView>();
  #grid = new Graphics();
  #gridScale = 0;
  #floorId: string | null = null;
  #host: HTMLElement | null = null;
  #observer: ResizeObserver | null = null;
  #drag: { x: number; y: number; moved: boolean } | null = null;
  onSelect: (agentId: AgentId | null) => void = () => undefined;

  async init(host: HTMLElement): Promise<void> {
    this.#host = host;
    await this.app.init({
      background: "#ffffff",
      width: Math.max(1, host.clientWidth),
      height: Math.max(1, host.clientHeight),
      antialias: true,
      preference: "webgl",
      resolution: window.devicePixelRatio,
      autoDensity: true,
    });
    this.app.ticker.maxFPS = 30;
    host.append(this.app.canvas);
    this.app.stage.addChild(this.#world);
    this.#world.addChild(this.#tiles, this.#grid);
    this.app.stage.eventMode = "static";
    this.app.stage.on("pointertap", () => {
      if (this.#drag?.moved !== true) {
        this.onSelect(null);
      }
    });
    this.camera.setViewport(this.app.screen.width, this.app.screen.height);
    this.#listen(this.app.canvas);
    this.#observer = new ResizeObserver(() => {
      this.#resize();
    });
    this.#observer.observe(host);
  }

  destroy(): void {
    this.#observer?.disconnect();
    this.#dots.clear();
    this.#floors.clear();
    this.app.destroy(true, { children: true });
  }

  /** Wheel zooms around the cursor; dragging pans. Native listeners: the map is one surface, not widgets. */
  #listen(canvas: HTMLCanvasElement): void {
    canvas.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        const box = canvas.getBoundingClientRect();
        this.camera.zoomBy(
          event.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP,
          event.clientX - box.left,
          event.clientY - box.top,
        );
        this.#applyCamera();
      },
      { passive: false },
    );
    canvas.addEventListener("pointerdown", (event) => {
      this.#drag = { x: event.clientX, y: event.clientY, moved: false };
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove", (event) => {
      const drag = this.#drag;
      if (drag === null) {
        return;
      }
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < DRAG_SLOP_PX) {
        return;
      }
      drag.moved = true;
      drag.x = event.clientX;
      drag.y = event.clientY;
      this.camera.panBy(dx, dy);
      this.#applyCamera();
      canvas.style.cursor = "grabbing";
    });
    for (const kind of ["pointerup", "pointercancel"]) {
      canvas.addEventListener(kind, () => {
        canvas.style.cursor = "";
        // The tap handler runs after this, so the flag has to outlive the release for one turn.
        setTimeout(() => {
          this.#drag = null;
        }, 0);
      });
    }
  }

  #resize(): void {
    const host = this.#host;
    if (host === null || host.clientWidth === 0) {
      return;
    }
    this.app.renderer.resize(host.clientWidth, host.clientHeight);
    this.app.stage.hitArea = this.app.screen;
    this.camera.setViewport(host.clientWidth, host.clientHeight);
    this.#applyCamera();
  }

  #applyCamera(): void {
    const { scale } = this.camera;
    this.#world.scale.set(scale);
    this.#world.position.set(
      Math.round(-this.camera.offsetX * scale),
      Math.round(-this.camera.offsetY * scale),
    );
    if (this.#gridScale !== scale) {
      this.#drawGrid();
    }
  }

  #drawGrid(): void {
    const view = this.#floorId === null ? undefined : this.#floors.get(this.#floorId);
    if (view === undefined) {
      return;
    }
    const { scale } = this.camera;
    this.#gridScale = scale;
    const next = gridLines(view.template.map, scale);
    this.#grid.destroy();
    this.#grid = next;
    this.#world.addChild(next);
  }

  /** Which floor's map and characters are shown; its tiles are built once and kept while it is in use. */
  showFloor(template: FloorTemplate | null): void {
    const id = template?.id ?? null;
    if (this.#floorId === id) {
      return;
    }
    this.#floorId = id;
    if (template !== null) {
      const view = this.#floors.get(template.id) ?? {
        tiles: floorTiles(template),
        template,
      };
      this.#floors.delete(template.id);
      this.#floors.set(template.id, view);
      this.#tiles.addChild(view.tiles);
      this.camera.setMap(template.map.width, template.map.height);
      this.camera.fit();
      this.#gridScale = 0;
      this.#applyCamera();
    }
    for (const [floorId, view] of this.#floors) {
      view.tiles.visible = floorId === id;
    }
    while (this.#floors.size > FLOOR_CACHE) {
      const oldest = this.#floors.entries().next();
      if (oldest.done !== true) {
        const [floorId, view] = oldest.value;
        view.tiles.destroy({ children: true });
        this.#floors.delete(floorId);
      }
    }
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
      if (this.#drag?.moved !== true) {
        this.onSelect(actor.id);
      }
    });
    this.#world.addChild(shape);
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
