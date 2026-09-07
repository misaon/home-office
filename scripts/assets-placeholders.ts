// Procedural placeholder character sets in the delivery contract (assets/README.md): 2 × 5 cell frames, feet
// on the bottom row, every activity the simulation plays, facings n/s/e. They stand in until generated sets
// replace them by name, and double as a template for those sets.
//
//   bun run assets:placeholders
import { CELL_PX } from "@ho/sim";
import { mkdir, readdir, rm } from "node:fs/promises";
import { blank, encodePng, fillRect, type Rgba } from "./lib/png.ts";

const W = 2 * CELL_PX;
const H = 5 * CELL_PX;

type Rgb = readonly [number, number, number];
type Palette = { skin: Rgb; hair: Rgb; shirt: Rgb; pants: Rgb; shoes: Rgb; accent: Rgb };
const SETS: Record<string, Palette> = {
  boss: {
    skin: [236, 188, 150],
    hair: [92, 58, 34],
    shirt: [48, 52, 70],
    pants: [36, 38, 52],
    shoes: [30, 26, 26],
    accent: [180, 40, 40],
  },
  "agent-a": {
    skin: [240, 196, 160],
    hair: [40, 40, 44],
    shirt: [52, 110, 200],
    pants: [50, 58, 90],
    shoes: [40, 36, 40],
    accent: [255, 214, 90],
  },
  "agent-b": {
    skin: [214, 160, 120],
    hair: [190, 120, 60],
    shirt: [60, 150, 90],
    pants: [70, 70, 80],
    shoes: [40, 36, 40],
    accent: [255, 214, 90],
  },
  "agent-c": {
    skin: [246, 206, 176],
    hair: [230, 190, 90],
    shirt: [220, 150, 50],
    pants: [60, 60, 100],
    shoes: [50, 40, 40],
    accent: [255, 214, 90],
  },
  postman: {
    skin: [232, 180, 140],
    hair: [80, 60, 50],
    shirt: [200, 60, 50],
    pants: [50, 60, 120],
    shoes: [40, 36, 40],
    accent: [140, 90, 50],
  },
};

type Facing = "n" | "s" | "e";
type Arms = "down" | "swing" | "forward" | "up" | "behind" | "right";
type Frame = {
  facing: Facing;
  seated?: boolean;
  /** -1, 0, 1: which leg leads (and the opposite arm), for walk cycles. */
  phase?: number;
  arms?: Arms;
  eyes?: "open" | "closed";
  bob?: number;
  prop?: "cup" | "folder" | "cigarette" | "bag" | "zz";
};

const px = (img: Rgba, x: number, y: number, w: number, h: number, c: Rgb): void => {
  fillRect(img, Math.round(x), Math.round(y), Math.round(w), Math.round(h), [
    c[0],
    c[1],
    c[2],
    255,
  ]);
};

/**
 * One frame: a chunky figure ≈3.6 cells tall (≈2.9 seated) — about 1.4× the delivered desks with their monitors,
 * the ratio the reference keeps — centred, feet on the bottom row of the 2 × 5 canvas (headroom stays free).
 */
function figure(p: Palette, f: Frame): Rgba {
  const img = blank(W, H);
  const bob = f.bob ?? 0;
  const seated = f.seated ?? false;
  const phase = f.phase ?? 0;
  const side = f.facing === "e";
  const bodyW = side ? 16 : 20;
  const cx = W / 2;
  // Vertical layout from the feet up.
  const feetTop = H - 6;
  const legH = seated ? 18 : 32;
  const legTop = feetTop - legH;
  const torsoH = 28;
  const torsoTop = legTop - torsoH - bob;
  const headH = 18;
  const headTop = torsoTop - headH - 2;
  const outline: Rgb = [30, 26, 30];
  // Legs and shoes.
  const legW = side ? 8 : 8;
  const legGap = side ? 0 : 4;
  const lx = cx - legGap / 2 - legW;
  const rx = cx + legGap / 2;
  const lead = seated ? 0 : phase * 4;
  px(img, lx + (side ? -lead : 0), legTop, legW, legH, p.pants);
  px(img, rx + (side ? lead : 0), legTop, legW, legH, p.pants);
  px(img, lx - 1 + (side ? -lead : 0), feetTop, legW + 2, 6, p.shoes);
  px(img, rx - 1 + (side ? lead : 0), feetTop, legW + 2, 6, p.shoes);
  if (seated) {
    // Thighs reach forward over the chair.
    px(img, cx - bodyW / 2, legTop - 5, bodyW, 7, p.pants);
  }
  // Torso.
  px(img, cx - bodyW / 2, torsoTop, bodyW, torsoH, p.shirt);
  px(img, cx - bodyW / 2, torsoTop, bodyW, 2, outline);
  if (p === SETS["boss"] && f.facing === "s") {
    px(img, cx - 2, torsoTop + 2, 4, 18, p.accent);
  }
  // Arms.
  const armW = 6;
  const armH = 22;
  const armTop = torsoTop + 2;
  const drawArm = (x: number, mode: Arms, swing: number): void => {
    switch (mode) {
      case "up":
        px(img, x, torsoTop - 20, armW, 22, p.shirt);
        px(img, x, torsoTop - 25, armW, 5, p.skin);
        break;
      case "forward":
        px(img, x, armTop + 11, armW, 10, p.shirt);
        px(img, cx - 9, armTop + 18, 18, 5, p.skin);
        break;
      case "behind":
        px(img, x, headTop + 5, armW, 16, p.shirt);
        break;
      case "right":
        px(img, cx + 3, armTop + 5, 15, 6, p.shirt);
        px(img, cx + 18, armTop + 4, 5, 8, p.skin);
        break;
      case "down":
      case "swing":
        px(img, x, armTop + swing, armW, armH, p.shirt);
        px(img, x, armTop + swing + armH, armW, 5, p.skin);
        break;
    }
  };
  const arms = f.arms ?? "down";
  if (side) {
    drawArm(cx - 4, arms, arms === "swing" ? phase * 4 : 0);
  } else {
    drawArm(cx - bodyW / 2 - armW, arms, arms === "swing" ? -phase * 4 : 0);
    if (arms !== "right") {
      drawArm(cx + bodyW / 2, arms, arms === "swing" ? phase * 4 : 0);
    }
  }
  // Head: skin, hair cap, face for s/e.
  const headW = side ? 15 : 18;
  px(img, cx - headW / 2, headTop, headW, headH, p.skin);
  px(img, cx - headW / 2, headTop, headW, f.facing === "n" ? headH - 3 : 7, p.hair);
  if (f.facing !== "n") {
    const eyeY = headTop + 9;
    const closed = f.eyes === "closed";
    if (!side) {
      px(img, cx - 5, eyeY, 2, closed ? 1 : 2, outline);
    }
    px(img, cx + 3, eyeY, 2, closed ? 1 : 2, outline);
  }
  // Props.
  switch (f.prop) {
    case "cup":
      px(img, cx + 5, headTop + 13, 7, 7, [250, 250, 250]);
      break;
    case "cigarette":
      px(img, cx + 7, headTop + 14, 8, 2, [250, 250, 250]);
      px(img, cx + 15, headTop + 8 - bob * 3, 3, 3, [200, 200, 200]);
      break;
    case "folder":
      px(img, cx + 18, armTop, 10, 12, p.accent);
      break;
    case "bag":
      px(img, cx - bodyW / 2 - 5, torsoTop + 16 + bob * 3, 12, 12, p.accent);
      break;
    case "zz":
      px(img, cx + 12, headTop - 7 - bob * 3, 4, 4, [250, 250, 250]);
      px(img, cx + 17, headTop - 13 - bob * 3, 3, 3, [250, 250, 250]);
      break;
    case undefined:
      break;
  }
  return img;
}

/** Every animation of a set: name → frames (with facing suffix in the name). */
function animations(p: Palette, postman: boolean): Record<string, Rgba[]> {
  const out: Record<string, Rgba[]> = {};
  for (const facing of ["n", "s", "e"] as const) {
    out[`idle_${facing}`] = [0, 1].map((bob) => figure(p, { facing, bob }));
    out[`walk_${facing}`] = [0, 1, 0, -1].map((phase) =>
      figure(p, { facing, phase, arms: "swing" }),
    );
  }
  for (const facing of ["n", "s"] as const) {
    out[`type_${facing}`] = [0, 1].map((bob) =>
      figure(p, { facing, seated: true, arms: "forward", bob }),
    );
  }
  out["drink_s"] = [0, 1].map((bob) => figure(p, { facing: "s", bob, prop: "cup" }));
  out["sleep_s"] = [0, 1].map((bob) => figure(p, { facing: "s", eyes: "closed", bob, prop: "zz" }));
  out["handover_e"] = [0, 1].map((bob) =>
    figure(p, { facing: "e", arms: "right", bob, prop: "folder" }),
  );
  out["receive_e"] = [0, 1].map((bob) => figure(p, { facing: "e", arms: "right", bob }));
  out["celebrate_s"] = [0, 1].map((bob) => figure(p, { facing: "s", arms: "up", bob }));
  out["smoke_s"] = [0, 1].map((bob) => figure(p, { facing: "s", bob, prop: "cigarette" }));
  out["relax_s"] = [0, 1].map((bob) => figure(p, { facing: "s", arms: "behind", bob }));
  out["restroom_s"] = [0, 1].map((bob) => figure(p, { facing: "n", bob }));
  if (postman) {
    out["drop_s"] = [0, 1].map((bob) => figure(p, { facing: "s", bob, prop: "bag" }));
  }
  return out;
}

let files = 0;
for (const [set, palette] of Object.entries(SETS)) {
  const dir = `assets/src/characters/${set}`;
  await mkdir(dir, { recursive: true });
  for (const old of await readdir(dir)) {
    if (old.endsWith(".png")) {
      await rm(`${dir}/${old}`);
    }
  }
  for (const [name, frames] of Object.entries(animations(palette, set === "postman"))) {
    for (const [index, frame] of frames.entries()) {
      await Bun.write(`${dir}/${name}_f${String(index)}.png`, encodePng(frame));
      files += 1;
    }
  }
}
process.stdout.write(
  `placeholders: ${String(Object.keys(SETS).length)} sets, ${String(files)} frames of ${String(W)}×${String(H)} px\n`,
);
