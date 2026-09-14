import { isSessionActive, type AgentId, errorMessage } from "@ho/protocol";
import { type Actor, CELL_PX, type World } from "@ho/sim";
import { Container, Graphics } from "pixi.js";
import { type Badge, makeBadge, updateBadge } from "./badge.ts";
import { useUi } from "../store.ts";
import { bridge } from "./bridge.ts";
import { DOT, DOT_EDGE, DOT_SELECTED } from "./colours.ts";
import { MapView } from "./map-view.ts";

/**
 * An employee is two cells across — 50 cm at roughly 25 cm per cell, the same as the chair they sit on
 * and the doorway they walk through. Movement itself is still one cell at a time: a two-by-two body is
 * not yet what the path search reserves.
 */
const DOT_RADIUS = CELL_PX;
/** How far the pointer may travel before a click counts as a drag instead of a selection. */
const DRAG_SLOP_PX = 4;

type DotView = { root: Container; shape: Graphics; badge: Badge; selected: boolean };

/** What the pill under a colleague says, and whether the office draws them as working. */
function captionOf(agentId: AgentId): { caption: string; busy: boolean } | null {
  const { snapshot } = useUi.getState();
  const agent = snapshot.agents.get(agentId);
  if (agent === undefined) {
    return null;
  }
  const busy = [...snapshot.sessions.values()].some(
    (session) => session.agentId === agentId && isSessionActive(session.state),
  );
  return { caption: `${agent.name} · ${busy ? "working" : "idle"}`, busy };
}

const paint = (shape: Graphics, selected: boolean): void => {
  shape
    .clear()
    .circle(0, 0, DOT_RADIUS)
    .fill(selected ? DOT_SELECTED : DOT)
    .stroke({ color: DOT_EDGE, width: 1 });
};

/**
 * PixiJS view of the office: the compiled floor, and one dot per character. Zoom with the wheel, drag to
 * pan, tap a dot to select its agent; nothing here places anything — layouts are written in code.
 */
class OfficeScene extends MapView {
  readonly #dots = new Map<AgentId, DotView>();
  #drag: { x: number; y: number; moved: boolean } | null = null;
  onSelect: (agentId: AgentId | null) => void = () => undefined;

  override async init(host: HTMLElement): Promise<void> {
    await super.init(host);
    this.app.ticker.maxFPS = 30;
    this.app.stage.eventMode = "static";
    this.app.stage.hitArea = this.app.screen;
    this.app.stage.on("pointertap", () => {
      if (this.#drag?.moved !== true) {
        this.onSelect(null);
      }
    });
    this.#listen(this.app.canvas);
  }

  override destroy(): void {
    this.#dots.clear();
    super.destroy();
  }

  /** Dragging pans. Native listeners: the map is one surface, not widgets. */
  #listen(canvas: HTMLCanvasElement): void {
    canvas.addEventListener("pointerdown", (event) => {
      this.#drag = { x: event.clientX, y: event.clientY, moved: false };
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove", (event) => {
      const drag = this.#drag;
      if (drag === null) {
        return;
      }
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < DRAG_SLOP_PX) {
        return;
      }
      drag.moved = true;
      drag.x = event.clientX;
      drag.y = event.clientY;
      this.camera.panBy(dx, dy);
      this.applyCamera();
      canvas.style.cursor = "grabbing";
    });
    for (const kind of ["pointerup", "pointercancel"]) {
      canvas.addEventListener(kind, () => {
        canvas.style.cursor = "";
        // The tap handler runs after this, so the flag has to outlive the release for one turn.
        setTimeout(() => {
          this.#drag = null;
        }, 0);
      });
    }
  }

  /** Which floor's map and characters are shown; a new floor is built and fitted, the same one is kept. */
  showFloor(floorId: string | null): void {
    const template = floorId === null ? undefined : bridge.world.floors.get(floorId)?.template;
    if (template === undefined || template === this.template) {
      return;
    }
    this.setTemplate(template, true);
  }

  #ensureDot(actor: Actor): DotView {
    const existing = this.#dots.get(actor.id);
    if (existing !== undefined) {
      return existing;
    }
    const shape = new Graphics({ eventMode: "static", cursor: "pointer" });
    paint(shape, false);
    shape.on("pointertap", (e) => {
      e.stopPropagation();
      if (this.#drag?.moved !== true) {
        this.onSelect(actor.id);
      }
    });
    const badge = makeBadge();
    const root = new Container();
    root.addChild(badge.root, shape);
    this.world.addChild(root);
    const view: DotView = { root, shape, badge, selected: false };
    this.#dots.set(actor.id, view);
    return view;
  }

  /** Called every frame with the current world: one dot per visible character of the shown floor. */
  update(world: World, selected: AgentId | null, elapsedMs: number): void {
    const floorId = this.template?.id ?? null;
    for (const actor of world.actors.values()) {
      const view = this.#dots.get(actor.id);
      if (actor.floorId !== floorId || actor.hidden) {
        if (view !== undefined) {
          view.root.visible = false;
        }
        continue;
      }
      const dot = view ?? this.#ensureDot(actor);
      dot.root.visible = true;
      dot.root.position.set((actor.pos.x + 0.5) * CELL_PX, (actor.pos.y + 0.5) * CELL_PX);
      const isSelected = actor.id === selected;
      if (dot.selected !== isSelected) {
        dot.selected = isSelected;
        paint(dot.shape, isSelected);
      }
      // Lola keeps the counter and carries no agent of her own, so she wears no pill.
      const said = captionOf(actor.id);
      dot.badge.root.visible = said !== null;
      if (said !== null) {
        updateBadge(dot.badge, said.caption, said.busy, elapsedMs, this.camera.scale);
      }
    }
    for (const [id, view] of this.#dots) {
      if (!world.actors.has(id)) {
        view.root.destroy({ children: true });
        this.#dots.delete(id);
      }
    }
  }
}

/**
 * Runs the office in `host` until the returned function is called: the scene, the simulation tick on the
 * Pixi ticker (stopped while the document is hidden, where a still frame is drawn on every store change
 * instead), the visibility watch and the dev console handle.
 */
/** One press of the camera bar's + or −. */
const ZOOM_STEP = 1.3;

/** What React can do to the office once it is running: the camera, and stopping it. */
export type OfficeHandle = {
  stop: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
  /** Keeps the camera on one colleague until it is called with null. */
  follow: (agentId: AgentId | null) => void;
  following: () => AgentId | null;
  /** How close the floor is, for the camera bar's read-out. */
  percent: () => number;
};

export function startOffice(host: HTMLElement): OfficeHandle {
  const scene = new OfficeScene();
  let disposed = false;
  let followed: AgentId | null = null;
  let unsubscribe: (() => void) | null = null;
  // The ring under a working colleague runs on the office's own clock, not the document's.
  let elapsedMs = 0;
  const drawFrame = (dtMs: number): void => {
    try {
      bridge.tick(dtMs);
      elapsedMs += dtMs;
      const { floorId, selectedAgentId } = useUi.getState();
      scene.showFloor(floorId);
      scene.update(bridge.world, selectedAgentId, elapsedMs);
      if (followed !== null) {
        const actor = bridge.world.actors.get(followed);
        if (actor !== undefined && !actor.hidden) {
          scene.centreOnWorld((actor.pos.x + 0.5) * CELL_PX, (actor.pos.y + 0.5) * CELL_PX);
        }
      }
    } catch (error) {
      useUi.getState().setError(errorMessage(error));
    }
  };
  const stillFrame = (): void => {
    if (!disposed && document.hidden) {
      drawFrame(0);
      scene.app.render();
    }
  };
  const onVisibility = (): void => {
    bridge.setWatching(!document.hidden);
    if (document.hidden) {
      scene.app.ticker.stop();
    } else {
      scene.app.ticker.start();
    }
  };
  void scene
    .init(host)
    .then(() => {
      if (disposed) {
        return;
      }
      scene.onSelect = (agentId) => {
        useUi.getState().selectAgent(agentId);
      };
      if (process.env.NODE_ENV === "development") {
        Object.assign(window, { __ho: { bridge, scene, store: useUi } });
      }
      scene.app.ticker.add((ticker) => {
        drawFrame(ticker.deltaMS);
      });
      unsubscribe = useUi.subscribe(stillFrame);
      stillFrame();
      document.addEventListener("visibilitychange", onVisibility);
      onVisibility();
    })
    .catch((error: unknown) => {
      // No office to watch: the daemon must not wait for walks that will never be drawn.
      bridge.setWatching(false);
      if (!disposed) {
        useUi.getState().setError(errorMessage(error));
      }
    });
  return {
    stop: () => {
      disposed = true;
      bridge.setWatching(false);
      unsubscribe?.();
      document.removeEventListener("visibilitychange", onVisibility);
      scene.destroy();
    },
    zoomIn: () => {
      scene.zoomView(ZOOM_STEP);
    },
    zoomOut: () => {
      scene.zoomView(1 / ZOOM_STEP);
    },
    fit: () => {
      followed = null;
      scene.fitView();
    },
    follow: (agentId) => {
      followed = agentId;
    },
    following: () => followed,
    percent: () => scene.camera.percent,
  };
}
