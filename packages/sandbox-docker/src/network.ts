import { Created, type DockerApi, NetworkInspect } from "./api.ts";

const ICC_OPTION = "com.docker.network.bridge.enable_icc";

const networkMismatch = (
  network: NetworkInspect,
  labels: Readonly<Record<string, string>>,
): string | null => {
  if (network.Driver !== "bridge") {
    return `its driver is ${network.Driver}, not bridge`;
  }
  if (network.Options?.[ICC_OPTION] !== "false") {
    return "it lets its containers talk to each other (enable_icc is not false)";
  }
  const missing = Object.entries(labels).find(([key, value]) => network.Labels?.[key] !== value);
  return missing === undefined ? null : `it lacks the office label ${missing[0]}=${missing[1]}`;
};

export async function ensureNetwork(
  api: DockerApi,
  name: string,
  labels: Readonly<Record<string, string>>,
): Promise<void> {
  const found = await api.maybe("GET", `/networks/${encodeURIComponent(name)}`);
  if (found === null) {
    await api.json(Created, "POST", "/networks/create", {
      Name: name,
      Driver: "bridge",
      Options: { [ICC_OPTION]: "false" },
      Labels: { ...labels },
    });
    return;
  }
  const mismatch = networkMismatch(NetworkInspect.parse(await found.json()), labels);
  if (mismatch !== null) {
    throw new Error(
      `the Docker network "${name}" already exists but ${mismatch}; remove it with \`docker network rm ${name}\` or point docker.network at another name`,
    );
  }
}
