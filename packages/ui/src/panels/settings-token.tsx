import type { SecretKeyName } from "@ho/protocol";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Button, Failure, Section } from "../kit/controls.tsx";
import { doctorQuery, secretsStatusQuery } from "../queries.ts";
import { requireClient } from "../rpc.ts";
import { useOnline } from "../store.ts";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const KEYS = [
  { key: "anthropic-oauth-token", label: "tokens.claude", hint: "tokens.claudeHint" },
  { key: "anthropic-api-key", label: "tokens.anthropic", hint: "tokens.anthropicHint" },
  { key: "openai-api-key", label: "tokens.openai", hint: "tokens.openaiHint" },
  { key: "gemini-api-key", label: "tokens.gemini", hint: "tokens.geminiHint" },
  { key: "github-token", label: "tokens.github", hint: "tokens.githubHint" },
] as const satisfies readonly { key: SecretKeyName; label: string; hint: string }[];

/**
 * A password field with Save, and Forget once the secret is stored; the setup checklist and Settings share
 * it. The value never leaves the field except in the RPC, and the doctor and secret status refresh after.
 */
export function SecretField({
  secret,
  label,
  stored,
}: {
  secret: SecretKeyName;
  label: string;
  stored: boolean;
}): React.JSX.Element {
  const { t } = useTranslation();
  const queries = useQueryClient();
  const [value, setValue] = useState("");
  const changed = (): Promise<void> =>
    Promise.all([
      queries.invalidateQueries({ queryKey: secretsStatusQuery.queryKey }),
      queries.invalidateQueries({ queryKey: doctorQuery.queryKey }),
    ]).then(() => undefined);
  const store = useMutation({
    mutationFn: (token: string) => requireClient().secrets.set({ key: secret, value: token }),
    onSuccess: () => {
      setValue("");
      return changed();
    },
  });
  const forget = useMutation({
    mutationFn: () => requireClient().secrets.delete({ key: secret }),
    onSuccess: changed,
  });
  const save = (): void => {
    const token = value.trim();
    if (token !== "") {
      store.mutate(token);
    }
  };
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          type="password"
          aria-label={label}
          autoComplete="off"
          className="font-mono"
          placeholder={stored ? t("tokens.replace") : t("tokens.paste")}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              save();
            }
          }}
        />
        <Button variant="primary" disabled={store.isPending} onClick={save}>
          {t("common.save")}
        </Button>
        {stored ? (
          <Button
            disabled={forget.isPending}
            onClick={() => {
              forget.mutate();
            }}
          >
            {t("tokens.forget")}
          </Button>
        ) : null}
      </div>
      <Failure error={store.error ?? forget.error} />
    </div>
  );
}

export function TokenSettings(): React.JSX.Element {
  const { t } = useTranslation();
  const online = useOnline();
  const status = useQuery({ ...secretsStatusQuery, enabled: online });
  const present = status.data?.present ?? [];
  return (
    <Section title={t("settings.credentials")}>
      {KEYS.map(({ key, label, hint }) => (
        <Card key={key} className="animate-rise space-y-2.5 p-4 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-medium">{t(label)}</span>
            <Badge tone={present.includes(key) ? "good" : "neutral"}>
              {present.includes(key) ? t("tokens.stored") : t("tokens.missing")}
            </Badge>
          </div>
          <p className="text-2xs leading-relaxed text-muted-foreground">{t(hint)}</p>
          <SecretField secret={key} label={t(label)} stored={present.includes(key)} />
        </Card>
      ))}
    </Section>
  );
}
