import { Container } from "pixi.js";
import { useEffect, useRef, useState, type RefObject } from "react";
import { OfficeScene } from "../office/scene.ts";
import { SpriteLibrary } from "../office/sprites.ts";
import { PlanView } from "./plan-view.ts";
import type { LabSession } from "./session.ts";

export type LabRuntime = {
  host: RefObject<HTMLDivElement | null>;
  runtime: RefObject<{ session: LabSession; scene: OfficeScene; view: PlanView } | null>;
  paused: RefObject<boolean>;
  ready: boolean;
  error: string | null;
  status: string;
};
export function useLabRuntime(session: LabSession): LabRuntime {
  const host = useRef<HTMLDivElement>(null);
  const runtime = useRef<LabRuntime["runtime"]["current"]>(null);
  const paused = useRef(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Načítám náhled…");
  useEffect(() => {
    const element = host.current;
    if (element === null) {
      return undefined;
    }
    const state: { disposed: boolean; scene: OfficeScene | null } = {
      disposed: false,
      scene: null,
    };
    const isDisposed = (): boolean => state.disposed;
    const visibility = (): void => {
      if (document.hidden || paused.current) {
        state.scene?.app.ticker.stop();
      } else {
        state.scene?.app.ticker.start();
      }
    };
    void (async () => {
      const sprites = new SpriteLibrary();
      await sprites.load();
      if (isDisposed()) {
        return;
      }
      const view = new PlanView(session.plan, (point) => {
        session.point(point);
      });
      const scene = new OfficeScene(sprites, (floor) =>
        floor.template.id === session.plan.template.id
          ? view.view
          : { root: new Container(), objects: new Container(), width: 1, height: 1 },
      );
      await scene.init(element);
      if (isDisposed()) {
        scene.destroy();
        return;
      }
      state.scene = scene;
      scene.fitMode = "contain";
      runtime.current = { session, scene, view };
      scene.syncFloors(session.world);
      scene.showFloor(session.plan.template.id);
      let elapsed = 0;
      let previousPath = session.path;
      view.route(previousPath);
      scene.app.ticker.add((ticker) => {
        const dt = Math.min(ticker.deltaMS, 100);
        session.advance(dt);
        view.update(session.world, session.actor, dt);
        if (previousPath !== session.path) {
          previousPath = session.path;
          view.route(previousPath);
        }
        scene.update(session.world, () => "Alex", session.actor.id);
        elapsed += dt;
        if (elapsed >= 150) {
          elapsed = 0;
          setStatus(
            `${session.message} · ${session.actor.hidden ? "výtah jede" : session.actor.activity === "type" ? "pracuji" : session.actor.activity === "walk" ? "na cestě" : "na místě"}`,
          );
        }
      });
      Object.assign(window, { __officeLab: { session, scene, view } });
      document.addEventListener("visibilitychange", visibility);
      visibility();
      setReady(true);
    })().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : String(e));
    });
    return () => {
      state.disposed = true;
      document.removeEventListener("visibilitychange", visibility);
      state.scene?.destroy();
      runtime.current = null;
      Reflect.deleteProperty(window, "__officeLab");
    };
  }, [session]);

  return { host, runtime, paused, ready, error, status };
}
