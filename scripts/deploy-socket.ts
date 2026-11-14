import { createConnection } from "node:net";

const MAX_RESPONSE_BYTES = 4_096;
const RESPONSE_TIMEOUT_MS = 10_000;
export const COMMIT_SHA = /^[0-9a-f]{40}$/u;
export type DeploymentStatus = {
  commit: string;
  status: "queued" | "waiting_images" | "running" | "complete" | "failed";
  exitCode: number | null;
  updatedAt: string;
};

export function deploymentCommand(
  command: "deploy" | "status",
  commit: string,
) {
  if (!COMMIT_SHA.test(commit))
    throw new Error("MiniSago deployment requires a full commit SHA.");
  return `${command} ${commit}\n`;
}

export function parseDeploymentStatus(
  response: string,
  commit: string,
): DeploymentStatus {
  if (/^(denied|busy|unknown)\b/u.test(response)) throw new Error(response);
  const value = JSON.parse(response) as DeploymentStatus;
  if (
    !value ||
    value.commit !== commit ||
    !["queued", "waiting_images", "running", "complete", "failed"].includes(
      value.status,
    ) ||
    typeof value.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(value.updatedAt)) ||
    (value.exitCode !== null && !Number.isInteger(value.exitCode)) ||
    (value.status === "complete" && value.exitCode !== 0) ||
    (value.status === "failed" &&
      (!Number.isInteger(value.exitCode) || value.exitCode === 0))
  )
    throw new Error("Invalid MiniSago deployment status.");
  return value;
}

export async function exchangeDeploymentRequest(
  socketPath: string,
  request: string,
) {
  if (!socketPath.startsWith("/"))
    throw new Error("MINISAGO_DEPLOY_SOCKET must be an absolute path.");
  return await new Promise<string>((resolve, reject) => {
    const socket = createConnection(socketPath);
    let response = "";
    let settled = false;
    const timeout = setTimeout(() => {
      socket.destroy(new Error("MiniSago deployment socket timed out."));
    }, RESPONSE_TIMEOUT_MS);
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      socket.destroy();
      const result = response.trim();
      if (!result || /^(denied|busy|unknown)\b/u.test(result))
        reject(
          new Error(result || "MiniSago deployment socket closed silently."),
        );
      else resolve(result);
    };
    socket.setEncoding("utf8");
    socket.on("connect", () => socket.write(request));
    socket.on("data", (chunk: string) => {
      response += chunk;
      if (Buffer.byteLength(response) > MAX_RESPONSE_BYTES) {
        socket.destroy(
          new Error("MiniSago deployment socket returned too much data."),
        );
        return;
      }
      if (response.includes("\n")) finish();
    });
    socket.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    socket.on("close", finish);
  });
}

export async function requestMinisagoDeployment(
  socketPath: string,
  commit: string,
) {
  const result = await exchangeDeploymentRequest(
    socketPath,
    deploymentCommand("deploy", commit),
  );
  if (result !== `accepted ${commit}`) throw new Error(result);
  return result;
}

export async function getMinisagoDeployment(
  socketPath: string,
  commit: string,
) {
  return parseDeploymentStatus(
    await exchangeDeploymentRequest(
      socketPath,
      deploymentCommand("status", commit),
    ),
    commit,
  );
}
