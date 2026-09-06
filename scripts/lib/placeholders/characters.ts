import { c, type Palette, character, type Entry } from "./draw.ts";
import type { Rgba } from "../png.ts";

export const entries: Entry[] = [];
const save = (key: string, animation: string, frames: Rgba[]): void => {
  entries.push({ key, animation, frames });
};

const CHARACTERS: Record<string, Palette> = {
  "agent-a": {
    skin: c("#f1c9a5"),
    hair: c("#2f2a2e"),
    shirt: c("#2bb3a3"),
    pants: c("#2f3542"),
    shoes: c("#f4f4f4"),
  },
  "agent-b": {
    skin: c("#e8b892"),
    hair: c("#6b4a2b"),
    shirt: c("#7fb3e6"),
    pants: c("#6c7480"),
    shoes: c("#5a3b1e"),
  },
  "agent-c": {
    skin: c("#f5d2b3"),
    hair: c("#d0642b"),
    shirt: c("#5fa15a"),
    pants: c("#1f1f26"),
    shoes: c("#3a3a44"),
  },
  boss: {
    skin: c("#e9c19e"),
    hair: c("#9a9a9a"),
    shirt: c("#2a2e3f"),
    pants: c("#1c1f2b"),
    shoes: c("#111111"),
  },
  postman: {
    skin: c("#e9c19e"),
    hair: c("#3b5ba9"),
    shirt: c("#3b5ba9"),
    pants: c("#2b3f78"),
    shoes: c("#222222"),
  },
};

for (const [name, palette] of Object.entries(CHARACTERS)) {
  const key = `characters/${name}`;
  for (const dir of ["s", "n", "e"] as const) {
    save(key, `idle_${dir}`, [character(palette, dir), character(palette, dir, { bodyDy: 1 })]);
    save(key, `walk_${dir}`, [
      character(palette, dir, { legOffset: [0, 2] }),
      character(palette, dir),
      character(palette, dir, { legOffset: [2, 0] }),
      character(palette, dir),
    ]);
  }
  save(key, "sit_s", [character(palette, "s", { sitting: true })]);
  save(key, "sit_n", [character(palette, "n", { sitting: true })]);
  save(key, "type_s", [
    character(palette, "s", { sitting: true, armsFront: true }),
    character(palette, "s", { sitting: true, armsFront: true, bodyDy: 1 }),
  ]);
  save(key, "type_n", [
    character(palette, "n", { sitting: true, armsFront: true }),
    character(palette, "n", { sitting: true, armsFront: true, bodyDy: 1 }),
  ]);
  save(key, "drink_s", [
    character(palette, "s", { cup: true }),
    character(palette, "s", { cup: true, bodyDy: 1 }),
  ]);
  save(key, "sleep_s", [
    character(palette, "s", { sitting: true, headDown: true, armsFront: true }),
    character(palette, "s", { sitting: true, headDown: true, armsFront: true, bodyDy: 1 }),
  ]);
  save(key, "handover_e", [
    character(palette, "e", { armRight: true }),
    character(palette, "e", { armRight: true, bodyDy: 1 }),
  ]);
  save(key, "receive_e", [
    character(palette, "e", { armLeft: true }),
    character(palette, "e", { armLeft: true, bodyDy: 1 }),
  ]);
  save(key, "celebrate_s", [
    character(palette, "s", { armsUp: true }),
    character(palette, "s", { armsUp: true, bodyDy: -1 }),
  ]);
  if (name === "postman") {
    save(key, "drop_s", [
      character(palette, "s", { armRight: true }),
      character(palette, "s", { armsFront: true }),
    ]);
  }
}

// ---- tiles ----------------------------------------------------------------------------------------
