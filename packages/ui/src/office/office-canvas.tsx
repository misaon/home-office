import type { AgentId } from "@ho/protocol";
import { useEffect, useRef } from "react";
import { model, useUi } from "../store.ts";
import type { World } from "@ho/sim";
import { bridge, sprites } from "./runtime.ts";
import { OfficeScene } from "./scene.ts";

const nameOf = (id: AgentId): string => model.agents.get(id)?.name ?? "?";
const HEADCOUNT_MS = 500;

const headcounts = (world: World): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const actor of world.actors.values()) {
    if (!actor.hidden) {
      counts[actor.floorId] = (counts[actor.floorId] ?? 0) + 1;
    }
  }
  return counts;
};

const sameCounts = (a: Readonly<Record<string, number>>, b: Record<string, number>): boolean =>
  Object.keys(a).length === Object.keys(b).length &&
  Object.entries(b).every(([k, v]) => a[k] === v);

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
    const state: { scene: OfficeScene | null; disposed: boolean } = {
      scene: null,
      disposed: false,
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
      const created = new OfficeScene(sprites);
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
      let nextCount = 0;
      created.app.ticker.add((ticker) => {
        try {
          bridge.tick(ticker.deltaMS);
          created.syncFloors(bridge.world);
          const ui = useUi.getState();
          created.showFloor(bridge.world.floors.has(ui.floorId) ? ui.floorId : "lobby");
          created.update(bridge.world, nameOf, ui.selectedAgentId);
          nextCount -= ticker.deltaMS;
          if (nextCount <= 0) {
            nextCount = HEADCOUNT_MS;
            const counts = headcounts(bridge.world);
            if (!sameCounts(ui.headcounts, counts)) {
              ui.setHeadcounts(counts);
            }
          }
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
    <div className="relative h-full w-full overflow-hidden bg-ink">
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
