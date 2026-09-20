import { type AgentId, errorMessage } from "@ho/protocol";
import { t } from "i18next";
import { type Actor, CELL_PX, type World } from "@ho/sim";
import { Container, Graphics } from "pixi.js";
import { type Badge, captionOf, makeBadge, updateBadge } from "./badge.ts";
import { useDesign } from "../design/store.ts";
import { useUi } from "../store.ts";
import { bridge } from "./bridge.ts";
import { DOT, DOT_EDGE, DOT_SELECTED } from "./colours.ts";
import { MapView } from "./map-view.ts";

const DOT_RADIUS = CELL_PX;
const DRAG_SLOP_PX = 4;

type DotView = { root: Container; shape: Graphics; badge: Badge; selected: boolean };

const paint = (shape: Graphics, selected: boolean): void => {
  shape
    .clear()
    .circle(0, 0, DOT_RADIUS)
    .fill(selected ? DOT_SELECTED : DOT)
    .stroke({ color: DOT_EDGE, width: 1 });
};

class OfficeScene extends MapView {
  readonly #dots = new Map<AgentId, DotView>();
  #drag: { x: number; y: number; moved: boolean } | null = null;
  onSelect: (agentId: AgentId | null) => void = () => undefined;

  override async init(host: HTMLElement): Promise<void> {
    await super.init(host);
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
        setTimeout(() => {
          this.#drag = null;
        }, 0);
      });
    }
  }

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
      const at = bridge.positionOf(actor);
      dot.root.position.set((at.x + 0.5) * CELL_PX, (at.y + 0.5) * CELL_PX);
      const isSelected = actor.id === selected;
      if (dot.selected !== isSelected) {
        dot.selected = isSelected;
        paint(dot.shape, isSelected);
      }
      const said = captionOf(actor);
      dot.badge.root.visible = said !== null;
      if (said !== null) {
        updateBadge(dot.badge, said, elapsedMs, this.camera.scale);
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

const ZOOM_STEP = 1.3;

export type OfficeHandle = {
  stop: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
  follow: (agentId: AgentId | null) => void;
  following: () => AgentId | null;
  percent: () => number;
};

export function startOffice(host: HTMLElement): OfficeHandle {
  const scene = new OfficeScene();
  let disposed = false;
  let toldTheHuman = false;
  const report = (error: unknown): void => {
    if (!toldTheHuman) {
      toldTheHuman = true;
      useDesign.getState().flash(t("app.officeFailed", { message: errorMessage(error) }));
    }
  };
  let followed: AgentId | null = null;
  let unsubscribe: (() => void) | null = null;
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
        if (actor !== undefined && !actor.hidden && actor.floorId === floorId) {
          const at = bridge.positionOf(actor);
          scene.centreOnWorld((at.x + 0.5) * CELL_PX, (at.y + 0.5) * CELL_PX);
        }
      }
    } catch (error) {
      report(error);
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
      bridge.setWatching(false);
      if (!disposed) {
        report(error);
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
