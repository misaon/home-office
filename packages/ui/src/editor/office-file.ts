import type { OfficeLayout } from "@ho/protocol";
import { compileLayout, type FloorTemplate, runsOf } from "@ho/sim";
import { emptyDraft, indices, type OfficeDraft } from "./draft.ts";

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

export const compileDraft = (draft: OfficeDraft): FloorTemplate =>
  compileLayout(draft.id, toOffice(draft), []);
