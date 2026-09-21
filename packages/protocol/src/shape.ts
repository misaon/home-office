import { z } from "zod";

export const TaskShape = z.enum(["mechanical", "routine", "risky"]);
export type TaskShape = z.infer<typeof TaskShape>;

export type ShapeBudget = { workTurns: number; reviewTurns: number; wallMinutes: number };

export const SHAPE_BUDGETS: Readonly<Record<TaskShape, ShapeBudget>> = {
  mechanical: { workTurns: 40, reviewTurns: 25, wallMinutes: 15 },
  routine: { workTurns: 120, reviewTurns: 40, wallMinutes: 30 },
  risky: { workTurns: 200, reviewTurns: 60, wallMinutes: 60 },
};

export const MECHANICAL_MAX_LINES = 60;

const ORDER: readonly TaskShape[] = TaskShape.options;

export const raiseShape = (current: TaskShape, floor: TaskShape): TaskShape =>
  ORDER.indexOf(floor) > ORDER.indexOf(current) ? floor : current;

export const shapeFloorOf = (changedLines: number): TaskShape =>
  changedLines <= MECHANICAL_MAX_LINES ? "mechanical" : "routine";
