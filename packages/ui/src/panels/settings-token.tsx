import type { SecretKeyName } from "@ho/protocol";
import { useEffect, useState } from "react";
import { getClient } from "../rpc.ts";
import { useUi } from "../store.ts";

const KEYS: { key: SecretKeyName; label: string; hint: string }[] = [
  {
    key: "anthropic-oauth-token",
    label: "Claude subscription token",
    hint: "Run `claude setup-token` in a terminal and paste the result. Stored in the Keychain, never in the log.",
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
  const [present, setPresent] = useState<SecretKeyName[]>([]);
  const [values, setValues] = useState<Partial<Record<SecretKeyName, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const refresh = (): void => {
    getClient()
      ?.secrets.status()
      .then(
        (s) => {
          setPresent(s.present);
        },
        () => null,
      );
  };
  useEffect(refresh, [connection]);
  const save = (key: SecretKeyName): void => {
    const raw = values[key];
    const value = raw?.trim() ?? "";
    const client = getClient();
    if (client === null || value === "") {
      return;
    }
    client.secrets.set({ key, value }).then(
      () => {
        setValues((current) => ({ ...current, [key]: current[key] === raw ? "" : current[key] }));
        setError(null);
        refresh();
      },
      (e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
      },
    );
  };
  const forget = (key: SecretKeyName): void => {
    getClient()
      ?.secrets.delete({ key })
      .then(refresh, () => null);
  };
  return (
    <section className="space-y-2">
      <h3 className="text-[11px] tracking-wide text-gray-400 uppercase">Credentials</h3>
      {KEYS.map(({ key, label, hint }) => (
        <div key={key} className="rounded border border-line bg-panel p-2 text-[11px]">
          <div className="flex items-center justify-between">
            <span className="font-medium">{label}</span>
            <span className={present.includes(key) ? "text-emerald-300" : "text-gray-400"}>
              {present.includes(key) ? "stored" : "missing"}
            </span>
          </div>
          <p className="text-gray-400">{hint}</p>
          <div className="mt-1 flex gap-1">
            <input
              type="password"
              autoComplete="off"
              className="flex-1 rounded bg-ink px-2 py-1 font-mono"
              placeholder="paste token"
              value={values[key] ?? ""}
              onChange={(e) => {
                setValues({ ...values, [key]: e.target.value });
              }}
            />
            <button
              type="button"
              className="rounded bg-accent px-2 text-black"
              onClick={() => {
                save(key);
              }}
            >
              Save
            </button>
            {present.includes(key) ? (
              <button
                type="button"
                className="rounded bg-line px-2"
                onClick={() => {
                  forget(key);
                }}
              >
                Forget
              </button>
            ) : null}
          </div>
        </div>
      ))}
      {error !== null ? <p className="text-red-400">{error}</p> : null}
    </section>
  );
}
