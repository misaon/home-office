import { type Doctor, errorMessage } from "@ho/protocol";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { requireClient } from "../rpc.ts";
import { dockerStatus, imagesStatus, tokenStatus } from "./status.ts";
import { Step } from "./step.tsx";

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

  const build = useMutation({
    mutationFn: async () => {
      const aborter = new AbortController();
      controller.current = aborter;
      setLines([]);
      setStartedAt(Date.now());
      try {
        for await (const { line } of await requireClient().system.buildImages(undefined, {
          signal: aborter.signal,
        })) {
          setLines((prev) => [...prev.slice(-LOG_LIMIT), line]);
        }
      } catch (failure) {
        if (!aborter.signal.aborted) {
          throw failure;
        }
      }
    },
    onSettled: () => {
      setStartedAt(null);
      refresh();
    },
  });

  return (
    <Step index={2} title="Agent images" status={status}>
      <div className="space-y-1">
        <p className="text-gray-300">
          The agent image bundles Claude Code, git, RTK, headless Chromium and the browser MCP
          servers. The first build downloads everything and takes a few minutes; later builds reuse
          cached layers.
        </p>
        {status.state === "ok" && !build.isPending ? null : (
          <button
            type="button"
            className="rounded bg-accent px-2 py-1 text-black disabled:opacity-50"
            disabled={build.isPending || doctor?.provider.ok !== true}
            onClick={() => {
              build.mutate();
            }}
          >
            {build.isPending ? `Building… ${String(elapsed)} s` : "Build images"}
          </button>
        )}
        {lines.length > 0 ? (
          <pre className="max-h-40 overflow-y-auto rounded bg-ink p-2 font-mono text-[10px] text-gray-300">
            {lines.join("\n")}
            <div ref={bottom} />
          </pre>
        ) : null}
        {build.error === null ? null : <p className="text-red-400">{errorMessage(build.error)}</p>}
      </div>
    </Step>
  );
}

export function TokenStep({ doctor, refresh }: EnvProps): React.JSX.Element {
  const status = tokenStatus(doctor);
  const [value, setValue] = useState("");
  const store = useMutation({
    mutationFn: (token: string) =>
      requireClient().secrets.set({ key: "anthropic-oauth-token", value: token }),
    onSuccess: () => {
      setValue("");
      refresh();
    },
  });
  const save = (): void => {
    const token = value.trim();
    if (token !== "") {
      store.mutate(token);
    }
  };
  return (
    <Step index={3} title="Claude subscription token" status={status}>
      <div className="space-y-1">
        <p className="text-gray-300">
          Agents sign in with your Claude subscription. In a terminal run{" "}
          <code className="rounded bg-ink px-1 font-mono">claude setup-token</code>, finish the
          browser login it opens and paste the token it prints. It is stored in this machine&rsquo;s
          credential store (Keychain, libsecret or Credential Manager) and only ever handed to the{" "}
          <code className="font-mono">claude</code> process inside a sandbox.
        </p>
        <div className="flex gap-1">
          <input
            type="password"
            aria-label="Claude subscription token"
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
        {store.error === null ? null : <p className="text-red-400">{errorMessage(store.error)}</p>}
      </div>
    </Step>
  );
}
