import { type OfficeLayout, StoredOfficeLayout } from "@ho/protocol";
import baseLayout from "../../../layouts/base.json";
import { anchorsOf } from "./anchors.ts";
import { compileLayout, type FloorTemplate } from "./map.ts";

export const OFFICE_SIZE = { width: 60, height: 34 } as const;

let base: OfficeLayout | null = null;

const baseOffice = (): OfficeLayout => {
  base ??= StoredOfficeLayout.parse(baseLayout);
  return base;
};

function templateOf(floorId: string, office: OfficeLayout): FloorTemplate {
  const bare = compileLayout(floorId, office, []);
  return { ...bare, anchors: anchorsOf(bare.map, office) };
}

export const floorTemplate = (floorId: string): FloorTemplate => templateOf(floorId, baseOffice());
