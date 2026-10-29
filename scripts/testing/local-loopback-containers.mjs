// Recreate only this dedicated stack's published containers, retaining all mounts.
import http from "node:http";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
const dockerExe =
  "C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe";
const socketPath = "\\\\.\\pipe\\dockerDesktopLinuxEngine";
function docker(method, path, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        socketPath,
        path: "/v1.56" + path,
        method,
        headers: { "Content-Type": "application/json" },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          if (res.statusCode >= 400)
            return reject(Error("LOCAL_DOCKER_HTTP_" + res.statusCode));
          resolve(data ? JSON.parse(data) : {});
        });
      },
    );
    req.on("error", reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });
}
async function start(name) {
  try {
    execFileSync(dockerExe, ["start", name], { stdio: "ignore" });
  } catch {
    const state = await docker("GET", `/containers/${name}/json`);
    if (!state.State.Running)
      execFileSync(dockerExe, ["start", name], { stdio: "ignore" });
  }
}
for (const kind of ["db", "inbucket", "kong"]) {
  const name = `supabase_${kind}_buyermatch-local-synthetic`,
    info = await docker("GET", `/containers/${name}/json`);
  if (
    info.Name !== "/" + name ||
    !Object.hasOwn(info.NetworkSettings.Networks, "buyermatch-local-loopback")
  )
    throw Error("LOCAL_CONTAINER_SCOPE_REQUIRED");
  const bindings = info.HostConfig.PortBindings;
  if (
    Object.values(bindings)
      .flat()
      .every((b) => b.HostIp === "127.0.0.1")
  ) {
    if (!info.State.Running) await start(name);
    console.log("Existing loopback configuration verified: " + name);
    continue;
  }
  for (const b of Object.values(bindings).flat()) b.HostIp = "127.0.0.1";
  const endpoints = {};
  for (const [network, value] of Object.entries(info.NetworkSettings.Networks))
    endpoints[network] = { Aliases: value.Aliases };
  // Keep a private recovery configuration before recreating a dedicated container.
  writeFileSync(
    `test-artifacts/${name}-recovery-private.json`,
    JSON.stringify(info),
    { mode: 0o600 },
  );
  const hostConfig = { ...info.HostConfig, PortBindings: bindings };
  hostConfig.Binds = [...(hostConfig.Binds || [])];
  for (const mount of info.Mounts.filter((m) => m.Type === "volume")) {
    if (
      !hostConfig.Binds.some((b) => b.split(":")[1] === mount.Destination) &&
      !hostConfig.Mounts?.some((m) => m.Target === mount.Destination)
    ) {
      hostConfig.Binds.push(
        `${mount.Name}:${mount.Destination}:${mount.RW ? "rw" : "ro"}`,
      );
    }
  }
  await docker("POST", `/containers/${name}/stop?t=10`);
  await docker("DELETE", `/containers/${name}?v=false`);
  await docker("POST", `/containers/create?name=${name}`, {
    ...info.Config,
    HostConfig: hostConfig,
    NetworkingConfig: { EndpointsConfig: endpoints },
  });
  await start(name);
  const verified = await docker("GET", `/containers/${name}/json`);
  if (
    !Object.values(verified.NetworkSettings.Ports)
      .filter(Boolean)
      .flat()
      .every((b) => b.HostIp === "127.0.0.1")
  )
    throw Error("LOOPBACK_VERIFICATION_FAILED");
  console.log("Loopback binding verified: " + name);
}
