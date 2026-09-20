import type { SessionMode } from "@ho/protocol";
import { type Actor, CELL_PX } from "@ho/sim";
import { t as translate } from "i18next";
import { Container, Graphics, Text } from "pixi.js";
import { activeSessionOf, useUi } from "../store.ts";

const BODY = CELL_PX;
const RING_GAP = 6 * (BODY / 21);
const RING_FROM = 0.85;
const RING_TO = 2.4;
const RING_MS = 3200;
const PULSE_MS = 1600;

const PILL_TOP = 9;
const PILL_H = 21;
const PAD_X = 9;
const GAP = 6;
const MARK = 5;

const IDLE_DOT = 0x8e8b85;
const IDLE_EDGE = 0x34343b;
const PLATE = 0x0c0c0e;
const INK = 0xf2efe8;

const PULSE: Readonly<Record<SessionMode, number>> = {
  work: 0xffc531,
  review: 0xa78bfa,
  triage: 0x60a5fa,
  plan: 0x60a5fa,
};
const CARRYING = 0xffc531;

export type Said = { caption: string; busy: boolean; colour: number };

export type Badge = {
  root: Container;
  ring: Graphics;
  pill: Container;
  plate: Graphics;
  glow: Graphics;
  halo: Graphics;
  mark: Graphics;
  text: Text;
  caption: string;
  colour: number | null;
};

export function makeBadge(): Badge {
  const root = new Container();
  const ring = new Graphics();
  ring.visible = false;
  const pill = new Container();
  const plate = new Graphics();
  const glow = new Graphics();
  const halo = new Graphics();
  const mark = new Graphics();
  const text = new Text({
    text: "",
    style: { fontFamily: "JetBrains Mono, monospace", fontSize: 10, fill: INK },
  });
  text.resolution = 2;
  pill.addChild(plate, glow, halo, mark, text);
  root.addChild(ring, pill);
  return { root, ring, pill, plate, glow, halo, mark, text, caption: "", colour: null };
}

const relayout = (badge: Badge, said: Said): void => {
  const colour = said.busy ? said.colour : null;
  badge.text.text = said.caption;
  const width = PAD_X + MARK + GAP + Math.ceil(badge.text.width) + PAD_X;
  const dotX = -width / 2 + PAD_X + MARK / 2;
  const dotY = PILL_H / 2;
  badge.plate
    .clear()
    .roundRect(-width / 2, 0, width, PILL_H, PILL_H / 2)
    .fill({ color: PLATE, alpha: 0.92 })
    .stroke({ color: colour ?? IDLE_EDGE, width: 1, alpha: colour === null ? 1 : 0.3 });
  badge.glow.clear();
  badge.halo.clear();
  badge.ring.clear();
  if (colour !== null) {
    badge.glow
      .roundRect(-width / 2, 0, width, PILL_H, PILL_H / 2)
      .stroke({ color: colour, width: 1.5 });
    badge.halo.circle(0, 0, MARK).fill({ color: colour, alpha: 0.6 });
    badge.ring.circle(0, 0, BODY + RING_GAP).stroke({ color: colour, width: 1.5, alpha: 0.55 });
  }
  badge.halo.position.set(dotX, dotY);
  badge.mark
    .clear()
    .circle(dotX, dotY, MARK / 2)
    .fill(colour ?? IDLE_DOT);
  badge.text.position.set(-width / 2 + PAD_X + MARK + GAP, (PILL_H - badge.text.height) / 2);
};

export function updateBadge(badge: Badge, said: Said, elapsedMs: number, scale: number): void {
  const colour = said.busy ? said.colour : null;
  if (badge.caption !== said.caption || badge.colour !== colour) {
    badge.caption = said.caption;
    badge.colour = colour;
    relayout(badge, said);
  }
  badge.pill.scale.set(1 / scale);
  badge.pill.position.set(0, BODY + PILL_TOP / scale);
  badge.ring.visible = said.busy;
  if (!said.busy) {
    badge.glow.alpha = 0;
    badge.halo.alpha = 0;
    return;
  }
  const ringPhase = (elapsedMs % RING_MS) / RING_MS;
  const eased = 1 - (1 - ringPhase) ** 3;
  badge.ring.scale.set(RING_FROM + (RING_TO - RING_FROM) * eased);
  badge.ring.alpha = 0.6 * (1 - eased);
  const wave = 0.5 - 0.5 * Math.cos((2 * Math.PI * (elapsedMs % PULSE_MS)) / PULSE_MS);
  badge.glow.alpha = 0.2 + 0.8 * wave;
  badge.halo.scale.set(1 + 1.4 * wave);
  badge.halo.alpha = 0.7 * (1 - wave);
}

export function captionOf(actor: Actor): Said | null {
  const { snapshot } = useUi.getState();
  const agent = snapshot.agents.get(actor.id);
  if (agent === undefined) {
    return null;
  }
  const session = activeSessionOf(snapshot, actor.id);
  const carrying = actor.emotion?.kind === "envelope";
  return {
    caption: `${agent.name} · ${translate(`roles.${agent.role}`)}`,
    busy: session !== undefined || carrying,
    colour: session === undefined ? CARRYING : PULSE[session.mode],
  };
}
