import { CELL_PX } from "@ho/sim";

/**
 * How close the map can be pulled, in pixels per cell. There is no lower bound of its own: zooming out
 * stops with the whole floor in view, because the floor is sized to fit the pane in the first place.
 */
const ZOOM_IN_MAX = 64;

type Size = { width: number; height: number };

/**
 * Where the map is looked at from. `offset` is the world pixel at the canvas' top-left corner; a map
 * smaller than the canvas is centred instead of clamped, so it can never be lost off-screen.
 */
export class Camera {
  #zoom = ZOOM_IN_MAX;
  #x = 0;
  #y = 0;
  #view: Size = { width: 1, height: 1 };
  #world: Size = { width: 1, height: 1 };

  get zoom(): number {
    return this.#zoom;
  }

  /** World pixels to canvas pixels. */
  get scale(): number {
    return this.#zoom / CELL_PX;
  }

  get offsetX(): number {
    return this.#x;
  }

  get offsetY(): number {
    return this.#y;
  }

  setViewport(width: number, height: number): void {
    this.#view = { width: Math.max(1, width), height: Math.max(1, height) };
    this.#clamp();
  }

  /** The map's size in cells; the camera works in world pixels (`CELL_PX` per cell). */
  setMap(cellsWide: number, cellsHigh: number): void {
    this.#world = { width: cellsWide * CELL_PX, height: cellsHigh * CELL_PX };
    this.#clamp();
  }

  /** Fits the whole map in view and centres it: where a floor starts before anybody touches the camera. */
  fit(): void {
    this.#zoom = this.#fitZoom();
    this.#clamp();
  }

  /** The zoom at which the whole floor is visible; also the furthest the camera can be pulled back. */
  #fitZoom(): number {
    const byWidth = this.#view.width / this.#world.width;
    const byHeight = this.#view.height / this.#world.height;
    return Math.min(byWidth, byHeight) * CELL_PX;
  }

  /** Drag: the map follows the pointer, so the offset moves against it. */
  panBy(dxCanvas: number, dyCanvas: number): void {
    this.#x -= dxCanvas / this.scale;
    this.#y -= dyCanvas / this.scale;
    this.#clamp();
  }

  /** Wheel: the world point under the cursor stays under the cursor. */
  zoomBy(factor: number, canvasX: number, canvasY: number): void {
    const floor = this.#fitZoom();
    const next = clamp(this.#zoom * factor, floor, Math.max(ZOOM_IN_MAX, floor));
    if (next === this.#zoom) {
      return;
    }
    const worldX = this.#x + canvasX / this.scale;
    const worldY = this.#y + canvasY / this.scale;
    this.#zoom = next;
    this.#x = worldX - canvasX / this.scale;
    this.#y = worldY - canvasY / this.scale;
    this.#clamp();
  }

  #clamp(): void {
    const floor = this.#fitZoom();
    this.#zoom = clamp(this.#zoom, floor, Math.max(ZOOM_IN_MAX, floor));
    this.#x = clampAxis(this.#x, this.#view.width / this.scale, this.#world.width);
    this.#y = clampAxis(this.#y, this.#view.height / this.scale, this.#world.height);
  }
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

/** Inside the map, or centred when the map is smaller than the view. */
const clampAxis = (offset: number, view: number, world: number): number =>
  world <= view ? (world - view) / 2 : clamp(offset, 0, world - view);
