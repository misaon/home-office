import type { AgentId } from "@ho/protocol";
import { OFFICE_FLOOR_ID } from "@ho/sim";
import { useEffect, useRef } from "react";
import { useUi } from "../store.ts";
import { createPlanView } from "./plan-view.ts";
import { bridge, sprites } from "./runtime.ts";
import { OfficeScene } from "./scene.ts";

const nameOf = (id: AgentId): string => bridge.nameOf(id);

/** Mounts the PixiJS office once, ticks the simulation at the render rate and pauses when hidden. */
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
    void (async () => {
      await sprites.load();
      useUi.getState().setSpriteSets(sprites.characterSets());
      if (bridge.layoutIssues.length > 0) {
        useUi.getState().setError(`office layout: ${bridge.layoutIssues.join("; ")}`);
      }
      const created = new OfficeScene(sprites, () => createPlanView(bridge.plan, sprites));
      await created.init(element);
      if (state.disposed) {
        created.destroy();
        return;
      }
      state.scene = created;
      created.onSelect = (agentId: AgentId | null) => {
        useUi.getState().selectAgent(agentId);
      };
      Object.assign(window, { __ho: { bridge, sprites, scene: created } });
      created.app.ticker.add((ticker) => {
        try {
          bridge.tick(ticker.deltaMS);
          created.syncFloors(bridge.world);
          created.showFloor(OFFICE_FLOOR_ID);
          created.update(bridge.world, ticker.deltaMS, nameOf, useUi.getState().selectedAgentId);
        } catch (error) {
          useUi.getState().setError(error instanceof Error ? error.message : String(error));
        }
      });
      document.addEventListener("visibilitychange", onVisibility);
      onVisibility();
    })().catch((error: unknown) => {
      reportError(error);
    });
    return () => {
      state.disposed = true;
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
