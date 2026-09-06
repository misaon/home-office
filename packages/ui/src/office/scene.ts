import type { AgentId } from "@ho/protocol";
import type { Actor, Floor, FloorTemplate, World } from "@ho/sim";
import { Application, Container, Sprite, Text, type Texture } from "pixi.js";
import type { SpriteLibrary } from "./sprites.ts";

const TILE = 16;
const LABEL_STYLE = {
  fontFamily: "monospace",
  fontSize: 6,
  fill: "#ffffff",
  stroke: { color: "#000000", width: 2 },
};

export type FloorView = { root: Container; objects: Container; width: number; height: number };
type SceneFrame = { x: number; y: number; width: number; height: number };
type ActorView = {
  root: Container;
  body: Sprite;
  bubble: Sprite;
  label: Text;
  floorId: string;
  clipKey: string;
};

/** Which of the nine autotile pieces a wall cell shows, from its wall neighbours. */
function wallPiece(t: FloorTemplate, x: number, y: number): number {
  const wall = (px: number, py: number): boolean =>
    px >= 0 && py >= 0 && px < t.width && py < t.height && t.walls[py * t.width + px] === 1;
  const row = wall(x, y - 1) ? (wall(x, y + 1) ? 1 : 2) : 0;
  const col = wall(x - 1, y) ? (wall(x + 1, y) ? 1 : 2) : 0;
  return row * 3 + col;
}

/** PixiJS view of the office: baked tiles per floor, z-sorted furniture and characters, bubbles. */
export class OfficeScene {
  readonly app = new Application();
  readonly #sprites: SpriteLibrary;
  readonly #stage = new Container();
  readonly #floors = new Map<string, FloorView>();
  readonly #actors = new Map<AgentId, ActorView>();
  #current: string | null = null;
  readonly #floorRenderer: ((floor: Floor) => FloorView) | undefined;
  frame: SceneFrame | null = null;
  fitMode: "pixels" | "contain" = "pixels";
  onSelect: (agentId: AgentId | null) => void = () => undefined;

  constructor(sprites: SpriteLibrary, floorRenderer?: (floor: Floor) => FloorView) {
    this.#sprites = sprites;
    this.#floorRenderer = floorRenderer;
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

  #texture(key: string, animation: string, frame = 0): Texture | undefined {
    const frames = this.#sprites.frames(key, animation);
    return frames?.[frame % Math.max(1, frames.length)];
  }

  #buildFloor(floor: Floor): FloorView {
    const t = floor.template;
    const root = new Container({ visible: false });
    const tiles = new Container();
    for (let y = 0; y < t.height; y += 1) {
      for (let x = 0; x < t.width; x += 1) {
        const floorKey = t.floor[y * t.width + x] ?? null;
        const isWall = t.walls[y * t.width + x] === 1;
        const texture = isWall
          ? this.#texture("tiles/wall-office", "autotile", wallPiece(t, x, y))
          : floorKey === null
            ? undefined
            : this.#texture(floorKey, "static");
        if (texture !== undefined) {
          tiles.addChild(new Sprite({ texture, x: x * TILE, y: y * TILE }));
        }
      }
    }
    tiles.cacheAsTexture(true);
    const objects = new Container({ sortableChildren: true });
    for (const f of t.furniture) {
      const texture = this.#texture(f.sprite, f.animation) ?? this.#texture(f.sprite, "static");
      if (texture !== undefined) {
        const sprite = new Sprite({ texture, x: f.at.x * TILE, y: (f.at.y + f.h) * TILE });
        sprite.anchor.set(0, 1);
        sprite.zIndex = (f.at.y + f.h) * TILE - (f.blocks ? 1 : 3);
        objects.addChild(sprite);
      }
    }
    root.addChild(tiles, objects);
    return { root, objects, width: t.width * TILE, height: t.height * TILE };
  }

  syncFloors(world: World): void {
    for (const [id, floor] of world.floors) {
      if (!this.#floors.has(id)) {
        const view = this.#floorRenderer?.(floor) ?? this.#buildFloor(floor);
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

  #fit(view: FloorView): void {
    const { width, height } = this.app.screen;
    const frame = this.frame ?? { x: 0, y: 0, width: view.width, height: view.height };
    const fit = Math.min(width / frame.width, height / frame.height);
    const scale =
      this.fitMode === "contain"
        ? fit
        : fit >= 1
          ? Math.floor(fit)
          : 1 / Math.ceil(1 / Math.max(fit, 0.001));
    this.#stage.scale.set(scale);
    this.#stage.position.set(
      Math.floor((width - frame.width * scale) / 2 - frame.x * scale),
      Math.floor((height - frame.height * scale) / 2 - frame.y * scale),
    );
  }

  #ensureActor(actor: Actor, name: string): ActorView {
    const existing = this.#actors.get(actor.id);
    if (existing !== undefined) {
      existing.label.text = name;
      return existing;
    }
    const root = new Container({ eventMode: "static", cursor: "pointer" });
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
    const view: ActorView = { root, body, bubble, label, floorId: "", clipKey: "" };
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
    const bubbleTexture =
      emotion === null ? undefined : this.#texture(`bubbles/${emotion}`, "static");
    view.bubble.visible = bubbleTexture !== undefined;
    if (bubbleTexture !== undefined && view.bubble.texture !== bubbleTexture) {
      view.bubble.texture = bubbleTexture;
    }
    view.label.style.fill = selected ? "#ffd166" : "#ffffff";
  }

  /** Called every frame with the current world; cheap when nothing moved. */
  update(world: World, names: (id: AgentId) => string, selected: AgentId | null): void {
    const current = this.#current === null ? undefined : this.#floors.get(this.#current);
    if (current !== undefined) {
      this.#fit(current);
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
