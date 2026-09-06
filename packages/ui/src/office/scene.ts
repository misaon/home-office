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
      this.onSelect(null);
    });
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
   * Camera: integer zoom when the whole floor fits (crisp pixels), otherwise scale down to fit — the office is
   * 1280×736 native and most windows are smaller once the side panel is open.
   */
  #fit(view: FloorView): void {
    const { width, height } = this.app.screen;
    const fit = Math.min(width / view.width, height / view.height);
    const scale = fit >= 1 ? Math.floor(fit) : fit;
    this.#stage.scale.set(scale);
    this.#stage.position.set(
      Math.floor((width - view.width * scale) / 2),
      Math.floor((height - view.height * scale) / 2),
    );
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
