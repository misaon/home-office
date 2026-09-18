import { Agent, AgentRole, SessionMode } from "@ho/protocol";
import { rolePack } from "@ho/core";
import { expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { skillPacksFor } from "./skill-pack.ts";
import { SkillLibrary } from "./skills.ts";

const PLUGINS = resolve(import.meta.dir, "../../../images/agent/plugins");
const library = new SkillLibrary(PLUGINS);

const packs = readdirSync(PLUGINS, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .toSorted();

const skillDirs = (pack: string): string[] =>
  readdirSync(join(PLUGINS, pack, "skills"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

test("every pack that ships holds at least one skill the library can read", async () => {
  expect(packs.length).toBeGreaterThan(0);
  for (const pack of packs) {
    const index = await library.index([pack]);
    expect(index.length, `pack ${pack} indexes no skill`).toBe(skillDirs(pack).length);
  }
});

test("every SKILL.md parses; a colon in an unquoted description would not", async () => {
  for (const pack of packs) {
    for (const dir of skillDirs(pack)) {
      const body = await library.read([pack], dir);
      expect(body.name, `${pack}/${dir} parsed under a different name`).toBe(dir);
      expect(body.description.length, `${pack}/${dir} has no description`).toBeGreaterThan(0);
      expect(body.body.length, `${pack}/${dir} has no body`).toBeGreaterThan(0);
    }
  }
});

test("every role resolves to a pack with skills, and no role is left without one", async () => {
  for (const role of AgentRole.options) {
    const pack = rolePack(role);
    expect(pack, `role ${role} maps to no pack`).not.toBe("none");
    const index = await library.index([pack]);
    expect(
      index.length,
      `role ${role} resolves to pack ${pack}, which indexes nothing`,
    ).toBeGreaterThan(0);
  }
});

const agentOf = (role: AgentRole): Agent =>
  Agent.parse({
    id: "01a0aaaa-0000-7000-8000-000000000001",
    name: "Someone",
    role,
    appearance: { gender: "neutral" },
    provider: "opencode",
    model: "x",
    effort: "high",
    skillPack: rolePack(role),
    budgets: {},
    projectId: "01a0bbbb-0000-7000-8000-000000000001",
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
  });

test("every role in every session mode is given something to read", async () => {
  for (const mode of SessionMode.options) {
    for (const role of AgentRole.options) {
      const index = await library.index(skillPacksFor(agentOf(role), mode));
      expect(index.length, `${role} in a ${mode} session sees no skill`).toBeGreaterThan(0);
    }
  }
});
