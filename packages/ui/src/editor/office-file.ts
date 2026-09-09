import type { OfficeLayout } from "@ho/protocol";
import { type Layout, layoutFromOffice } from "@ho/sim";
import { type Draft, emptyDraft, type Rect } from "./draft.ts";

const indices = (draft: Draft, rect: Rect): number[] => {
  const out: number[] = [];
  for (let y = rect.y; y < rect.y + rect.h; y += 1) {
    for (let x = rect.x; x < rect.x + rect.w; x += 1) {
      if (x >= 0 && y >= 0 && x < draft.width && y < draft.height) {
        out.push(y * draft.width + x);
      }
    }
  }
  return out;
};

/** Runs of the same value in one row become one rectangle; a wall drawn as a line stays one line. */
function* runs<T>(
  values: readonly (T | null)[],
  width: number,
  height: number,
): Generator<{ value: T; rect: Rect }> {
  for (let y = 0; y < height; y += 1) {
    let start = 0;
    let current: T | null = null;
    for (let x = 0; x <= width; x += 1) {
      const value = x === width ? null : (values[y * width + x] ?? null);
      if (value !== current) {
        if (current !== null) {
          yield { value: current, rect: { x: start, y, w: x - start, h: 1 } };
        }
        current = value;
        start = x;
      }
    }
  }
}

/** The draft as the JSON that gets saved. */
export const toOffice = (draft: Draft): OfficeLayout => ({
  id: draft.id,
  name: draft.name,
  width: draft.width,
  height: draft.height,
  walls: [...runs(draft.wall, draft.width, draft.height)].map(({ value, rect }) => ({
    x: rect.x,
    y: rect.y,
    w: rect.w,
    h: rect.h,
    material: value,
  })),
  rooms: [...runs(draft.room, draft.width, draft.height)].map(({ value, rect }) => ({
    x: rect.x,
    y: rect.y,
    w: rect.w,
    h: rect.h,
    room: value,
  })),
  doors: draft.doors.map((door) => ({ ...door })),
  objects: draft.objects.map((object) => ({ ...object })),
});

/** A saved office back into a draft, so it can be edited again. */
export function fromOffice(office: OfficeLayout): Draft {
  const draft = emptyDraft(office.name, office.width, office.height);
  draft.id = office.id;
  for (const rect of office.walls) {
    for (const i of indices(draft, rect)) {
      draft.wall[i] = rect.material;
    }
  }
  for (const rect of office.rooms) {
    for (const i of indices(draft, rect)) {
      draft.room[i] = rect.room;
    }
  }
  draft.doors = office.doors.map((door) => ({ ...door }));
  draft.objects = office.objects.map((object) => ({ ...object }));
  return draft;
}

/** What the office renderer draws: the draft compiled exactly like a saved office would be. */
export const draftLayout = (draft: Draft): Layout => layoutFromOffice(toOffice(draft));
