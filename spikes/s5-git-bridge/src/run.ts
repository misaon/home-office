// Spike S5: git-bridge flow. Host repo (RO) -> task volume clone -> agent commits -> bridge pushes ho/* branch back.
import { $ } from "bun";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const BRIDGE = "ho/git-bridge:spike";
const AGENT = "ho/agent:spike";
const suffix = crypto.randomUUID().slice(0, 8);
const volume = `ho-spike-task-${suffix}`;
const branch = `ho/spike-${suffix}`;
const hostRepo = mkdtempSync(join(tmpdir(), "ho-s5-host-"));

const bridgeContext = resolve(import.meta.dir, "../../../images/git-bridge");
await $`docker buildx build --platform linux/arm64 -t ${BRIDGE} ${bridgeContext}`.quiet();

// 1. A host repository with one commit on main.
await $`git -C ${hostRepo} init -q -b main`;
await Bun.write(join(hostRepo, "README.md"), "# spike\n");
await $`git -C ${hostRepo} -c user.name=owner -c user.email=owner@localhost add -A`;
await $`git -C ${hostRepo} -c user.name=owner -c user.email=owner@localhost commit -q -m init`;

try {
  await $`docker volume create --label ho.managed=true --label ho.kind=spike ${volume}`.quiet();

  // 2. Bridge clones the host repo (mounted read-only) into the task volume and creates the task branch.
  const t0 = performance.now();
  await $`docker run --rm --platform linux/arm64 -v ${hostRepo}:/src:ro -v ${volume}:/work ${BRIDGE} clone -q --branch main --single-branch /src /work/repo`;
  await $`docker run --rm --platform linux/arm64 -v ${volume}:/work ${BRIDGE} -C /work/repo checkout -q -b ${branch}`;
  const tClone = performance.now();

  // 3. The agent container (no host mounts at all) edits and commits inside the volume.
  const agentScript =
    "printf 'hello from agent\\n' >> README.md && git -c user.name=agent -c user.email=agent@localhost commit -q -am 'feat: agent change'";
  await $`docker run --rm --platform linux/arm64 -v ${volume}:/work -w /work/repo ${AGENT} sh -c ${agentScript}`;
  const tCommit = performance.now();

  // 4. Bridge pushes the branch to the host repo (read-write mount, this exact command only).
  await $`docker run --rm --platform linux/arm64 -v ${hostRepo}:/src -v ${volume}:/work ${BRIDGE} -C /work/repo push -q /src HEAD:refs/heads/${branch}`;
  const tPush = performance.now();

  // 5. Verify on the host: branch exists, working tree untouched, commit content correct.
  const branches = (await $`git -C ${hostRepo} branch --list ${branch}`.text()).trim();
  const status = (await $`git -C ${hostRepo} status --porcelain`.text()).trim();
  const content = await $`git -C ${hostRepo} show ${branch}:README.md`.text();
  const ok = branches.includes(branch) && status === "" && content.includes("hello from agent");
  process.stdout.write(
    [
      `branch on host: ${branches === "" ? "<missing>" : branches}`,
      `host working tree changes: ${status === "" ? "none" : status}`,
      `branch README: ${JSON.stringify(content)}`,
      `timings: clone ${(tClone - t0).toFixed(0)} ms, agent commit ${(tCommit - tClone).toFixed(0)} ms, push ${(tPush - tCommit).toFixed(0)} ms`,
      ok ? "S5 OK" : "S5 FAILED",
    ].join("\n") + "\n",
  );
  if (!ok) {
    process.exitCode = 1;
  }
} finally {
  await $`docker volume remove --force ${volume}`.quiet().nothrow();
  rmSync(hostRepo, { recursive: true, force: true });
}
