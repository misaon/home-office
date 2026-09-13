import type { Doctor } from "@ho/protocol";
import { useMutation } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useEffect, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Button, Failure } from "../kit/controls.tsx";
import { SecretField } from "../panels/settings-token.tsx";
import { requireClient } from "../rpc.ts";
import {
  dockerState,
  imagesState,
  MIN_DOCKER_API,
  missingImages,
  staleImages,
  tokenState,
} from "./status.ts";
import { SetupStep, type StepStatus } from "./step.tsx";

type EnvProps = { doctor: Doctor | null; refresh: () => void };

const dockerStatus = (doctor: Doctor | null, t: TFunction): StepStatus => {
  const state = dockerState(doctor);
  if (doctor === null) {
    return { state, text: t("common.checking") };
  }
  if (!doctor.provider.ok) {
    return { state, text: doctor.provider.message };
  }
  const { version, apiVersion: api, os, arch } = doctor.provider;
  return state === "ok"
    ? { state, text: t("setup.dockerOk", { version, api, os, arch }) }
    : { state, text: t("setup.dockerOld", { api, min: String(MIN_DOCKER_API) }) };
};

const imagesStatus = (doctor: Doctor | null, t: TFunction): StepStatus => {
  const state = imagesState(doctor);
  if (doctor === null) {
    return { state, text: t("common.checking") };
  }
  if (!doctor.provider.ok) {
    return { state, text: t("setup.imagesWaiting") };
  }
  if (!doctor.imageContexts) {
    return { state, text: t("setup.imagesNoContexts") };
  }
  const missing = missingImages(doctor);
  if (missing.length > 0) {
    return { state, text: t("setup.imagesMissing", { refs: missing.join(", ") }) };
  }
  const stale = staleImages(doctor);
  if (stale.length > 0) {
    return { state, text: t("setup.imagesStale", { refs: stale.join(", ") }) };
  }
  return { state, text: doctor.images.map((i) => i.ref).join(", ") };
};

const tokenStatus = (doctor: Doctor | null, t: TFunction): StepStatus => {
  const state = tokenState(doctor);
  if (doctor === null) {
    return { state, text: t("common.checking") };
  }
  return { state, text: state === "ok" ? t("setup.tokenStored") : t("setup.tokenMissing") };
};

export function DockerStep({ doctor, refresh }: EnvProps): React.JSX.Element {
  const { t } = useTranslation();
  const status = dockerStatus(doctor, t);
  return (
    <SetupStep index={1} title={t("setup.docker")} status={status}>
      {status.state === "ok" ? null : (
        <div className="space-y-3">
          <p className="leading-relaxed text-muted">{t("setup.dockerIntro")}</p>
          <Button onClick={refresh}>{t("setup.checkAgain")}</Button>
        </div>
      )}
    </SetupStep>
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
  const log = useRef<HTMLPreElement>(null);

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
    const element = log.current;
    if (element !== null) {
      element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
    }
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
    <SetupStep index={2} title={t("setup.images")} status={status}>
      <div className="space-y-3">
        <p className="leading-relaxed text-muted">{t("setup.imagesIntro")}</p>
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
          <pre
            ref={log}
            className="max-h-44 overflow-y-auto rounded-lg border border-line bg-ink p-3 font-mono text-2xs text-muted"
          >
            {lines.join("\n")}
          </pre>
        ) : null}
        <Failure error={build.error} />
      </div>
    </SetupStep>
  );
}

export function TokenStep({ doctor }: { doctor: Doctor | null }): React.JSX.Element {
  const { t } = useTranslation();
  const status = tokenStatus(doctor, t);
  return (
    <SetupStep index={3} title={t("setup.token")} status={status}>
      <div className="space-y-3">
        <p className="leading-relaxed text-muted">
          <Trans
            i18nKey="setup.tokenIntro"
            components={{ code: <code className="rounded bg-ink px-1 font-mono" /> }}
          />
        </p>
        <SecretField
          secret="anthropic-oauth-token"
          label={t("setup.token")}
          stored={status.state === "ok"}
        />
      </div>
    </SetupStep>
  );
}
