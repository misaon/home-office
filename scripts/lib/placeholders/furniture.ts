import { fillRect, setPixel, type Rgba } from "../png.ts";
import { type Color, c, box, type Dir, piece, type Entry } from "./draw.ts";

export const entries: Entry[] = [];
const save = (key: string, animation: string, frames: Rgba[]): void => {
  entries.push({ key, animation, frames });
};

const desk = (screen: Color): Rgba =>
  piece(32, 32, (img) => {
    box(img, 2, 20, 28, 10, c("#c9a97a"), c("#7a5a32"));
    box(img, 10, 6, 12, 10, c("#3a3f4a"));
    fillRect(img, 12, 8, 8, 6, screen);
    fillRect(img, 14, 16, 4, 3, c("#3a3f4a"));
  });
save("furniture/desk-monitor", "off", [desk(c("#1e2230"))]);
save("furniture/desk-monitor", "on", [desk(c("#6fc3ff"))]);
save("furniture/desk-monitor", "type", [desk(c("#6fc3ff")), desk(c("#9ad7ff"))]);
const chair = (dir: Dir): Rgba =>
  piece(16, 16, (img) => {
    box(img, 3, dir === "n" ? 2 : 6, 10, 7, c("#4b4f5a"));
    if (dir !== "n") {
      fillRect(img, 3, 3, 10, 3, c("#3a3d46"));
    }
  });
save("furniture/chair", "static_s", [chair("s")]);
save("furniture/chair", "static_n", [chair("n")]);
save("furniture/chair", "static_e", [chair("e")]);
save("furniture/boss-desk", "static", [
  piece(48, 32, (img) => {
    box(img, 2, 12, 44, 18, c("#6b4426"), c("#3d2412"));
  }),
]);
save("furniture/reception", "static", [
  piece(48, 32, (img) => {
    box(img, 1, 14, 46, 16, c("#d9c7a3"), c("#8a7554"));
  }),
]);
save("furniture/whiteboard", "static", [
  piece(32, 32, (img) => {
    box(img, 2, 4, 28, 20, c("#f7f7f7"), c("#5c5c66"));
    fillRect(img, 6, 8, 5, 4, c("#ffd166"));
    fillRect(img, 14, 10, 5, 4, c("#8ecae6"));
    fillRect(img, 22, 7, 5, 4, c("#f08080"));
  }),
]);
const mailbox = (full: boolean): Rgba =>
  piece(16, 32, (img) => {
    fillRect(img, 7, 18, 2, 12, c("#3f3f47"));
    box(img, 2, 6, 12, 12, c("#3b5ba9"), c("#1f2f5c"));
    if (full) {
      fillRect(img, 5, 9, 6, 4, c("#ffffff"));
    }
  });
save("furniture/mailbox", "empty", [mailbox(false)]);
save("furniture/mailbox", "full", [mailbox(true)]);
const coffee = (steam: boolean): Rgba =>
  piece(16, 32, (img) => {
    box(img, 2, 10, 12, 20, c("#2c2c34"), c("#101014"));
    fillRect(img, 4, 14, 8, 2, c("#e63946"));
    if (steam) {
      setPixel(img, 7, 7, c("#dddddd"));
      setPixel(img, 9, 5, c("#dddddd"));
    }
  });
save("furniture/coffee-machine", "idle", [coffee(false)]);
save("furniture/coffee-machine", "brew", [coffee(true), coffee(false)]);
save("furniture/fridge", "static", [
  piece(16, 32, (img) => {
    box(img, 2, 2, 12, 28, c("#f2f2f2"), c("#8a8a8a"));
  }),
]);
save("furniture/sink", "static", [
  piece(16, 16, (img) => {
    box(img, 2, 4, 12, 10, c("#c0c8d0"), c("#5b6570"));
  }),
]);
save("furniture/sofa", "static", [
  piece(32, 16, (img) => {
    box(img, 1, 4, 30, 11, c("#c8553d"), c("#7a2e1c"));
  }),
]);
save("furniture/armchair", "static", [
  piece(16, 16, (img) => {
    box(img, 2, 4, 12, 11, c("#c8553d"), c("#7a2e1c"));
  }),
]);
save("furniture/plant", "static", [
  piece(16, 32, (img) => {
    box(img, 5, 22, 6, 8, c("#a0522d"), c("#5a2e14"));
    box(img, 2, 6, 12, 16, c("#3f9142"), c("#245c27"));
  }),
]);
save("furniture/water-cooler", "static", [
  piece(16, 32, (img) => {
    box(img, 4, 14, 8, 16, c("#e8e8e8"), c("#8a8a8a"));
    box(img, 5, 4, 6, 10, c("#8fc5ea"), c("#4a7ea6"));
  }),
]);
save("furniture/toilet", "static", [
  piece(16, 16, (img) => {
    box(img, 3, 3, 10, 11, c("#f6f6f6"), c("#8a8a8a"));
  }),
]);
save("furniture/bookshelf", "static", [
  piece(32, 32, (img) => {
    box(img, 2, 2, 28, 28, c("#8a5a2b"), c("#4a2f14"));
    for (const [i, col] of [c("#e63946"), c("#457b9d"), c("#f4a261"), c("#2a9d8f")].entries()) {
      fillRect(img, 5 + i * 6, 6, 4, 8, col);
      fillRect(img, 5 + ((i + 1) % 4) * 6, 18, 4, 8, col);
    }
  }),
]);
save("furniture/printer", "static", [
  piece(16, 16, (img) => {
    box(img, 2, 5, 12, 9, c("#9aa0a6"), c("#4b5056"));
  }),
]);
save("furniture/ashtray-stand", "static", [
  piece(16, 32, (img) => {
    fillRect(img, 7, 10, 2, 20, c("#3f3f47"));
    box(img, 3, 6, 10, 5, c("#6c6c74"), c("#2c2c34"));
  }),
]);
const elevator = (open: boolean): Rgba =>
  piece(32, 32, (img) => {
    box(img, 2, 2, 28, 30, c("#8d99ae"), c("#3d4756"));
    if (open) {
      fillRect(img, 6, 6, 20, 24, c("#3a3f4a"));
    } else {
      fillRect(img, 15, 4, 2, 26, c("#3d4756"));
    }
  });
save("furniture/elevator", "closed", [elevator(false)]);
save("furniture/elevator", "open", [elevator(true)]);
