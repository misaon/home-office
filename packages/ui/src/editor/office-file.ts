import type { OfficeLayout } from "@ho/protocol";
import { compileLayout, type FloorTemplate, runsOf } from "@ho/sim";
import { emptyDraft, indices, type OfficeDraft } from "./draft.ts";

/** The draft as the JSON that gets saved; runs of the same value in one row become one rectangle. */
export const toOffice = (draft: OfficeDraft): OfficeLayout => ({
  id: draft.id,
  name: draft.name,
  width: draft.width,
  height: draft.height,
  walls: [...runsOf(draft.wall, draft.width, draft.height)].map((run) => ({
    x: run.x,
    y: run.y,
    w: run.w,
    h: 1,
    material: run.value,
  })),
  rooms: [...runsOf(draft.room, draft.width, draft.height)].map((run) => ({
    x: run.x,
    y: run.y,
    w: run.w,
    h: 1,
    room: run.value,
  })),
  doors: draft.doors.map((door) => ({ ...door })),
  objects: draft.objects.map((object) => ({ ...object })),
});

/** A saved office back into a draft, so it can be edited again. */
export function fromOffice(office: OfficeLayout): OfficeDraft {
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
export const compileDraft = (draft: OfficeDraft): FloorTemplate =>
  compileLayout(draft.id, toOffice(draft), []);
