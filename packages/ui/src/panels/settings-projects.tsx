import type { Project } from "@ho/protocol";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Button, CARD, Failure, Reveal, Section, Switch } from "../kit/controls.tsx";
import { requireClient } from "../rpc.ts";
import { sortedFloors, useUi } from "../store.ts";
import { IntakeSettings } from "./settings-intake.tsx";
import { ServicesSettings } from "./settings-services.tsx";

const describeRepo = (p: Project): string => (p.repo.kind === "local" ? p.repo.path : p.repo.url);

/** A part of a floor's settings that stays out of the way until it is asked for. */
function Drawer({
  title,
  summary,
  children,
}: {
  title: string;
  summary: React.ReactNode;
  children: React.ReactNode;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-line pt-3">
      <button
        type="button"
        className="flex w-full items-center gap-2 text-left"
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        <span className="text-2xs font-semibold tracking-widest text-faint uppercase">{title}</span>
        {summary}
        <span
          className={`ml-auto text-faint transition-transform duration-[var(--duration-base)] ease-[var(--ease-soft)] ${
            open ? "rotate-90" : ""
          }`}
        >
          ›
        </span>
      </button>
      <Reveal open={open}>
        <div className="mt-3">{children}</div>
      </Reveal>
    </div>
  );
}

/** One floor: where its code is, how finished work is delivered, and what it is connected to. */
function FloorCard({ project, index }: { project: Project; index: number }): React.JSX.Element {
  const { t } = useTranslation();
  const publish = useMutation({
    mutationFn: (mode: Project["publish"]["mode"]) =>
      requireClient().projects.update({
        id: project.id,
        patch: { publish: { ...project.publish, mode } },
      }),
  });
  const remove = useMutation({
    mutationFn: () => requireClient().projects.remove({ id: project.id }),
  });
  return (
    <div className={`${CARD} animate-rise space-y-3 p-4`}>
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <Badge tone="accent">{index + 1}</Badge>
            <span className="truncate text-sm font-semibold">{project.name}</span>
          </span>
          <span className="mt-1 block truncate font-mono text-2xs text-faint">
            {describeRepo(project)} · {project.defaultBranch}
          </span>
        </span>
        <Button
          variant="danger"
          onClick={() => {
            if (window.confirm(t("project.confirmRemove", { name: project.name }))) {
              remove.mutate();
            }
          }}
        >
          {t("common.remove")}
        </Button>
      </div>
      <Switch
        checked={project.publish.mode === "pull-request"}
        label={t("project.pullRequests")}
        hint={t("project.pullRequestsHint")}
        onChange={(on) => {
          publish.mutate(on ? "pull-request" : "branch");
        }}
      />
      <Failure error={publish.error ?? remove.error} />
      <Drawer
        title={t("settings.intake")}
        summary={
          <Badge tone={project.intake.enabled ? "good" : "neutral"}>
            {project.intake.enabled ? t("common.on") : t("common.off")}
          </Badge>
        }
      >
        <IntakeSettings project={project} />
      </Drawer>
      <Drawer
        title={t("settings.services")}
        summary={
          <Badge tone={project.services.enabled ? "good" : "neutral"}>
            {project.services.enabled ? t("common.on") : t("common.off")}
          </Badge>
        }
      >
        <ServicesSettings project={project} />
      </Drawer>
    </div>
  );
}

/** The floors: one per project, numbered by creation. Adding one goes through the add-project dialog. */
export function ProjectsSettings(): React.JSX.Element {
  const { t } = useTranslation();
  const projects = useUi((s) => s.snapshot.projects);
  const setAddProjectOpen = useUi((s) => s.setAddProjectOpen);
  return (
    <Section title={t("project.floors")} aside={<Badge>{projects.size}</Badge>}>
      <div className="space-y-3">
        {sortedFloors(projects).map((p, i) => (
          <FloorCard key={p.id} project={p} index={i} />
        ))}
        <Button
          variant="primary"
          onClick={() => {
            setAddProjectOpen(true);
          }}
        >
          {t("project.add")}
        </Button>
      </div>
    </Section>
  );
}
