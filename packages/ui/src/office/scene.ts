import type { AgentId } from "@ho/protocol";
import type { Actor, Floor, World } from "@ho/sim";
import { Application, Container, Sprite, Text, type Texture } from "pixi.js";
import type { SpriteLibrary } from "./sprites.ts";

const TILE = 16;
const LABEL_STYLE = {
  fontFamily: "monospace",
  fontSize: 6,
  fill: "#ffffff",
  stroke: { color: "#000000", width: 2 },
};

/** What a floor renderer hands the scene: static layers plus the sorted layer actors join. */
export type FloorView = {
  root: Container;
  /** Y-sorted layer for furniture and characters. */
  objects: Container;
  width: number;
  height: number;
  /** Per-frame hook for animated pieces (doors, object states). */
  update?: (world: World, dtMs: number) => void;
};
export type FloorRenderer = (floor: Floor) => FloorView;
/** `fit` shows the whole floor with margins; `fill` covers the canvas and lets the viewer drag the map. */
export type CameraMode = "fit" | "fill";

type ActorView = { root: Container; body: Sprite; bubble: Sprite; label: Text; floorId: string };

/** PixiJS view of the office: floor views from the renderer, z-sorted characters with bubbles and names. */
export class OfficeScene {
  readonly app = new Application();
  readonly #sprites: SpriteLibrary;
  readonly #render: FloorRenderer;
  readonly #stage = new Container();
  readonly #floors = new Map<string, FloorView>();
  readonly #actors = new Map<AgentId, ActorView>();
  #current: string | null = null;
  #camera: CameraMode = "fit";
  /** Drag offset in screen pixels while in `fill` mode; clamped so the floor keeps covering the canvas. */
  readonly #pan = { x: 0, y: 0 };
  #drag: { x: number; y: number; moved: boolean } | null = null;
  onSelect: (agentId: AgentId | null) => void = () => undefined;

  constructor(sprites: SpriteLibrary, render: FloorRenderer) {
    this.#sprites = sprites;
    this.#render = render;
  }

  async init(host: HTMLElement): Promise<void> {
    await this.app.init({
      background: "#0f1115",
      resizeTo: host,
      antialias: false,
      roundPixels: true,
      preference: "webgl",
    });
    this.app.ticker.maxFPS = 30;
    host.append(this.app.canvas);
    this.app.stage.addChild(this.#stage);
    this.app.stage.eventMode = "static";
    this.app.stage.hitArea = this.app.screen;
    this.app.stage.on("pointertap", () => {
      if (this.#drag?.moved !== true) {
        this.onSelect(null);
      }
    });
    // Dragging pans the map in fill mode; a plain click still selects.
    this.app.stage.on("pointerdown", (e) => {
      this.#drag = { x: e.global.x - this.#pan.x, y: e.global.y - this.#pan.y, moved: false };
    });
    this.app.stage.on("globalpointermove", (e) => {
      if (this.#drag !== null && this.#camera === "fill") {
        const x = e.global.x - this.#drag.x;
        const y = e.global.y - this.#drag.y;
        if (Math.abs(x - this.#pan.x) + Math.abs(y - this.#pan.y) > 2) {
          this.#drag.moved = true;
        }
        this.#pan.x = x;
        this.#pan.y = y;
      }
    });
    const release = (): void => {
      this.#drag = null;
    };
    this.app.stage.on("pointerup", release);
    this.app.stage.on("pointerupoutside", release);
  }

  set camera(mode: CameraMode) {
    this.#camera = mode;
    this.#pan.x = 0;
    this.#pan.y = 0;
    this.app.canvas.style.cursor = mode === "fill" ? "grab" : "default";
  }

  get camera(): CameraMode {
    return this.#camera;
  }

  destroy(): void {
    this.app.destroy(true, { children: true });
  }

  syncFloors(world: World): void {
    for (const [id, floor] of world.floors) {
      if (!this.#floors.has(id)) {
        const view = this.#render(floor);
        this.#floors.set(id, view);
        this.#stage.addChild(view.root);
      }
    }
    for (const [id, view] of this.#floors) {
      if (!world.floors.has(id)) {
        view.root.destroy({ children: true });
        this.#floors.delete(id);
      }
    }
  }

  showFloor(id: string): void {
    this.#current = id;
    for (const [floorId, view] of this.#floors) {
      view.root.visible = floorId === id;
    }
  }

  /**
   * Camera. `fit`: integer zoom when the whole floor fits (crisp pixels), otherwise scaled down to fit with
   * margins. `fill`: the floor covers the whole canvas (largest of the two ratios, integer when possible) and
   * the viewer drags to see the rest; the pan is clamped so no background shows.
   */
  #fit(view: FloorView): void {
    const { width, height } = this.app.screen;
    const ratioX = width / view.width;
    const ratioY = height / view.height;
    const cover = Math.max(ratioX, ratioY);
    const contain = Math.min(ratioX, ratioY);
    const scale =
      this.#camera === "fill"
        ? cover >= 1
          ? Math.ceil(cover)
          : cover
        : contain >= 1
          ? Math.floor(contain)
          : contain;
    const scaledW = view.width * scale;
    const scaledH = view.height * scale;
    const centerX = (width - scaledW) / 2;
    const centerY = (height - scaledH) / 2;
    if (this.#camera === "fill") {
      // Only the overflowing axis pans; the offset never reveals the canvas background.
      const slackX = Math.max(0, (scaledW - width) / 2);
      const slackY = Math.max(0, (scaledH - height) / 2);
      this.#pan.x = Math.max(-slackX, Math.min(slackX, this.#pan.x));
      this.#pan.y = Math.max(-slackY, Math.min(slackY, this.#pan.y));
    }
    this.#stage.scale.set(scale);
    this.#stage.position.set(Math.floor(centerX + this.#pan.x), Math.floor(centerY + this.#pan.y));
  }

  #ensureActor(actor: Actor, name: string): ActorView {
    const existing = this.#actors.get(actor.id);
    if (existing !== undefined) {
      existing.label.text = name;
      return existing;
    }
    const selectable = actor.kind === "agent";
    const root = new Container({
      eventMode: selectable ? "static" : "none",
      cursor: selectable ? "pointer" : "default",
    });
    const body = new Sprite();
    body.anchor.set(0.5, 1);
    const bubble = new Sprite({ visible: false, y: -34 });
    bubble.anchor.set(0.5, 1);
    const label = new Text({ text: name, style: LABEL_STYLE, resolution: 4, y: 1 });
    label.anchor.set(0.5, 0);
    root.addChild(body, bubble, label);
    root.on("pointertap", (e) => {
      e.stopPropagation();
      this.onSelect(actor.id);
    });
    const view: ActorView = { root, body, bubble, label, floorId: "" };
    this.#actors.set(actor.id, view);
    return view;
  }

  #placeActor(actor: Actor, view: ActorView, selected: boolean): void {
    if (view.floorId !== actor.floorId) {
      view.root.removeFromParent();
      this.#floors.get(actor.floorId)?.objects.addChild(view.root);
      view.floorId = actor.floorId;
    }
    view.root.visible = !actor.hidden && actor.floorId === this.#current;
    view.root.position.set(
      Math.round(actor.pos.x * TILE + TILE / 2),
      Math.round(actor.pos.y * TILE + TILE),
    );
    view.root.zIndex = actor.pos.y * TILE + TILE;
    const clip = this.#sprites.clip(actor.sprite, actor.activity, actor.facing);
    if (clip !== null) {
      const frame = Math.floor(actor.animTime / clip.frameMs) % clip.textures.length;
      const texture = clip.textures[frame];
      if (texture !== undefined && view.body.texture !== texture) {
        view.body.texture = texture;
      }
      view.body.scale.x = clip.flip ? -1 : 1;
    }
    const emotion = actor.emotion?.kind ?? null;
    const bubbleTexture: Texture | undefined =
      emotion === null ? undefined : this.#sprites.frames(`bubbles/${emotion}`, "static")?.[0];
    view.bubble.visible = bubbleTexture !== undefined;
    if (bubbleTexture !== undefined && view.bubble.texture !== bubbleTexture) {
      view.bubble.texture = bubbleTexture;
    }
    view.label.style.fill = selected ? "#ffd166" : "#ffffff";
  }

  /** Called every frame with the current world; cheap when nothing moved. */
  update(
    world: World,
    dtMs: number,
    names: (id: AgentId) => string,
    selected: AgentId | null,
  ): void {
    const current = this.#current === null ? undefined : this.#floors.get(this.#current);
    if (current !== undefined) {
      this.#fit(current);
      current.update?.(world, dtMs);
    }
    for (const actor of world.actors.values()) {
      this.#placeActor(actor, this.#ensureActor(actor, names(actor.id)), actor.id === selected);
    }
    for (const [id, view] of this.#actors) {
      if (!world.actors.has(id)) {
        view.root.destroy({ children: true });
        this.#actors.delete(id);
      }
    }
  }
}
