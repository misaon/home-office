import { CELL_PX } from "@ho/sim";
import { Container, Graphics, Text } from "pixi.js";

/**
 * What the drawing puts under a character: a name and a status on a dark pill, and — while they are
 * working — the same slow ring the office uses everywhere else. Built once per colleague and then only
 * updated, because this runs on every frame.
 */

const BODY = CELL_PX;
/** `inset: -6px` on a 42px puck, at the office's own scale. */
const RING_GAP = 6 * (BODY / 21);
const RING_FROM = 0.85;
const RING_TO = 2.4;
const RING_MS = 3200;

const PILL_TOP = 9;
const PILL_H = 21;
const PAD_X = 9;
const GAP = 6;
const MARK = 5;

const BUSY_DOT = 0xffc531;
const IDLE_DOT = 0x8e8b85;
const BUSY_EDGE = 0xffc531;
const IDLE_EDGE = 0x34343b;

export type Badge = {
  root: Container;
  ring: Graphics;
  pill: Container;
  plate: Graphics;
  mark: Graphics;
  text: Text;
  caption: string;
  busy: boolean | null;
};

export function makeBadge(): Badge {
  const root = new Container();
  const ring = new Graphics();
  ring.circle(0, 0, BODY + RING_GAP).stroke({ color: 0xffc531, width: 1.5, alpha: 0.55 });
  ring.visible = false;
  const pill = new Container();
  const plate = new Graphics();
  const mark = new Graphics();
  const text = new Text({
    text: "",
    style: { fontFamily: "JetBrains Mono, monospace", fontSize: 10, fill: 0xf2efe8 },
  });
  text.resolution = 2;
  pill.addChild(plate, mark, text);
  root.addChild(ring, pill);
  return { root, ring, pill, plate, mark, text, caption: "", busy: null };
}

/** Lays the pill out again, which only has to happen when the words or the mood change. */
const relayout = (badge: Badge, caption: string, busy: boolean): void => {
  badge.text.text = caption;
  const width = PAD_X + MARK + GAP + Math.ceil(badge.text.width) + PAD_X;
  badge.plate
    .clear()
    .roundRect(-width / 2, 0, width, PILL_H, PILL_H / 2)
    .fill({ color: 0x0c0c0e, alpha: 0.92 })
    .stroke({ color: busy ? BUSY_EDGE : IDLE_EDGE, width: 1, alpha: busy ? 0.35 : 1 });
  badge.mark
    .clear()
    .circle(-width / 2 + PAD_X + MARK / 2, PILL_H / 2, MARK / 2)
    .fill(busy ? BUSY_DOT : IDLE_DOT);
  badge.text.position.set(-width / 2 + PAD_X + MARK + GAP, (PILL_H - badge.text.height) / 2);
};

/** One frame of one colleague: where they stand, what they are called, and whether they are at work. */
export function updateBadge(
  badge: Badge,
  caption: string,
  busy: boolean,
  elapsedMs: number,
  scale: number,
): void {
  if (badge.caption !== caption || badge.busy !== busy) {
    badge.caption = caption;
    badge.busy = busy;
    relayout(badge, caption, busy);
  }
  // The pill is a label on a map, not a thing in the office: it keeps the size it was drawn at while
  // the floor under it zooms.
  badge.pill.scale.set(1 / scale);
  badge.pill.position.set(0, BODY + PILL_TOP / scale);
  badge.ring.visible = busy;
  if (busy) {
    const phase = (elapsedMs % RING_MS) / RING_MS;
    // ease-out, as the stylesheet's own `ring` is.
    const eased = 1 - (1 - phase) ** 3;
    badge.ring.scale.set(RING_FROM + (RING_TO - RING_FROM) * eased);
    badge.ring.alpha = 0.6 * (1 - eased);
  }
}
