// Does a real Testcontainers run work against a task's private engine, with the environment the
// daemon hands the sandbox? Started from inside the sandbox, so DOCKER_HOST and the two
// TESTCONTAINERS_* variables are already in place.
import { GenericContainer } from "testcontainers";

const container = await new GenericContainer("postgres:18-alpine")
  .withEnvironment({ POSTGRES_PASSWORD: "verify" })
  .withExposedPorts(5432)
  .start();
const host = container.getHost();
const port = container.getMappedPort(5432);
const socket = await Bun.connect({ hostname: host, port, socket: { data() {} } })
  .then(() => "connected")
  .catch((error) => `failed: ${String(error)}`);
process.stdout.write(`testcontainers host=${host} port=${String(port)} tcp=${socket}\n`);
await container.stop();
process.stdout.write("testcontainers stopped its container\n");
