import { fillRect, setPixel, type Rgba } from "../png.ts";
import { c, OUTLINE, box, piece, bubble, type Entry } from "./draw.ts";

export const entries: Entry[] = [];
const save = (key: string, animation: string, frames: Rgba[]): void => {
  entries.push({ key, animation, frames });
};

save("bubbles/focused", "static", [
  bubble((img) => {
    fillRect(img, 4, 6, 8, 1, OUTLINE);
  }),
]);
save("bubbles/happy", "static", [
  bubble((img) => {
    setPixel(img, 5, 5, OUTLINE);
    setPixel(img, 10, 5, OUTLINE);
    fillRect(img, 6, 8, 4, 1, OUTLINE);
  }),
]);
save("bubbles/frustrated", "static", [
  bubble((img) => {
    fillRect(img, 7, 3, 2, 6, c("#e63946"));
  }),
]);
save("bubbles/question", "static", [
  bubble((img) => {
    fillRect(img, 6, 3, 4, 1, OUTLINE);
    fillRect(img, 9, 4, 1, 2, OUTLINE);
    fillRect(img, 7, 6, 2, 1, OUTLINE);
    setPixel(img, 7, 9, OUTLINE);
  }),
]);
save("bubbles/sleepy", "static", [
  bubble((img) => {
    fillRect(img, 4, 4, 8, 1, c("#457b9d"));
  }),
]);
save("bubbles/relaxed", "static", [
  bubble((img) => {
    box(img, 5, 4, 5, 5, c("#8a5a2b"));
  }),
]);
save("bubbles/talking", "static", [
  bubble((img) => {
    for (const x of [4, 7, 10]) {
      fillRect(img, x, 6, 2, 2, OUTLINE);
    }
  }),
]);
save("bubbles/envelope", "static", [
  bubble((img) => {
    box(img, 3, 4, 10, 6, c("#ffd166"));
  }),
]);
save("props/folder", "static", [
  piece(16, 16, (img) => {
    box(img, 2, 4, 12, 9, c("#ffd166"), c("#b38600"));
  }),
]);
save("props/coffee-cup", "static", [
  piece(16, 16, (img) => {
    box(img, 5, 6, 6, 7, c("#ffffff"));
  }),
]);
save("props/envelope", "static", [
  piece(16, 16, (img) => {
    box(img, 2, 5, 12, 7, c("#ffffff"));
  }),
]);
