import { useTranslation } from "react-i18next";
import { ROLE_KEY } from "../i18n/labels.ts";
import type { Member } from "./data.ts";
import { Chevron } from "./icons.tsx";
import { DISPLAY, MONO, separator } from "./tokens.ts";

const INNER = "flex-1 min-w-0 p-13 flex items-center gap-12";

const AVATAR = `w-34 h-34 flex-[0_0_34px] rounded-11 grid place-items-center ${DISPLAY} font-bold text-14`;

const NAME = `${DISPLAY} font-semibold text-14 overflow-hidden text-ellipsis whitespace-nowrap`;

const ROLE = `${MONO} text-9h py-2 px-7 rounded-pill flex-[0_0_auto]`;

const META = `flex items-center gap-7 mt-6 ${MONO} text-10 text-ink-meta flex-wrap`;

const DOT = "w-5 h-5 rounded-half";

/** One colleague as a row: who they are, what they are on, and the arrow into their sheet. */
export function TeamRow({
  person,
  first,
  onOpen,
}: {
  person: Member;
  first: boolean;
  onOpen: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const working = person.status === "working";
  const chief = person.role === "boss";
  const accent = working ? "bg-accent" : "bg-dot-idle";

  return (
    <div
      // Kept the same element as the board's rows, which cannot be a button.
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="button"
      aria-label={person.name}
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={`flex items-stretch cursor-pointer transition-[background] duration-200 hover:bg-row-hover ${separator(first)}`}
    >
      <div className={`w-3 flex-[0_0_3px] ${accent}`} />
      <div className={INNER}>
        <div
          className={`${AVATAR} ${chief ? "bg-gold" : "bg-edge-lit"} ${chief ? "text-accent-ink-deep" : "text-ink-mute"}`}
        >
          <span>{person.i}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-7">
            <span className={NAME}>{person.name}</span>
            <span
              className={`${ROLE} ${chief ? "bg-accent-a20" : "bg-edge-lit"} ${chief ? "text-accent-soft" : "text-ink-faint"}`}
            >
              {t(ROLE_KEY[person.role])}
            </span>
          </div>
          <div className={META}>
            <span
              className={`flex items-center gap-5 ${working ? "text-accent-soft" : "text-ink-meta"}`}
            >
              <span className={`${DOT} ${accent}`} />
              <span>{t(`team.${person.status}`)}</span>
            </span>
            <span className="opacity-40">·</span>
            <span>{`${person.model.toLowerCase()} / ${person.effort}`}</span>
          </div>
        </div>
        <Chevron size={10} strokeWidth={1.5} className="flex-[0_0_auto] stroke-ink-idle" />
      </div>
    </div>
  );
}
