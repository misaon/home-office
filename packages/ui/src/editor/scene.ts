import "pixi.js/unsafe-eval";
import { CELL_PX, compileLayout, type FloorTemplate } from "@ho/sim";
import { Application, Container, Graphics, Text } from "pixi.js";
import { Camera } from "../office/camera.ts";
import { floorTiles, gridLines } from "../office/tiles.ts";
import { type Draft, draftLayout, ghostAt, type Kinds, type Rect, type Tool } from "./draft.ts";
import { labelsOf } from "./labels.ts";

const HOVER = 0x2b3140;
const LABEL = { fontFamily: "monospace", fontSize: 11, fill: 0x1f2430 } as const;
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
  /** The whole preview layer is translucent, so its own fill stays a plain colour. */
  readonly #preview = new Graphics({ alpha: PREVIEW_ALPHA });
  /** Names written across placed shapes; kept at a constant size whatever the zoom. */
  readonly #labels = new Container();
  #tool: Tool = "wall";
  #kinds: Kinds | null = null;
  #hover: Cell | null = null;
  #gridScale = 0;
  #template: FloorTemplate | null = null;
  #draft: Draft | null = null;
  #host: HTMLElement | null = null;
  #observer: ResizeObserver | null = null;
  #paintFrom: Cell | null = null;
  #erasing = false;
  #panning = false;
  #pointer: Cell | null = null;
  onPaint: (rect: Rect, erase: boolean) => void = () => undefined;

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
    this.#world.addChild(this.#tiles, this.#grid, this.#labels, this.#preview);
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

  /** The active tool and its palette: furniture is placed by a click, so its footprint is shown first. */
  setTool(tool: Tool, kinds: Kinds): void {
    this.#tool = tool;
    this.#kinds = kinds;
    this.#drawPreview(this.#paintFrom, this.#hover);
  }

  /** Rebuilds the drawn office. Called on every edit: compiling 2000 cells is cheaper than diffing them. */
  setDraft(draft: Draft): void {
    this.#draft = draft;
    this.#template = compileLayout(draft.id, draftLayout(draft));
    this.#tiles.removeChildren().forEach((child) => {
      child.destroy({ children: true });
    });
    this.#tiles.addChild(floorTiles(this.#template));
    this.#drawLabels(draft);
    this.camera.setMap(draft.width, draft.height);
    if (this.#gridScale === 0) {
      this.camera.fit();
    }
    this.#gridScale = 0;
    this.#apply();
  }

  #drawLabels(draft: Draft): void {
    this.#labels.removeChildren().forEach((child) => {
      child.destroy();
    });
    for (const label of labelsOf(draft)) {
      const text = new Text({ text: label.text, style: LABEL, resolution: 3 });
      text.anchor.set(0.5);
      text.position.set(label.x * CELL_PX, label.y * CELL_PX);
      this.#labels.addChild(text);
    }
    this.#scaleLabels();
  }

  /** Labels live in world space but must not grow with it, or a zoomed-in office is all text. */
  #scaleLabels(): void {
    const inverse = 1 / this.camera.scale;
    for (const label of this.#labels.children) {
      label.scale.set(inverse);
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
    this.#scaleLabels();
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

  /** The rectangle the pointer is about to affect: a drag, or a piece of furniture's own footprint. */
  #pending(from: Cell | null, to: Cell): Rect {
    const draft = this.#draft;
    const kinds = this.#kinds;
    if (this.#tool === "object" && !this.#erasing && draft !== null && kinds !== null) {
      return ghostAt(draft, to, kinds);
    }
    const start = from ?? to;
    return {
      x: Math.min(start.x, to.x),
      y: Math.min(start.y, to.y),
      w: Math.abs(start.x - to.x) + 1,
      h: Math.abs(start.y - to.y) + 1,
    };
  }

  #drawPreview(from: Cell | null, to: Cell | null): void {
    this.#preview.clear();
    const colour = this.#erasing ? PREVIEW_ERASE : PREVIEW_ADD;
    if (to === null) {
      this.#apply();
      return;
    }
    const { x, y, w, h } = this.#pending(from, to);
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
      // Left paints, right erases, the middle button and shift pan.
      this.#panning = event.button === 1 || event.shiftKey;
      this.#erasing = !this.#panning && event.button === 2;
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
      this.#hover = cell;
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
        // Furniture is placed where the pointer was released, never as a dragged rectangle.
        const rect =
          this.#tool === "object" && !this.#erasing
            ? { x: to.x, y: to.y, w: 1, h: 1 }
            : this.#pending(from, to);
        this.onPaint(rect, this.#erasing);
      }
      this.#erasing = false;
      this.#apply();
    });
    canvas.addEventListener("pointerleave", () => {
      this.#hover = null;
      this.#preview.clear();
      this.#apply();
    });
  }
}
