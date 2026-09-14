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

const FIELD: React.CSSProperties = {
  flex: "1",
  minWidth: "120px",
  padding: "9px 11px",
  borderRadius: "10px",
  border: "1px solid #2C2C32",
  background: "#0A0A0C",
  ...MONO,
  fontSize: "11.5px",
};

const ACTION: React.CSSProperties = {
  padding: "9px 14px",
  borderRadius: "10px",
  border: "0",
  background: "var(--a,#FFC531)",
  color: "#150F02",
  fontSize: "12px",
  fontWeight: "600",
  cursor: "pointer",
  whiteSpace: "nowrap",
  flex: "0 0 auto",
  transition: "all .2s",
};

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
    <div style={{ padding: "0 13px 14px", animation: "riseIn .28s ease both" }}>
      <div
        style={{ fontSize: "11.5px", color: "#A6A39C", lineHeight: "1.6", marginBottom: "11px" }}
      >
        {t(`tokens.${NAMED[name]}Hint`)}
      </div>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <input
          type="password"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
          }}
          placeholder={stored ? t("tokens.replace") : t("tokens.paste")}
          style={FIELD}
        />
        <button
          type="button"
          disabled={value.trim() === "" || save.isPending}
          onClick={() => {
            save.mutate();
          }}
          style={ACTION}
          className="ho-53ea10"
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
            style={{
              padding: "9px 12px",
              borderRadius: "10px",
              border: "1px solid #2C2C32",
              background: "transparent",
              fontSize: "12px",
              color: "#CFCCC6",
              cursor: "pointer",
              whiteSpace: "nowrap",
              flex: "0 0 auto",
              transition: "all .2s",
            }}
            className="ho-6a6336"
          >
            {t("tokens.forget")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
