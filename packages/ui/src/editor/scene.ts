import "pixi.js/unsafe-eval";
import { CELL_PX, compileLayout, type FloorTemplate } from "@ho/sim";
import { Application, Container, Graphics } from "pixi.js";
import { Camera } from "../office/camera.ts";
import { colourOf, DOOR, DOOR_DEFAULT } from "../office/palette.ts";
import { floorTiles, gridLines } from "../office/tiles.ts";
import { type Draft, draftLayout, type Rect, type Tool } from "./draft.ts";

const HOVER = 0x2b3140;
const PREVIEW_ADD = 0x4c8bf5;
const PREVIEW_ERASE = 0xe0525f;
const PREVIEW_ALPHA = 0.28;

type Cell = { x: number; y: number };

/**
 * The editor's canvas: the draft compiled and drawn exactly as the office would draw it, with the cell
 * under the cursor outlined and the pending drag previewed. Dragging paints; shift, the middle button or
 * the right button pans; the wheel zooms.
 */
export class EditorScene {
  readonly app = new Application();
  readonly camera = new Camera();
  readonly #world = new Container();
  readonly #tiles = new Container();
  #grid = new Graphics();
  readonly #doors = new Graphics();
  /** The whole preview layer is translucent, so its own fill stays a plain colour. */
  readonly #preview = new Graphics({ alpha: PREVIEW_ALPHA });
  #gridScale = 0;
  #template: FloorTemplate | null = null;
  #draft: Draft | null = null;
  #tool: Tool = "wall";
  #host: HTMLElement | null = null;
  #observer: ResizeObserver | null = null;
  #paintFrom: Cell | null = null;
  #panning = false;
  #pointer: Cell | null = null;
  onPaint: (rect: Rect) => void = () => undefined;
  onHover: (cell: Cell | null) => void = () => undefined;

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
    this.app.ticker.stop();
    host.append(this.app.canvas);
    this.app.stage.addChild(this.#world);
    this.#world.addChild(this.#tiles, this.#grid, this.#doors, this.#preview);
    this.camera.setViewport(this.app.screen.width, this.app.screen.height);
    this.#listen(this.app.canvas);
    this.#observer = new ResizeObserver(() => {
      this.#resize();
    });
    this.#observer.observe(host);
  }

  destroy(): void {
    this.#observer?.disconnect();
    this.app.destroy(true, { children: true });
  }

  setTool(tool: Tool): void {
    this.#tool = tool;
  }

  /** Rebuilds the drawn office. Called on every edit: compiling 2000 cells is cheaper than diffing them. */
  setDraft(draft: Draft): void {
    this.#draft = draft;
    this.#template = compileLayout(draft.id, draftLayout(draft));
    this.#tiles.removeChildren().forEach((child) => {
      child.destroy({ children: true });
    });
    this.#tiles.addChild(floorTiles(this.#template));
    this.camera.setMap(draft.width, draft.height);
    if (this.#gridScale === 0) {
      this.camera.fit();
    }
    this.#drawDoors(draft);
    this.#gridScale = 0;
    this.#apply();
  }

  /** Doors are drawn here, not by the shared tile painter: the editor needs to tell one kind from another. */
  #drawDoors(draft: Draft): void {
    this.#doors.clear();
    for (const [i, kind] of draft.door.entries()) {
      if (kind !== null) {
        const x = (i % draft.width) * CELL_PX;
        const y = Math.floor(i / draft.width) * CELL_PX;
        this.#doors
          .rect(x + CELL_PX * 0.15, y + CELL_PX * 0.15, CELL_PX * 0.7, CELL_PX * 0.7)
          .fill(colourOf(DOOR, kind, DOOR_DEFAULT));
      }
    }
  }

  #resize(): void {
    const host = this.#host;
    if (host === null || host.clientWidth === 0) {
      return;
    }
    this.app.renderer.resize(host.clientWidth, host.clientHeight);
    this.camera.setViewport(host.clientWidth, host.clientHeight);
    this.#apply();
  }

  #apply(): void {
    const { scale } = this.camera;
    this.#world.scale.set(scale);
    this.#world.position.set(
      Math.round(-this.camera.offsetX * scale),
      Math.round(-this.camera.offsetY * scale),
    );
    if (this.#gridScale !== scale && this.#template !== null) {
      this.#gridScale = scale;
      const next = gridLines(this.#template.map, scale);
      this.#grid.destroy();
      this.#grid = next;
      this.#world.addChildAt(next, 1);
    }
    this.app.render();
  }

  #cellAt(event: PointerEvent | WheelEvent): Cell | null {
    const draft = this.#draft;
    const box = this.app.canvas.getBoundingClientRect();
    if (draft === null) {
      return null;
    }
    const { scale } = this.camera;
    const x = Math.floor((this.camera.offsetX + (event.clientX - box.left) / scale) / CELL_PX);
    const y = Math.floor((this.camera.offsetY + (event.clientY - box.top) / scale) / CELL_PX);
    return x < 0 || y < 0 || x >= draft.width || y >= draft.height ? null : { x, y };
  }

  #drawPreview(from: Cell | null, to: Cell | null): void {
    this.#preview.clear();
    const colour = this.#tool === "erase" ? PREVIEW_ERASE : PREVIEW_ADD;
    if (to === null) {
      this.#apply();
      return;
    }
    const start = from ?? to;
    const x = Math.min(start.x, to.x);
    const y = Math.min(start.y, to.y);
    const w = Math.abs(start.x - to.x) + 1;
    const h = Math.abs(start.y - to.y) + 1;
    const edge = { color: from === null ? HOVER : colour, width: 2 / this.camera.scale };
    this.#preview
      .rect(x * CELL_PX, y * CELL_PX, w * CELL_PX, h * CELL_PX)
      .fill(colour)
      .stroke(edge);
    this.#apply();
  }

  #listen(canvas: HTMLCanvasElement): void {
    canvas.addEventListener("contextmenu", (event) => {
      event.preventDefault();
    });
    canvas.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        const box = canvas.getBoundingClientRect();
        this.camera.zoomBy(
          event.deltaY < 0 ? 1.15 : 1 / 1.15,
          event.clientX - box.left,
          event.clientY - box.top,
        );
        this.#apply();
      },
      { passive: false },
    );
    canvas.addEventListener("pointerdown", (event) => {
      this.#panning = event.button !== 0 || event.shiftKey;
      if (!this.#panning) {
        this.#paintFrom = this.#cellAt(event);
        this.#drawPreview(this.#paintFrom, this.#paintFrom);
      }
      this.#pointer = { x: event.clientX, y: event.clientY };
      // Capture last: painting must not depend on the browser granting it.
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove", (event) => {
      const cell = this.#cellAt(event);
      this.onHover(cell);
      if (this.#panning && this.#pointer !== null) {
        this.camera.panBy(event.clientX - this.#pointer.x, event.clientY - this.#pointer.y);
        this.#pointer = { x: event.clientX, y: event.clientY };
        this.#apply();
        return;
      }
      this.#drawPreview(this.#paintFrom, cell);
    });
    canvas.addEventListener("pointerup", (event) => {
      const from = this.#paintFrom;
      const to = this.#cellAt(event);
      this.#paintFrom = null;
      this.#panning = false;
      this.#preview.clear();
      if (from !== null && to !== null) {
        this.onPaint({
          x: Math.min(from.x, to.x),
          y: Math.min(from.y, to.y),
          w: Math.abs(from.x - to.x) + 1,
          h: Math.abs(from.y - to.y) + 1,
        });
      }
      this.#apply();
    });
    canvas.addEventListener("pointerleave", () => {
      this.onHover(null);
      this.#preview.clear();
      this.#apply();
    });
  }
}
