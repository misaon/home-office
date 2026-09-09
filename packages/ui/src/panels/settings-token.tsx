import { errorMessage, type SecretKeyName } from "@ho/protocol";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button, Section } from "../kit/controls.tsx";
import { secretsStatusQuery } from "../queries.ts";
import { requireClient } from "../rpc.ts";
import { useUi } from "../store.ts";

const KEYS: { key: SecretKeyName; label: string; hint: string }[] = [
  {
    key: "anthropic-oauth-token",
    label: "Claude subscription token",
    hint: "Run `claude setup-token` in a terminal and paste the result. Stored in the configured secret store.",
  },
  {
    key: "anthropic-api-key",
    label: "Anthropic API key",
    hint: "For Claude Code agents set to api-key auth (pay per use, optional USD budget per Claude session) and for OpenCode with anthropic/… models.",
  },
  {
    key: "openai-api-key",
    label: "OpenAI API key",
    hint: "Codex agents and OpenCode with openai/… models.",
  },
  {
    key: "gemini-api-key",
    label: "Gemini API key",
    hint: "Gemini CLI agents and OpenCode with google/… models (Google AI Studio key).",
  },
  {
    key: "github-token",
    label: "GitHub token",
    hint: "Reserved for future use. GitHub intake and pull requests currently use your host gh login.",
  },
];

export function TokenSettings(): React.JSX.Element {
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
    <Section title="Credentials">
      {KEYS.map(({ key, label, hint }) => (
        <div key={key} className="space-y-2 rounded-md border border-line bg-panel p-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-medium">{label}</span>
            <span className={present.includes(key) ? "text-emerald-300" : "text-gray-400"}>
              {present.includes(key) ? "stored" : "missing"}
            </span>
          </div>
          <p className="leading-relaxed text-gray-400">{hint}</p>
          <div className="flex gap-2">
            <input
              type="password"
              aria-label={label}
              autoComplete="off"
              className="flex-1 rounded-md border border-line bg-ink px-3 py-2 font-mono focus:border-accent/60 focus:outline-none"
              placeholder="paste token"
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
              Save
            </Button>
            {present.includes(key) ? (
              <Button
                onClick={() => {
                  forget.mutate(key);
                }}
              >
                Forget
              </Button>
            ) : null}
          </div>
        </div>
      ))}
      {failure === null ? null : <p className="text-red-400">{errorMessage(failure)}</p>}
    </Section>
  );
}
