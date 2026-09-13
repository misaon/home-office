import "pixi.js/unsafe-eval";
import type { FloorTemplate } from "@ho/sim";
import { Application, Container, Graphics } from "pixi.js";
import { Camera } from "./camera.ts";
import { floorTiles, gridLines } from "./tiles.ts";

const WHEEL_STEP = 1.15;

/**
 * What the office view and the editor's canvas share: a Pixi application in a host element, a camera the
 * wheel zooms around the cursor, the compiled floor's tiles with the grid drawn over them at the current
 * zoom, and a resize observer. Subclasses add characters or editing on top of `world`.
 */
export class MapView {
  readonly app = new Application();
  readonly camera = new Camera();
  protected readonly world = new Container();
  readonly #tiles = new Container();
  #grid = new Graphics();
  #gridScale = 0;
  #template: FloorTemplate | null = null;
  #host: HTMLElement | null = null;
  #observer: ResizeObserver | null = null;
  #ready: Promise<void> = Promise.resolve();
  #destroyed = false;

  async init(host: HTMLElement): Promise<void> {
    this.#host = host;
    const started = this.#start(host);
    this.#ready = started.catch(() => undefined);
    await started;
  }

  async #start(host: HTMLElement): Promise<void> {
    await this.app.init({
      background: "#eceae4",
      width: Math.max(1, host.clientWidth),
      height: Math.max(1, host.clientHeight),
      antialias: true,
      preference: "webgl",
      resolution: window.devicePixelRatio,
      autoDensity: true,
    });
    host.append(this.app.canvas);
    this.app.stage.addChild(this.world);
    this.world.addChild(this.#tiles, this.#grid);
    this.camera.setViewport(this.app.screen.width, this.app.screen.height);
    this.app.canvas.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        const box = this.app.canvas.getBoundingClientRect();
        this.camera.zoomBy(
          event.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP,
          event.clientX - box.left,
          event.clientY - box.top,
        );
        this.applyCamera();
      },
      { passive: false },
    );
    this.#observer = new ResizeObserver(() => {
      this.#resize();
    });
    this.#observer.observe(host);
  }

  /**
   * Idempotent, and safe before `init` has resolved: a Pixi application has no renderer to destroy until
   * then, so destruction waits for the start to settle rather than throwing out of React's cleanup.
   */
  destroy(): void {
    if (this.#destroyed) {
      return;
    }
    this.#destroyed = true;
    void this.#ready.then(() => {
      this.#observer?.disconnect();
      this.app.destroy(true, { children: true });
    });
  }

  get template(): FloorTemplate | null {
    return this.#template;
  }

  /** Shows a compiled floor; `fit` puts the whole of it in view (a new floor), otherwise the camera stays. */
  protected setTemplate(template: FloorTemplate, fit: boolean): void {
    this.#template = template;
    for (const child of this.#tiles.removeChildren()) {
      child.destroy({ children: true });
    }
    this.#tiles.addChild(floorTiles(template));
    this.camera.setMap(template.map.width, template.map.height);
    if (fit) {
      this.camera.fit();
    }
    this.#gridScale = 0;
    this.applyCamera();
  }

  /** The cell under a pointer, or null off the map. */
  protected cellAt(event: { clientX: number; clientY: number }): { x: number; y: number } | null {
    const template = this.#template;
    if (template === null) {
      return null;
    }
    const box = this.app.canvas.getBoundingClientRect();
    const cell = this.camera.cellAt(event.clientX - box.left, event.clientY - box.top);
    return cell.x < 0 || cell.y < 0 || cell.x >= template.map.width || cell.y >= template.map.height
      ? null
      : cell;
  }

  /** Moves the world under the camera and redraws the grid's hairlines at the zoom they are seen at. */
  protected applyCamera(): void {
    const { scale } = this.camera;
    this.world.scale.set(scale);
    this.world.position.set(
      Math.round(-this.camera.offsetX * scale),
      Math.round(-this.camera.offsetY * scale),
    );
    if (this.#gridScale !== scale && this.#template !== null) {
      this.#gridScale = scale;
      const next = gridLines(this.#template.map, scale);
      this.#grid.destroy();
      this.#grid = next;
      // Right above the tiles: characters and previews the subclasses add stay on top of the grid.
      this.world.addChildAt(next, 1);
    }
    this.afterCamera();
  }

  /** For subclasses: the camera moved or zoomed. */
  protected afterCamera(): void {
    // Nothing by default.
  }

  #resize(): void {
    const host = this.#host;
    if (host === null || host.clientWidth === 0 || host.clientHeight === 0) {
      return;
    }
    this.app.renderer.resize(host.clientWidth, host.clientHeight);
    this.app.stage.hitArea = this.app.screen;
    this.camera.setViewport(host.clientWidth, host.clientHeight);
    this.applyCamera();
  }
}
