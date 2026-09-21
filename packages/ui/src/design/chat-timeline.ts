import type { TFunction } from "i18next";
import type { Message, SessionCard } from "./data.ts";

export type TimelineItem =
  | { key: string; kind: "day"; label: string }
  | { key: string; kind: "message"; message: Message; continued: boolean }
  | { key: string; kind: "status"; message: Message }
  | { key: string; kind: "session"; card: SessionCard };

type Entry = { at: string; order: number; item: TimelineItem };

const CARD_DELAY_MS = 1500;
const GROUP_WITHIN_MS = 3 * 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;

const dayKey = (at: number): string => {
  const date = new Date(at);
  return `${String(date.getFullYear())}-${String(date.getMonth())}-${String(date.getDate())}`;
};

const dayLabel = (at: number, now: number, language: string, t: TFunction): string => {
  const key = dayKey(at);
  if (key === dayKey(now)) {
    return t("chat.today");
  }
  if (key === dayKey(now - DAY_MS)) {
    return t("chat.yesterday");
  }
  return new Intl.DateTimeFormat(language, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(at));
};

const sameAuthor = (a: Message, b: Message): boolean => a.mine === b.mine && a.who === b.who;

const entryOf = (message: Message): Entry => ({
  at: message.at,
  order: 0,
  item:
    message.kind === "status"
      ? { key: message.id, kind: "status", message }
      : { key: message.id, kind: "message", message, continued: false },
});

const cardEntry = (card: SessionCard): Entry => ({
  at: new Date(new Date(card.startedAt).getTime() + CARD_DELAY_MS).toISOString(),
  order: 1,
  item: { key: card.id, kind: "session", card },
});

export function buildTimeline(
  messages: readonly Message[],
  cards: readonly SessionCard[],
  now: number,
  language: string,
  t: TFunction,
): TimelineItem[] {
  const entries = [
    ...messages.map((message) => entryOf(message)),
    ...cards.map((card) => cardEntry(card)),
  ].toSorted((a, b) => a.at.localeCompare(b.at) || a.order - b.order);
  const items: TimelineItem[] = [];
  let day = "";
  let previous: Message | null = null;
  for (const { at, item } of entries) {
    const stamp = Date.parse(at);
    const key = dayKey(stamp);
    if (key !== day) {
      items.push({ key: `day-${key}`, kind: "day", label: dayLabel(stamp, now, language, t) });
      day = key;
      previous = null;
    }
    if (item.kind === "message") {
      const continued =
        previous !== null &&
        sameAuthor(previous, item.message) &&
        Date.parse(item.message.at) - Date.parse(previous.at) <= GROUP_WITHIN_MS;
      items.push({ ...item, continued });
      previous = item.message;
    } else {
      items.push(item);
      previous = null;
    }
  }
  return items;
}
