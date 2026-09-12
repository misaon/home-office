import { type Doctor, errorMessage } from "@ho/protocol";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Button } from "../kit/controls.tsx";
import { requireClient } from "../rpc.ts";
import { dockerStatus, imagesStatus, tokenStatus } from "./status.ts";
import { Step } from "./step.tsx";

type EnvProps = { doctor: Doctor | null; refresh: () => void };

export function DockerStep({ doctor, refresh }: EnvProps): React.JSX.Element {
  const { t } = useTranslation();
  const status = dockerStatus(doctor, t);
  return (
    <Step index={1} title={t("setup.docker")} status={status}>
      {status.state === "ok" ? null : (
        <div className="space-y-3">
          <p className="leading-relaxed text-gray-300">{t("setup.dockerIntro")}</p>
          <Button onClick={refresh}>{t("setup.checkAgain")}</Button>
        </div>
      )}
    </Step>
  );
}

const LOG_LIMIT = 400;

export function ImagesStep({ doctor, refresh }: EnvProps): React.JSX.Element {
  const { t } = useTranslation();
  const status = imagesStatus(doctor, t);
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
    <Step index={2} title={t("setup.images")} status={status}>
      <div className="space-y-3">
        <p className="leading-relaxed text-gray-300">{t("setup.imagesIntro")}</p>
        {status.state === "ok" && !build.isPending ? null : (
          <Button
            variant="primary"
            disabled={build.isPending || doctor?.provider.ok !== true}
            onClick={() => {
              build.mutate();
            }}
          >
            {build.isPending
              ? t("setup.building", { seconds: String(elapsed) })
              : t("setup.buildImages")}
          </Button>
        )}
        {lines.length > 0 ? (
          <pre className="max-h-44 overflow-y-auto rounded-md border border-line bg-ink p-3 font-mono text-2xs text-gray-300">
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
  const { t } = useTranslation();
  const status = tokenStatus(doctor, t);
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
    <Step index={3} title={t("setup.token")} status={status}>
      <div className="space-y-3">
        <p className="leading-relaxed text-gray-300">
          <Trans
            i18nKey="setup.tokenIntro"
            components={{ code: <code className="rounded bg-ink px-1 font-mono" /> }}
          />
        </p>
        <div className="flex gap-2">
          <input
            type="password"
            aria-label={t("setup.token")}
            autoComplete="off"
            className="flex-1 rounded-md border border-line bg-ink px-3 py-2 font-mono focus:border-accent/60 focus:outline-none"
            placeholder={status.state === "ok" ? t("setup.tokenReplace") : t("setup.tokenPaste")}
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
          <Button variant="primary" onClick={save}>
            {t("common.save")}
          </Button>
        </div>
        {store.error === null ? null : <p className="text-red-400">{errorMessage(store.error)}</p>}
      </div>
    </Step>
  );
}
