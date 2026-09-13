import { type LayoutRect, OBJECT_SPEC, type ObjectKind } from "@ho/protocol";
import { CELL_PX } from "@ho/sim";
import { Container, Graphics } from "pixi.js";
import { type KindName, kindNameOf } from "../i18n/kinds.ts";
import { MapView } from "../office/map-view.ts";
import { arrowFor, arrowGraphic, arrowsOf } from "./arrows.ts";
import { type Brush, ghostAt, type OfficeDraft, type Tool } from "./draft.ts";
import { drawLabels } from "./labels.ts";
import { compileDraft } from "./office-file.ts";

const HOVER = 0x2b3140;
const ARROW = 0x394152;
const LABEL = { fontFamily: "monospace", fontSize: 11, fill: 0x1f2430 } as const;
const PREVIEW_ADD = 0x4c8bf5;
const PREVIEW_ERASE = 0xe0525f;
const PREVIEW_ALPHA = 0.28;

type Cell = { x: number; y: number };

/** What the React side hands the scene on every change. */
export type EditorProps = {
  draft: OfficeDraft;
  tool: Tool;
  brush: Brush;
  kindName: KindName;
  onPaint: (rect: LayoutRect, erase: boolean) => void;
  /** A right click on a piece in hand turns it a quarter; only a right drag erases. */
  onRotate: () => void;
};

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
export class EditorScene extends MapView {
  /** The whole preview layer is translucent, so its own fill stays a plain colour. */
  readonly #preview = new Container({ alpha: PREVIEW_ALPHA });
  /** Names written across placed shapes; kept at a constant size whatever the zoom. */
  readonly #labels = new Container();
  /** Which way each placed piece is turned: a door swings, an air conditioner blows. */
  readonly #arrows = new Container();
  #props: EditorProps | null = null;
  #kindName: KindName = kindNameOf("en");
  #hover: Cell | null = null;
  #paintFrom: Cell | null = null;
  #erasing = false;
  #panning = false;
  #pointer: Cell | null = null;

  override async init(host: HTMLElement): Promise<void> {
    await super.init(host);
    this.app.ticker.stop();
    this.world.addChild(this.#arrows, this.#labels, this.#preview);
    this.#listen(this.app.canvas);
  }

  /** Takes the latest draft, tool, brush and language; rebuilds what changed and redraws. */
  sync(props: EditorProps): void {
    const previous = this.#props;
    this.#props = props;
    if (previous?.draft !== props.draft) {
      // Compiling 2000 cells is cheaper than diffing them; the first draft fits the camera to the map.
      this.setTemplate(compileDraft(props.draft), previous === null);
      this.#drawArrows(props.draft);
    }
    if (previous?.kindName !== props.kindName || previous.draft !== props.draft) {
      this.#kindName = props.kindName;
      drawLabels(this.#labels, props.draft, this.#kindName, LABEL, this.camera.scale);
    }
    this.#drawPreview(this.#paintFrom, this.#hover);
  }

  protected override afterCamera(): void {
    // Labels live in world space but must not grow with it, or a zoomed-in office is all text.
    const inverse = 1 / this.camera.scale;
    for (const label of this.#labels.children) {
      label.scale.set(inverse);
    }
    this.app.render();
  }

  #drawArrows(draft: OfficeDraft): void {
    for (const child of this.#arrows.removeChildren()) {
      child.destroy();
    }
    for (const arrow of arrowsOf(draft)) {
      this.#arrows.addChild(arrowGraphic(arrow, ARROW));
    }
  }

  /** The rectangle the pointer is about to affect: a drag, or a piece of furniture's own footprint. */
  #pending(from: Cell | null, to: Cell): LayoutRect {
    const props = this.#props;
    if (props !== null && placesOnClick(props.tool) && !this.#erasing) {
      return ghostAt(props.draft, to, props.tool, props.brush);
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
    for (const child of this.#preview.removeChildren()) {
      child.destroy();
    }
  }

  #drawPreview(from: Cell | null, to: Cell | null): void {
    this.#clearPreview();
    const props = this.#props;
    if (to === null || props === null) {
      this.applyCamera();
      return;
    }
    const colour = this.#erasing ? PREVIEW_ERASE : PREVIEW_ADD;
    const { x, y, w, h } = this.#pending(from, to);
    const edge = { color: from === null ? HOVER : colour, width: 2 / this.camera.scale };
    this.#preview.addChild(
      new Graphics()
        .rect(x * CELL_PX, y * CELL_PX, w * CELL_PX, h * CELL_PX)
        .fill(colour)
        .stroke(edge),
    );
    // The placeholder already shows which way the piece opens or faces.
    if (!this.#erasing && turns(props.tool, props.brush.object)) {
      this.#preview.addChild(arrowGraphic(arrowFor({ x, y, w, h }, props.brush.facing), HOVER));
    }
    this.applyCamera();
  }

  #listen(canvas: HTMLCanvasElement): void {
    canvas.addEventListener("contextmenu", (event) => {
      event.preventDefault();
    });
    canvas.addEventListener("pointerdown", (event) => {
      // Left paints, right erases, the middle button and shift pan.
      this.#panning = event.button === 1 || event.shiftKey;
      this.#erasing = !this.#panning && event.button === 2;
      if (!this.#panning) {
        this.#paintFrom = this.cellAt(event);
        this.#drawPreview(this.#paintFrom, this.#paintFrom);
      }
      this.#pointer = { x: event.clientX, y: event.clientY };
      // Capture last: painting must not depend on the browser granting it.
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove", (event) => {
      const cell = this.cellAt(event);
      this.#hover = cell;
      if (this.#panning && this.#pointer !== null) {
        this.camera.panBy(event.clientX - this.#pointer.x, event.clientY - this.#pointer.y);
        this.#pointer = { x: event.clientX, y: event.clientY };
        this.applyCamera();
        return;
      }
      this.#drawPreview(this.#paintFrom, cell);
    });
    canvas.addEventListener("pointerup", (event) => {
      const props = this.#props;
      const from = this.#paintFrom;
      const to = this.cellAt(event);
      this.#paintFrom = null;
      this.#panning = false;
      this.#clearPreview();
      if (props !== null && from !== null && to !== null) {
        const clicked = from.x === to.x && from.y === to.y;
        if (this.#erasing && clicked && placesOnClick(props.tool)) {
          props.onRotate();
        } else {
          // Doors and furniture are placed where the pointer was released, never dragged out.
          const rect =
            placesOnClick(props.tool) && !this.#erasing
              ? { x: to.x, y: to.y, w: 1, h: 1 }
              : this.#pending(from, to);
          props.onPaint(rect, this.#erasing);
        }
      }
      this.#erasing = false;
      this.applyCamera();
    });
    canvas.addEventListener("pointerleave", () => {
      this.#hover = null;
      this.#clearPreview();
      this.applyCamera();
    });
  }
}
