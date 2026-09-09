import { type AgentId, errorMessage } from "@ho/protocol";
import * as sim from "@ho/sim";
import { useEffect, useRef } from "react";
import { useUi } from "../store.ts";
import { createPlanView } from "./plan-view.ts";
import { bridge, sprites } from "./runtime.ts";
import { OfficeScene } from "./scene.ts";

const nameOf = (id: AgentId): string => bridge.nameOf(id);

export function OfficeCanvas(): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null);
  const connection = useUi((s) => s.connection);
  const lastError = useUi((s) => s.lastError);

  useEffect(() => {
    const element = host.current;
    if (element === null) {
      return undefined;
    }
    const state: {
      scene: OfficeScene | null;
      disposed: boolean;
      unsubscribe: (() => void) | null;
    } = {
      scene: null,
      disposed: false,
      unsubscribe: null,
    };
    const onVisibility = (): void => {
      if (state.scene === null) {
        return;
      }
      bridge.setWatching(!document.hidden);
      if (document.hidden) {
        state.scene.app.ticker.stop();
      } else {
        state.scene.app.ticker.start();
      }
    };
    const isDisposed = (): boolean => state.disposed;
    void (async () => {
      await sprites.load();
      if (isDisposed()) {
        return;
      }
      useUi.getState().setSpriteSets(sprites.characterSets());
      if (bridge.layoutIssues.length > 0) {
        useUi.getState().setError(`office layout: ${bridge.layoutIssues.join("; ")}`);
      }
      const created = new OfficeScene(sprites, (floorId) =>
        createPlanView(bridge.planFor(floorId), sprites, (issue) => {
          useUi.getState().setError(`sprite: ${issue}`);
        }),
      );
      await created.init(element);
      if (isDisposed()) {
        created.destroy();
        return;
      }
      state.scene = created;
      created.onSelect = (agentId: AgentId | null) => {
        useUi.getState().selectAgent(agentId);
      };
      // Dev console handle: the bridge, the sprite library, the scene and the simulation's intents.
      if (process.env.NODE_ENV === "development") {
        Object.assign(window, { __ho: { bridge, sprites, scene: created, sim, store: useUi } });
      }
      const drawFrame = (dtMs: number): void => {
        try {
          bridge.tick(dtMs);
          created.syncFloors(bridge.world);
          created.showFloor(bridge.world, useUi.getState().floorId);
          created.update(bridge.world, dtMs, nameOf, useUi.getState().selectedAgentId);
        } catch (error) {
          useUi.getState().setError(errorMessage(error));
        }
      };
      created.app.ticker.add((ticker) => {
        drawFrame(ticker.deltaMS);
      });
      const stillFrame = (): void => {
        if (isDisposed() || !document.hidden) {
          return;
        }
        drawFrame(0);
        created.app.render();
      };
      state.unsubscribe = useUi.subscribe(stillFrame);
      stillFrame();
      document.addEventListener("visibilitychange", onVisibility);
      onVisibility();
    })().catch((error: unknown) => {
      if (!isDisposed()) {
        useUi.getState().setError(errorMessage(error));
      }
      reportError(error);
    });
    return () => {
      state.disposed = true;
      bridge.setWatching(false);
      state.unsubscribe?.();
      document.removeEventListener("visibilitychange", onVisibility);
      state.scene?.destroy();
    };
  }, []);

  return (
    <div className="relative h-full w-full overflow-x-hidden overflow-y-auto bg-ink">
      <div ref={host} className="h-full w-full" />
      {lastError !== null ? (
        <div className="absolute inset-x-0 top-0 bg-red-900/80 px-3 py-1 font-mono text-xs text-red-100">
          {lastError}
        </div>
      ) : null}
      {connection !== "online" ? (
        <div className="absolute inset-x-0 bottom-0 bg-black/60 px-3 py-1 text-xs text-amber-200">
          {connection === "unauthorized"
            ? "No daemon token. Open the office with `ho ui`."
            : connection === "offline"
              ? "Daemon offline — retrying…"
              : "Connecting to the daemon…"}
        </div>
      ) : null}
    </div>
  );
}
