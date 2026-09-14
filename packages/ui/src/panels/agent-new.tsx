import { defaultChoice } from "@ho/core";
import { AgentRole, Gender, type ProjectId } from "@ho/protocol";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { GENDER_KEY, ROLE_KEY } from "../i18n/labels.ts";
import { Button, Failure, Field } from "../kit/controls.tsx";
import { Select } from "../kit/select.tsx";
import { requireClient } from "../rpc.ts";
import { type Choice, ProviderModelFields } from "./agent-fields.tsx";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/** Roles a floor hires; the boss comes with the floor. */
const ROLES = AgentRole.options.filter((r) => r !== "boss");

type AgentDraft = Choice & { name: string; role: AgentRole; gender: Gender; basePrompt: string };

const EMPTY: AgentDraft = {
  name: "",
  role: "worker",
  provider: "claude-code",
  ...defaultChoice("claude-code", "worker"),
  gender: "neutral",
  basePrompt: "",
};

/** The "new agent" form of a floor: a draft plus the provider catalog's valid combinations. */
export function NewAgent({
  floorId,
  onAdded,
}: {
  floorId: ProjectId;
  onAdded?: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<AgentDraft>(EMPTY);
  const create = useMutation({
    mutationFn: () =>
      requireClient().agents.create({
        projectId: floorId,
        name: draft.name.trim(),
        role: draft.role,
        provider: draft.provider,
        auth: draft.auth,
        model: draft.model.trim(),
        effort: draft.effort,
        appearance: { gender: draft.gender },
        basePrompt: draft.basePrompt,
        skillPack: draft.role === "clerk" ? "none" : draft.role,
      }),
    onSuccess: () => {
      setDraft(EMPTY);
      onAdded?.();
    },
  });
  const add = (): void => {
    if (draft.name.trim() !== "") {
      create.mutate();
    }
  };
  return (
    <Card className="grid grid-cols-2 gap-x-4 gap-y-3 p-4 text-xs">
      <div className="col-span-2">
        <Field id="ho-new-agent-name" label={t("agent.name")}>
          <Input
            id="ho-new-agent-name"
            value={draft.name}
            onChange={(e) => {
              setDraft({ ...draft, name: e.target.value });
            }}
          />
        </Field>
      </div>
      <Field id="ho-new-agent-role" label={t("agent.role")}>
        <Select
          id="ho-new-agent-role"
          value={draft.role}
          options={ROLES.map((role) => ({ value: role, label: t(ROLE_KEY[role]) }))}
          onChange={(role) => {
            setDraft({ ...draft, role, ...defaultChoice(draft.provider, role) });
          }}
        />
      </Field>
      <Field id="ho-new-agent-gender" label={t("agent.gender")}>
        <Select
          id="ho-new-agent-gender"
          value={draft.gender}
          options={Gender.options.map((gender) => ({
            value: gender,
            label: t(GENDER_KEY[gender]),
          }))}
          onChange={(gender) => {
            setDraft({ ...draft, gender });
          }}
        />
      </Field>
      <ProviderModelFields
        value={draft}
        role={draft.role}
        onChange={(next) => {
          setDraft({ ...draft, ...next });
        }}
      />
      <div className="col-span-2">
        <Field id="ho-new-agent-prompt" label={t("agent.basePrompt")}>
          <Textarea
            id="ho-new-agent-prompt"
            className="h-20 resize-none"
            value={draft.basePrompt}
            onChange={(e) => {
              setDraft({ ...draft, basePrompt: e.target.value });
            }}
          />
        </Field>
      </div>
      <div className="col-span-2 flex justify-end">
        <Button variant="primary" disabled={create.isPending} onClick={add}>
          {t("agent.add")}
        </Button>
      </div>
      <div className="col-span-2">
        <Failure error={create.error} />
      </div>
    </Card>
  );
}
