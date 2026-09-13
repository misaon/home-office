// The editor shows what a piece is, not the slug the office file stores. The catalogue is read
// straight from the dictionaries, which keeps the lookup typed and works outside React as well.
import { useTranslation } from "react-i18next";
import { cs } from "./cs.ts";
import { en } from "./en.ts";
import { type Language, LANGUAGES } from "./index.ts";

type KindGroup = keyof typeof en.kinds;
/** Names a wall material, a door, a room or a piece of furniture; an unknown slug names itself. */
export type KindName = (group: KindGroup, slug: string) => string;

const CATALOGUE: Record<Language, typeof en.kinds> = { en: en.kinds, cs: cs.kinds };

export const kindNameOf = (language: string): KindName => {
  const known = LANGUAGES.find((candidate) => candidate === language) ?? "en";
  return (group, slug) => {
    const table: Record<string, string> = CATALOGUE[known][group];
    return table[slug] ?? slug;
  };
};

export const useKindName = (): KindName => {
  const { i18n } = useTranslation();
  return kindNameOf(i18n.language);
};
