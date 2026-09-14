import { useTranslation } from "react-i18next";
import { CONNECTION_KEY, useUi } from "../store.ts";

/** Online, connecting or gone, in the pill the design puts next to the office's name. */
export function Connection(): React.JSX.Element {
  const { t } = useTranslation();
  const connection = useUi((s) => s.connection);
  const online = connection === "online";
  const colour = online ? "bg-good" : connection === "connecting" ? "bg-accent" : "bg-bad";
  const label = t(CONNECTION_KEY[connection]);
  return (
    <div
      title={label}
      aria-label={label}
      className={`flex items-center gap-6 p-5 rounded-pill flex-[0_0_auto] ${online ? "bg-good-a10" : "bg-accent-a10"} border ${online ? "border-good-a26" : "border-accent-a26"} transition-[background,border-color] duration-300`}
    >
      <span className="relative w-6 h-6 inline-block">
        <span className={`absolute inset-0 rounded-half ${colour}`} />
        {online ? (
          <span className={`absolute inset-0 rounded-half animate-ring-2400 ${colour}`} />
        ) : null}
      </span>
    </div>
  );
}
