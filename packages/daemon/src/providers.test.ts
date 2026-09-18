import { EffortLevel, PROVIDERS } from "@ho/protocol";
import { expect, test } from "bun:test";
import { defaultChoice, nearestEffort } from "@ho/core";

test("a level the provider supports is used as asked", () => {
  expect(nearestEffort("high", ["low", "medium", "high", "xhigh"])).toBe("high");
});

test("a level too high falls to the nearest below it, never to the lowest", () => {
  expect(nearestEffort("max", ["low", "medium", "high", "xhigh"])).toBe("xhigh");
  expect(nearestEffort("xhigh", ["low", "medium"])).toBe("medium");
});

test("a level too low rises to the nearest above it", () => {
  expect(nearestEffort("low", ["high", "max"])).toBe("high");
});

test("a provider that ignores effort is left alone", () => {
  expect(nearestEffort("high", [])).toBe("high");
});

test("asking Codex for max gives xhigh, which is what the bug got wrong", () => {
  const codex = PROVIDERS.codex.effortLevels;
  expect(codex).not.toContain("max");
  expect(nearestEffort("max", codex)).toBe("xhigh");
  expect(nearestEffort("max", codex)).not.toBe("low");
});

test("every role on every provider lands on a level that provider accepts", () => {
  for (const provider of Object.values(PROVIDERS)) {
    for (const role of [
      "boss",
      "secretary",
      "analyst",
      "backend",
      "frontend",
      "devops",
      "qa",
      "security",
      "head",
      "developer",
    ] as const) {
      const { effort } = defaultChoice(provider.id, role);
      expect(EffortLevel.options, `${provider.id}/${role}`).toContain(effort);
      if (provider.effortLevels.length > 0) {
        expect(provider.effortLevels, `${provider.id}/${role}`).toContain(effort);
      }
    }
  }
});

test("no role is silently downgraded below what its provider can give", () => {
  for (const provider of Object.values(PROVIDERS)) {
    if (provider.effortLevels.length === 0) {
      continue;
    }
    for (const wanted of EffortLevel.options) {
      const got = nearestEffort(wanted, provider.effortLevels);
      const distance = Math.abs(
        EffortLevel.options.indexOf(got) - EffortLevel.options.indexOf(wanted),
      );
      const best = Math.min(
        ...provider.effortLevels.map((level) =>
          Math.abs(EffortLevel.options.indexOf(level) - EffortLevel.options.indexOf(wanted)),
        ),
      );
      expect(distance, `${provider.id} wanted ${wanted}, got ${got}`).toBe(best);
    }
  }
});
