import "pixi.js/unsafe-eval";
import { OBJECT_SPEC, type ObjectKind } from "@ho/protocol";
import { CELL_PX, compileLayout, type FloorTemplate } from "@ho/sim";
import { Application, Container, Graphics } from "pixi.js";
import { Camera } from "../office/camera.ts";
import { floorTiles, gridLines } from "../office/tiles.ts";
import { arrowFor, arrowGraphic, arrowsOf } from "./arrows.ts";
import { type Draft, ghostAt, type Kinds, type Rect, type Tool } from "./draft.ts";
import { draftLayout } from "./office-file.ts";
import { kindNameOf, type KindName } from "../i18n/kinds.ts";
import { drawLabels } from "./labels.ts";

const HOVER = 0x2b3140;
const ARROW = 0x394152;
const LABEL = { fontFamily: "monospace", fontSize: 11, fill: 0x1f2430 } as const;
const PREVIEW_ADD = 0x4c8bf5;
const PREVIEW_ERASE = 0xe0525f;
const PREVIEW_ALPHA = 0.28;

type Cell = { x: number; y: number };

/** Doors and furniture have a footprint of their own, so they are placed by a click, not a drag. */
const placesOnClick = (tool: Tool): boolean => tool === "door" || tool === "object";

/** Whether what is in hand has a direction worth showing: a doorway always, furniture by its kind. */
const turns = (tool: Tool, object: ObjectKind): boolean =>
  tool === "door" || (tool === "object" && OBJECT_SPEC[object].arrow);

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
  readonly #preview = new Container({ alpha: PREVIEW_ALPHA });
  /** Names written across placed shapes; kept at a constant size whatever the zoom. */
  readonly #labels = new Container();
  /** Which way each placed piece is turned: a door swings, an air conditioner blows. */
  readonly #arrows = new Container();
  #tool: Tool = "wall";
  #kinds: Kinds | null = null;
  #hover: Cell | null = null;
  #gridScale = 0;
  #template: FloorTemplate | null = null;
  #draft: Draft | null = null;
  #kindName: KindName = kindNameOf("en");
  #host: HTMLElement | null = null;
  #observer: ResizeObserver | null = null;
  #paintFrom: Cell | null = null;
  #erasing = false;
  #panning = false;
  #pointer: Cell | null = null;
  onPaint: (rect: Rect, erase: boolean) => void = () => undefined;
  /** A right click on a piece in hand turns it a quarter; only a right drag erases. */
  onRotate: () => void = () => undefined;

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
    this.#world.addChild(this.#tiles, this.#grid, this.#arrows, this.#labels, this.#preview);
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
  /** The office's language: the map's labels follow the panels. */
  setKindName(name: KindName): void {
    this.#kindName = name;
    if (this.#draft !== null) {
      this.#drawLabels(this.#draft);
      this.#scaleLabels();
    }
  }

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
    this.#drawArrows(draft);
    this.#drawLabels(draft);
    this.camera.setMap(draft.width, draft.height);
    if (this.#gridScale === 0) {
      this.camera.fit();
    }
    this.#gridScale = 0;
    this.#apply();
  }

  #drawArrows(draft: Draft): void {
    this.#arrows.removeChildren().forEach((child) => {
      child.destroy();
    });
    for (const arrow of arrowsOf(draft)) {
      this.#arrows.addChild(arrowGraphic(arrow, ARROW));
    }
  }

  #drawLabels(draft: Draft): void {
    drawLabels(this.#labels, draft, this.#kindName, LABEL, this.camera.scale);
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
    if (placesOnClick(this.#tool) && !this.#erasing && draft !== null && kinds !== null) {
      return ghostAt(draft, to, this.#tool, kinds);
    }
    const start = from ?? to;
    return {
      x: Math.min(start.x, to.x),
      y: Math.min(start.y, to.y),
      w: Math.abs(start.x - to.x) + 1,
      h: Math.abs(start.y - to.y) + 1,
    };
  }

  #clearPreview(): void {
    this.#preview.removeChildren().forEach((child) => {
      child.destroy();
    });
  }

  #drawPreview(from: Cell | null, to: Cell | null): void {
    this.#clearPreview();
    const colour = this.#erasing ? PREVIEW_ERASE : PREVIEW_ADD;
    if (to === null) {
      this.#apply();
      return;
    }
    const { x, y, w, h } = this.#pending(from, to);
    const kinds = this.#kinds;
    const edge = { color: from === null ? HOVER : colour, width: 2 / this.camera.scale };
    const box = new Graphics()
      .rect(x * CELL_PX, y * CELL_PX, w * CELL_PX, h * CELL_PX)
      .fill(colour)
      .stroke(edge);
    this.#preview.addChild(box);
    // The placeholder already shows which way the piece opens or faces.
    if (!this.#erasing && kinds !== null && turns(this.#tool, kinds.object)) {
      this.#preview.addChild(arrowGraphic(arrowFor({ x, y, w, h }, kinds.facing), HOVER));
    }
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
      this.#clearPreview();
      if (from !== null && to !== null) {
        const clicked = from.x === to.x && from.y === to.y;
        if (this.#erasing && clicked && placesOnClick(this.#tool)) {
          // A right click turns the piece in hand; a right drag still erases the area.
          this.onRotate();
        } else {
          // Doors and furniture are placed where the pointer was released, never dragged out.
          const rect =
            placesOnClick(this.#tool) && !this.#erasing
              ? { x: to.x, y: to.y, w: 1, h: 1 }
              : this.#pending(from, to);
          this.onPaint(rect, this.#erasing);
        }
      }
      this.#erasing = false;
      this.#apply();
    });
    canvas.addEventListener("pointerleave", () => {
      this.#hover = null;
      this.#clearPreview();
      this.#apply();
    });
  }
}
