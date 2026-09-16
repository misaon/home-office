import { SECRET_SOURCE, type SecretKeyName } from "@ho/protocol";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { requireClient } from "../rpc.ts";
import { MONO } from "./tokens.ts";
import { useDesign, useOfficeMutation } from "./store.ts";

export const NAMED: Record<SecretKeyName, "claude" | "anthropic" | "openai" | "gemini" | "github"> =
  {
    "anthropic-oauth-token": "claude",
    "anthropic-api-key": "anthropic",
    "openai-api-key": "openai",
    "gemini-api-key": "gemini",
    "github-token": "github",
  };

const SOURCE = "flex items-center gap-8 mb-11 py-8 px-10 rounded-9 border border-border bg-well";

const SOURCE_VALUE = `flex-1 min-w-0 ${MONO} text-10h text-accent-quote overflow-hidden text-ellipsis whitespace-nowrap`;

const SOURCE_ACTION =
  "flex-[0_0_auto] py-4 px-8 rounded-7 border border-border-strong bg-transparent text-10h text-ink-quiet cursor-pointer transition-all duration-200";

function SecretSourceRow({ name }: { name: SecretKeyName }): React.JSX.Element {
  const { t } = useTranslation();
  const flash = useDesign((s) => s.flash);
  const source = SECRET_SOURCE[name];

  return (
    <div className={SOURCE}>
      <span
        className={`${MONO} text-9h tracking-caps-wide uppercase text-ink-label flex-[0_0_auto]`}
      >
        {t(source.kind === "command" ? "tokens.getWith" : "tokens.getAt")}
      </span>
      <span className={SOURCE_VALUE} title={source.value}>
        {source.value}
      </span>
      {source.kind === "command" ? (
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(source.value);
            flash(t("tokens.copied"));
          }}
          className={`hover:text-accent-soft hover:border-accent-a45 ${SOURCE_ACTION}`}
        >
          {t("tokens.copy")}
        </button>
      ) : (
        <a
          href={source.value}
          target="_blank"
          rel="noreferrer noopener"
          className={`hover:text-accent-soft hover:border-accent-a45 no-underline ${SOURCE_ACTION}`}
        >
          {t("tokens.open")}
        </a>
      )}
    </div>
  );
}

const FIELD = `flex-1 min-w-120 py-12 px-11 rounded-10 border border-border-strong bg-well ${MONO} text-11h`;

const ACTION =
  "py-9 px-14 rounded-10 border-0 bg-accent text-accent-ink text-12 font-semibold cursor-pointer whitespace-nowrap flex-[0_0_auto] transition-all duration-200";

export function CredForm({
  name,
  stored,
}: {
  name: SecretKeyName;
  stored: boolean;
}): React.JSX.Element {
  const { t } = useTranslation();
  const flash = useDesign((s) => s.flash);
  const queries = useQueryClient();
  const [value, setValue] = useState("");

  const done = (message: string): void => {
    setValue("");
    void queries.invalidateQueries({ queryKey: ["secrets-status"] });
    flash(message);
  };
  const save = useOfficeMutation({
    mutationFn: () => requireClient().secrets.set({ key: name, value: value.trim() }),
    onSuccess: () => {
      done(t("tokens.stored", { name: t(`tokens.${NAMED[name]}`) }));
    },
  });
  const forget = useOfficeMutation({
    mutationFn: () => requireClient().secrets.delete({ key: name }),
    onSuccess: () => {
      done(t("tokens.forgotten", { name: t(`tokens.${NAMED[name]}`) }));
    },
  });

  return (
    <div className="pt-0 px-13 pb-14 animate-rise-280">
      <div className="text-11h text-ink-meta leading-prose mb-11">
        {t(`tokens.${NAMED[name]}Hint`)}
      </div>
      <SecretSourceRow name={name} />
      <div className="flex gap-8 flex-wrap">
        <input
          type="password"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
          }}
          placeholder={stored ? t("tokens.replace") : t("tokens.paste")}
          className={`${FIELD} placeholder:text-ink-ghost`}
        />
        <button
          type="button"
          disabled={value.trim() === "" || save.isPending}
          onClick={() => {
            save.mutate();
          }}
          className={`hover:-translate-y-1 hover:shadow-lift-sm ${ACTION}`}
        >
          {t("common.save")}
        </button>
        {stored ? (
          <button
            type="button"
            disabled={forget.isPending}
            onClick={() => {
              forget.mutate();
            }}
            className="hover:text-bad hover:border-bad-a40 py-9 px-12 rounded-10 border border-border-strong bg-transparent text-12 text-ink-quiet cursor-pointer whitespace-nowrap flex-[0_0_auto] transition-all duration-200"
          >
            {t("tokens.forget")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
