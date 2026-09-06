import { startDaemon } from "@ho/daemon";
import { line } from "../output.ts";

export async function daemon(): Promise<void> {
  const handle = await startDaemon();
  line(
    `daemon ${handle.info.version} listening on ${handle.info.host}:${String(handle.info.port)} (pid ${String(process.pid)})`,
  );
  const shutdown = (): void => {
    void handle.stop().then(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  await new Promise<never>(() => {
    // Keep the process alive until a signal arrives.
  });
}
