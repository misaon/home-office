import type { Doctor } from "@ho/protocol";
import { useEffect, useRef, useState } from "react";
import { getClient } from "../rpc.ts";
import { dockerStatus, imagesStatus, tokenStatus } from "./status.ts";
import { describeError, Step } from "./step.tsx";

type EnvProps = { doctor: Doctor | null; refresh: () => void };

export function DockerStep({ doctor, refresh }: EnvProps): React.JSX.Element {
  const status = dockerStatus(doctor);
  return (
    <Step index={1} title="Docker" status={status}>
      {status.state === "ok" ? null : (
        <div className="space-y-1">
          <p className="text-gray-300">
            Agents run in isolated Alpine containers. Install and start Docker Desktop (or another
            Docker Engine), then check again.
          </p>
          <button type="button" className="rounded bg-line px-2 py-1" onClick={refresh}>
            Check again
          </button>
        </div>
      )}
    </Step>
  );
}

const LOG_LIMIT = 400;

export function ImagesStep({ doctor, refresh }: EnvProps): React.JSX.Element {
  const status = imagesStatus(doctor);
  const [lines, setLines] = useState<string[]>([]);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (startedAt === null) {
      return undefined;
    }
    const timer = setInterval(() => {
      setElapsed(Math.round((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [startedAt]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [lines.length]);
  useEffect(() => () => controller.current?.abort(), []);

  const build = async (): Promise<void> => {
    const client = getClient();
    if (client === null || building) {
      return;
    }
    const aborter = new AbortController();
    controller.current = aborter;
    setBuilding(true);
    setError(null);
    setLines([]);
    setStartedAt(Date.now());
    try {
      for await (const { line } of await client.system.buildImages(undefined, {
        signal: aborter.signal,
      })) {
        setLines((prev) => [...prev.slice(-LOG_LIMIT), line]);
      }
    } catch (e) {
      if (!aborter.signal.aborted) {
        setError(describeError(e));
      }
    } finally {
      setBuilding(false);
      setStartedAt(null);
      refresh();
    }
  };

  return (
    <Step index={2} title="Agent images" status={status}>
      <div className="space-y-1">
        <p className="text-gray-300">
          The agent image bundles Claude Code, git, RTK, headless Chromium and the browser MCP
          servers (about 1.8 GB). The first build downloads everything and takes a few minutes;
          later builds reuse cached layers.
        </p>
        {status.state === "ok" && !building ? null : (
          <button
            type="button"
            className="rounded bg-accent px-2 py-1 text-black disabled:opacity-50"
            disabled={building || doctor?.provider.ok !== true}
            onClick={() => {
              void build();
            }}
          >
            {building ? `Building… ${String(elapsed)} s` : "Build images"}
          </button>
        )}
        {lines.length > 0 ? (
          <pre className="max-h-40 overflow-y-auto rounded bg-ink p-2 font-mono text-[10px] text-gray-300">
            {lines.join("\n")}
            <div ref={bottom} />
          </pre>
        ) : null}
        {error === null ? null : <p className="text-red-400">{error}</p>}
      </div>
    </Step>
  );
}

export function TokenStep({ doctor, refresh }: EnvProps): React.JSX.Element {
  const status = tokenStatus(doctor);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const save = (): void => {
    const client = getClient();
    const token = value.trim();
    if (client === null || token === "") {
      return;
    }
    client.secrets.set({ key: "anthropic-oauth-token", value: token }).then(
      () => {
        setValue("");
        setError(null);
        refresh();
      },
      (e: unknown) => {
        setError(describeError(e));
      },
    );
  };
  return (
    <Step index={3} title="Claude subscription token" status={status}>
      <div className="space-y-1">
        <p className="text-gray-300">
          Agents sign in with your Claude subscription. In a terminal run{" "}
          <code className="rounded bg-ink px-1 font-mono">claude setup-token</code>, finish the
          browser login it opens and paste the token it prints. It is stored in the macOS Keychain
          and only ever handed to the <code className="font-mono">claude</code> process inside a
          sandbox.
        </p>
        <div className="flex gap-1">
          <input
            type="password"
            autoComplete="off"
            className="flex-1 rounded bg-ink px-2 py-1 font-mono"
            placeholder={
              status.state === "ok" ? "paste a new token to replace it" : "paste the token"
            }
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
          <button type="button" className="rounded bg-accent px-2 text-black" onClick={save}>
            Save
          </button>
        </div>
        {error === null ? null : <p className="text-red-400">{error}</p>}
      </div>
    </Step>
  );
}
