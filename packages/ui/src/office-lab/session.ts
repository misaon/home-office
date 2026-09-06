import { AgentId } from "@ho/protocol";
import {
  addFloor,
  auditOffice,
  createWorld,
  findPath,
  gridFor,
  officePlan,
  release,
  reserve,
  setSteps,
  spawnActor,
  tick,
  type Activity,
  type Anchor,
  type Point,
  type Step,
} from "@ho/sim";

const ID = AgentId.parse("01991abc-0000-7000-8000-000000000001");
const TRANSIT = "lab-arrival";

/** Local simulated actor only: no RPC, provider sessions, tokens or domain events. */
export class LabSession {
  readonly plan = officePlan();
  readonly audit = auditOffice(this.plan);
  readonly world = createWorld("office-layout-v1");
  readonly actor;
  path: Point[] = [];
  destination = "dev-3";
  message = "Příjezd výtahem";
  #tour: Anchor[] = [];

  constructor() {
    addFloor(this.world, this.plan.template);
    addFloor(this.world, { ...this.plan.template, id: TRANSIT });
    this.actor = spawnActor(this.world, ID, "characters/alex-v1", TRANSIT);
    this.replay();
  }

  replay(): void {
    this.#tour = [];
    release(this.world, this.actor);
    this.actor.work = null;
    this.actor.floorId = TRANSIT;
    this.actor.hidden = false;
    this.actor.activity = "idle";
    setSteps(this.actor, []);
    const start = this.plan.template.anchors.find((a) => a.id === "elevator");
    if (start !== undefined) {
      this.actor.pos = { ...start.at };
      this.actor.tile = { ...start.at };
    }
    this.visit("dev-3");
  }

  visit(id: string): void {
    const anchor = this.plan.template.anchors.find((a) => a.id === id);
    if (anchor === undefined) {
      return;
    }
    this.#tour = [];
    this.#go(anchor);
  }

  tour(): void {
    this.#tour = this.plan.template.anchors.filter((a) => a.id !== "elevator");
    if (this.actor.hidden) {
      this.message = "Prohlídka začne po příjezdu";
      return;
    }
    const next = this.#tour.shift();
    if (next !== undefined) {
      this.#go(next);
    }
  }

  point(at: Point): void {
    this.#tour = [];
    const anchor = this.plan.template.anchors.find((a) => a.at.x === at.x && a.at.y === at.y);
    this.#go(anchor ?? { id: `${String(at.x)}, ${String(at.y)}`, kind: "wander", at, facing: "s" });
  }

  #go(anchor: Anchor): void {
    const { actor, plan, world } = this;
    if (actor.hidden) {
      this.message = "Počkej na příjezd výtahu";
      return;
    }
    const grid = gridFor(plan.template);
    // Finish the current tile segment before turning; rerouting must not cut an obstacle corner.
    const current = actor.steps[0];
    const next = current?.kind === "walk" ? current.path?.[0] : undefined;
    const start = next ?? actor.tile;
    const path = findPath(grid, start, anchor.at);
    if (
      !grid.isWalkable(anchor.at) ||
      (path.length === 0 && (start.x !== anchor.at.x || start.y !== anchor.at.y))
    ) {
      this.message = "Toto místo je blokované";
      return;
    }
    release(world, actor);
    actor.work = null;
    const work = anchor.kind === "desk" || anchor.kind === "boss-desk";
    if (work && reserve(world, actor, plan.template.id, anchor.id)) {
      actor.work = { floorId: plan.template.id, anchorId: anchor.id };
    }
    const activity: Activity = work ? "type" : anchor.kind === "coffee" ? "drink" : "idle";
    setSteps(actor, [
      ...(next === undefined
        ? []
        : [{ kind: "walk", floorId: actor.floorId, to: next, path: [next] } satisfies Step]),
      { kind: "walk", floorId: plan.template.id, to: anchor.at, path: null },
      { kind: "hold", activity, facing: anchor.facing },
    ]);
    this.destination = anchor.id;
    this.path = [actor.tile, ...(next === undefined ? [] : [next]), ...path];
    this.message = `Cíl: ${anchor.id}`;
  }

  advance(dt: number): void {
    tick(this.world, dt, () => undefined);
    this.world.outbox.length = 0;
    if (this.actor.steps[0]?.kind === "hold" && this.#tour.length > 0) {
      const next = this.#tour.shift();
      if (next !== undefined) {
        this.#go(next);
      }
    }
  }
}
