import { CELL_PX } from "@ho/sim";

const ZOOM_IN_MAX = 64;

type Size = { width: number; height: number };

export type CameraPose = { zoom: number; x: number; y: number };

const POSE_PREFIX = "ho.camera.";

export const readPose = (floorId: string): CameraPose | null => {
  try {
    const raw = window.localStorage.getItem(`${POSE_PREFIX}${floorId}`);
    if (raw === null) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" &&
      parsed !== null &&
      "zoom" in parsed &&
      typeof parsed.zoom === "number" &&
      "x" in parsed &&
      typeof parsed.x === "number" &&
      "y" in parsed &&
      typeof parsed.y === "number"
      ? { zoom: parsed.zoom, x: parsed.x, y: parsed.y }
      : null;
  } catch {
    return null;
  }
};

export const writePose = (floorId: string, pose: CameraPose): void => {
  try {
    window.localStorage.setItem(`${POSE_PREFIX}${floorId}`, JSON.stringify(pose));
  } catch {}
};

export class Camera {
  #zoom = ZOOM_IN_MAX;
  #x = 0;
  #y = 0;
  #view: Size = { width: 1, height: 1 };
  #world: Size = { width: 1, height: 1 };

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

  setMap(cellsWide: number, cellsHigh: number): void {
    this.#world = { width: cellsWide * CELL_PX, height: cellsHigh * CELL_PX };
    this.#clamp();
  }

  fit(): void {
    this.#zoom = this.#fitZoom();
    this.#clamp();
  }

  get pose(): CameraPose {
    return { zoom: this.#zoom, x: this.#x, y: this.#y };
  }

  restore(pose: CameraPose): void {
    this.#zoom = pose.zoom;
    this.#x = pose.x;
    this.#y = pose.y;
    this.#clamp();
  }

  get percent(): number {
    return Math.round((this.#zoom / this.#fitZoom()) * 100);
  }

  zoomStep(factor: number): void {
    this.zoomBy(factor, this.#view.width / 2, this.#view.height / 2);
  }

  cellAt(canvasX: number, canvasY: number): { x: number; y: number } {
    return {
      x: Math.floor((this.#x + canvasX / this.scale) / CELL_PX),
      y: Math.floor((this.#y + canvasY / this.scale) / CELL_PX),
    };
  }

  #fitZoom(): number {
    const byWidth = this.#view.width / this.#world.width;
    const byHeight = this.#view.height / this.#world.height;
    return Math.min(byWidth, byHeight) * CELL_PX;
  }

  centreOn(worldX: number, worldY: number): void {
    this.#x = worldX - this.#view.width / this.scale / 2;
    this.#y = worldY - this.#view.height / this.scale / 2;
    this.#clamp();
  }

  panBy(dxCanvas: number, dyCanvas: number): void {
    this.#x -= dxCanvas / this.scale;
    this.#y -= dyCanvas / this.scale;
    this.#clamp();
  }

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

const clampAxis = (offset: number, view: number, world: number): number =>
  world <= view ? (world - view) / 2 : clamp(offset, 0, world - view);
