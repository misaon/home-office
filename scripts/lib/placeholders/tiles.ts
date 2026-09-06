import { fillRect, setPixel, type Rgba } from "../png.ts";
import { c, box, tile, type Entry } from "./draw.ts";

export const entries: Entry[] = [];
const save = (key: string, animation: string, frames: Rgba[]): void => {
  entries.push({ key, animation, frames });
};

save("tiles/floor-carpet", "static", [
  tile(c("#a3adb8"), (img) => {
    for (let i = 0; i < 16; i += 4) {
      setPixel(img, i, (i / 4) % 2 === 0 ? 2 : 10, c("#8f99a5"));
    }
  }),
]);
save("tiles/floor-kitchen", "static", [
  tile(c("#e8e4d8"), (img) => {
    fillRect(img, 0, 7, 16, 1, c("#cfc9b8"));
    fillRect(img, 7, 0, 1, 16, c("#cfc9b8"));
  }),
]);
save("tiles/floor-lobby", "static", [
  tile(c("#dcd8d2"), (img) => {
    fillRect(img, 3, 3, 10, 1, c("#c9c4bb"));
    fillRect(img, 9, 8, 5, 1, c("#c9c4bb"));
  }),
]);
save("tiles/window", "static", [
  tile(c("#d9d9d9"), (img) => {
    box(img, 2, 2, 12, 10, c("#8fc5ea"), c("#556070"));
    fillRect(img, 7, 2, 1, 10, c("#556070"));
  }),
]);
save("tiles/door", "closed", [
  tile(c("#d9d9d9"), (img) => {
    box(img, 3, 0, 10, 16, c("#8a5a2b"), c("#4a2f14"));
  }),
]);
save("tiles/door", "open", [
  tile(c("#d9d9d9"), (img) => {
    fillRect(img, 3, 0, 10, 16, c("#6d6d6d"));
  }),
]);
const wallTiles: Rgba[] = [];
for (let i = 0; i < 9; i += 1) {
  const row = Math.floor(i / 3);
  const col = i % 3;
  wallTiles.push(
    tile(c("#d9d9d9"), (img) => {
      fillRect(img, 0, 12, 16, 4, c("#a8a29c"));
      if (row === 0) {
        fillRect(img, 0, 0, 16, 2, c("#6f6f78"));
      }
      if (row === 2) {
        fillRect(img, 0, 14, 16, 2, c("#6f6f78"));
      }
      if (col === 0) {
        fillRect(img, 0, 0, 2, 16, c("#6f6f78"));
      }
      if (col === 2) {
        fillRect(img, 14, 0, 2, 16, c("#6f6f78"));
      }
    }),
  );
}
save("tiles/wall-office", "autotile", wallTiles);
