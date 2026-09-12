import { errorMessage, type SecretKeyName } from "@ho/protocol";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Section } from "../kit/controls.tsx";
import { secretsStatusQuery } from "../queries.ts";
import { requireClient } from "../rpc.ts";
import { useUi } from "../store.ts";

const KEYS = [
  { key: "anthropic-oauth-token", label: "tokens.claude", hint: "tokens.claudeHint" },
  { key: "anthropic-api-key", label: "tokens.anthropic", hint: "tokens.anthropicHint" },
  { key: "openai-api-key", label: "tokens.openai", hint: "tokens.openaiHint" },
  { key: "gemini-api-key", label: "tokens.gemini", hint: "tokens.geminiHint" },
  { key: "github-token", label: "tokens.github", hint: "tokens.githubHint" },
] as const satisfies readonly { key: SecretKeyName; label: string; hint: string }[];

export function TokenSettings(): React.JSX.Element {
  const { t } = useTranslation();
  const connection = useUi((s) => s.connection);
  const queries = useQueryClient();
  const status = useQuery({ ...secretsStatusQuery, enabled: connection === "online" });
  const present = status.data?.present ?? [];
  const [values, setValues] = useState<Partial<Record<SecretKeyName, string>>>({});
  const invalidate = (): Promise<void> =>
    queries.invalidateQueries({ queryKey: secretsStatusQuery.queryKey });
  const store = useMutation({
    mutationFn: ({ key, value }: { key: SecretKeyName; value: string }) =>
      requireClient().secrets.set({ key, value }),
    onSuccess: (_result, { key, value }) => {
      setValues((current) => ({ ...current, [key]: current[key] === value ? "" : current[key] }));
      return invalidate();
    },
  });
  const forget = useMutation({
    mutationFn: (key: SecretKeyName) => requireClient().secrets.delete({ key }),
    onSuccess: invalidate,
  });
  const failure = store.error ?? forget.error;
  const save = (key: SecretKeyName): void => {
    const value = values[key]?.trim() ?? "";
    if (value !== "") {
      store.mutate({ key, value });
    }
  };
  return (
    <Section title={t("settings.credentials")}>
      {KEYS.map(({ key, label, hint }) => (
        <div key={key} className="space-y-2 rounded-md border border-line bg-panel p-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-medium">{t(label)}</span>
            <span className={present.includes(key) ? "text-emerald-300" : "text-gray-400"}>
              {present.includes(key) ? t("tokens.stored") : t("tokens.missing")}
            </span>
          </div>
          <p className="leading-relaxed text-gray-400">{t(hint)}</p>
          <div className="flex gap-2">
            <input
              type="password"
              aria-label={t(label)}
              autoComplete="off"
              className="flex-1 rounded-md border border-line bg-ink px-3 py-2 font-mono focus:border-accent/60 focus:outline-none"
              placeholder={t("tokens.paste")}
              value={values[key] ?? ""}
              onChange={(e) => {
                setValues({ ...values, [key]: e.target.value });
              }}
            />
            <Button
              variant="primary"
              onClick={() => {
                save(key);
              }}
            >
              {t("common.save")}
            </Button>
            {present.includes(key) ? (
              <Button
                onClick={() => {
                  forget.mutate(key);
                }}
              >
                {t("tokens.forget")}
              </Button>
            ) : null}
          </div>
        </div>
      ))}
      {failure === null ? null : <p className="text-red-400">{errorMessage(failure)}</p>}
    </Section>
  );
}
