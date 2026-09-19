import { createIdFactory, type ReplayProblem } from "@ho/core";
import { Agent, errorMessage } from "@ho/protocol";
import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openEventStore } from "./index.ts";

const clock = { now: () => new Date("2026-09-18T12:00:00.000Z") };
const ids = createIdFactory(clock, {
  randomize: (bytes) => {
    crypto.getRandomValues(bytes);
  },
});

const agent = {
  id: "01a0aaaa-0000-7000-8000-000000000001",
  name: "Eva",
  role: "developer",
  appearance: { gender: "neutral" },
  provider: "claude-code",
  auth: "subscription",
  model: "opus",
  effort: "high",
  basePrompt: "",
  skillPack: "none",
  budgets: { maxTurnsPerTask: 40, maxWallMinutes: 30, maxConcurrentSessions: 1 },
  projectId: "01a0bbbb-0000-7000-8000-000000000001",
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-01T10:00:00.000Z",
};

const seeded = (rows: readonly { type: string; payload: unknown }[]): string => {
  const path = join(mkdtempSync(join(tmpdir(), "ho-store-")), "office.sqlite");
  const db = new Database(path, { create: true, strict: true });
  db.run(
    `CREATE TABLE events (seq integer PRIMARY KEY AUTOINCREMENT NOT NULL, id text NOT NULL,
     type text NOT NULL, at text NOT NULL, actor text NOT NULL, payload text NOT NULL)`,
  );
  db.run("CREATE UNIQUE INDEX events_id_unique ON events (id)");
  db.run("PRAGMA user_version = 1");
  const insert = db.query(
    "INSERT INTO events (id, type, at, actor, payload) VALUES (?, ?, ?, ?, ?)",
  );
  rows.forEach((row, index) => {
    insert.run(
      `01a0cccc-0000-7000-8000-00000000000${String(index + 1)}`,
      row.type,
      "2026-09-01T10:00:00.000Z",
      JSON.stringify({ kind: "human" }),
      JSON.stringify(row.payload),
    );
  });
  db.close();
  return path;
};

const replay = async (path: string): Promise<{ events: string[]; problems: ReplayProblem[] }> => {
  const store = await openEventStore(path, { ids, clock });
  const problems: ReplayProblem[] = [];
  const events: string[] = [];
  for await (const event of store.read(undefined, (problem) => {
    problems.push(problem);
  })) {
    events.push(event.type);
  }
  store.close();
  return { events, problems };
};

test("a role renamed since the event was written is migrated on read", async () => {
  const path = seeded([
    { type: "agent.created", payload: { agent: { ...agent, role: "worker" } } },
  ]);
  const { events, problems } = await replay(path);
  expect(problems).toEqual([]);
  expect(events).toEqual(["agent.created"]);
});

test("an event the schema no longer accepts is reported, not thrown", async () => {
  const path = seeded([
    { type: "agent.created", payload: { agent } },
    { type: "agent.created", payload: { agent: { ...agent, provider: "retired-vendor" } } },
    { type: "agent.created", payload: { agent } },
  ]);
  const { events, problems } = await replay(path);
  expect(events).toEqual(["agent.created", "agent.created"]);
  expect(problems).toHaveLength(1);
  expect(problems[0]?.seq).toBe(2);
  expect(problems[0]?.type).toBe("agent.created");
  expect(problems[0]?.reason).toContain("does not match the current schema");
});

test("replay still refuses to guess when no reporter is given", async () => {
  const path = seeded([
    { type: "agent.created", payload: { agent: { ...agent, effort: "ultra" } } },
  ]);
  const store = await openEventStore(path, { ids, clock });
  let thrown: unknown = null;
  try {
    for await (const event of store.read()) {
      expect(event.seq).toBeGreaterThan(0);
    }
  } catch (error) {
    thrown = error;
  }
  store.close();
  expect(thrown).toBeInstanceOf(Error);
  expect(errorMessage(thrown)).toContain("does not match the current schema");
});

test("an event written today reads back unchanged", async () => {
  const path = seeded([]);
  const store = await openEventStore(path, { ids, clock });
  const [appended] = await store.append([
    { type: "agent.created", actor: { kind: "human" }, payload: { agent: Agent.parse(agent) } },
  ]);
  expect(appended?.type).toBe("agent.created");
  store.close();
  const { events, problems } = await replay(path);
  expect(problems).toEqual([]);
  expect(events).toEqual(["agent.created"]);
});
