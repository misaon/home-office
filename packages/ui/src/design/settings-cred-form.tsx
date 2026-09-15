import type { SecretKeyName } from "@ho/protocol";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { requireClient } from "../rpc.ts";
import { MONO } from "./tokens.ts";

/** The dictionary names these by what they are, not by the store's key. */
export const NAMED: Record<SecretKeyName, "claude" | "anthropic" | "openai" | "gemini" | "github"> =
  {
    "anthropic-oauth-token": "claude",
    "anthropic-api-key": "anthropic",
    "openai-api-key": "openai",
    "gemini-api-key": "gemini",
    "github-token": "github",
  };
import { useDesign } from "./store.ts";

const FIELD = `flex-1 min-w-120 py-9 px-11 rounded-10 border border-border-strong bg-well ${MONO} text-11h`;

const ACTION =
  "py-9 px-14 rounded-10 border-0 bg-accent text-accent-ink text-12 font-semibold cursor-pointer whitespace-nowrap flex-[0_0_auto] transition-all duration-200";

/** Where a key is pasted, saved and forgotten. The value never leaves this component. */
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
  const save = useMutation({
    mutationFn: () => requireClient().secrets.set({ key: name, value: value.trim() }),
    onSuccess: () => {
      done(t("tokens.stored", { name: t(`tokens.${NAMED[name]}`) }));
    },
    onError: (error: Error) => {
      flash(error.message);
    },
  });
  const forget = useMutation({
    mutationFn: () => requireClient().secrets.delete({ key: name }),
    onSuccess: () => {
      done(t("tokens.forgotten", { name: t(`tokens.${NAMED[name]}`) }));
    },
    onError: (error: Error) => {
      flash(error.message);
    },
  });

  return (
    <div className="pt-0 px-13 pb-14 animate-rise-280">
      <div className="text-11h text-ink-meta leading-prose mb-11">
        {t(`tokens.${NAMED[name]}Hint`)}
      </div>
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
