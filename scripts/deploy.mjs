import { execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import {
  COMMIT_SHA,
  deploymentCommand,
  exchangeDeploymentRequest,
  parseDeploymentStatus,
} from "./deploy-socket";

export function parseDeploymentArguments(args) {
  let commit;
  let wait = true;
  let status = false;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--commit" && !commit) commit = args[++index];
    else if (args[index] === "--no-wait") wait = false;
    else if (args[index] === "--status") status = true;
    else
      throw new Error(
        "Usage: bun run deploy [--commit <full SHA>] [--no-wait | --status]",
      );
  }
  if (
    (commit !== undefined && !COMMIT_SHA.test(commit)) ||
    args.at(-1) === "--commit"
  )
    throw new Error("MiniSago deployment requires a full commit SHA.");
  if (status && !commit)
    throw new Error("Deployment status requires --commit <full SHA>.");
  return { commit, wait, status };
}

export function resolveDeploymentCommit(requested, output) {
  const main = output("git", [
    "ls-remote",
    "--exit-code",
    "origin",
    "refs/heads/main",
  ]).split(/\s/u)[0];
  if (!COMMIT_SHA.test(main)) throw new Error("Unable to resolve origin/main.");
  if (requested && requested !== main)
    throw new Error(
      "Deploy the current origin/main commit. Merge changes through a PR first.",
    );
  return requested ?? main;
}

async function main() {
  const args = parseDeploymentArguments(process.argv.slice(2));
  const output = (command, values) =>
    execFileSync(command, values, { encoding: "utf8" }).trim();
  const commit = args.status
    ? args.commit
    : resolveDeploymentCommit(args.commit, output);
  const socket = process.env.MINISAGO_DEPLOY_SOCKET?.trim();
  const host = process.env.SAGO_CLOUD_HOST ?? "sago-cloud";
  const root =
    process.env.SAGO_CLOUD_OPERATIONS_ROOT ?? "/srv/sago-cloud/operations";
  if (!/^\/[a-zA-Z0-9_./-]+$/u.test(root))
    throw new Error("Invalid operations root.");
  const request = async (command) => {
    const protocol = deploymentCommand(command, commit);
    if (socket) return exchangeDeploymentRequest(socket, protocol);
    return execFileSync(
      "ssh",
      [
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=10",
        host,
        `${root}/scripts/request-minisago-deploy ${command} ${commit}`,
      ],
      { encoding: "utf8", timeout: 20_000 },
    ).trim();
  };
  if (args.status) {
    console.log(
      JSON.stringify(parseDeploymentStatus(await request("status"), commit)),
    );
    return;
  }
  const accepted = await request("deploy");
  if (accepted !== `accepted ${commit}`) throw new Error(accepted);
  console.log(`MiniSago deployment accepted: ${commit}`);
  if (!args.wait) return;
  const deadline = Date.now() + 20 * 60_000;
  let previous;
  while (Date.now() < deadline) {
    const status = parseDeploymentStatus(await request("status"), commit);
    if (status.status !== previous)
      console.log(`MiniSago deployment: ${status.status}`);
    previous = status.status;
    if (status.status === "failed")
      throw new Error(
        `Deployment ${commit} failed with exit code ${status.exitCode}.`,
      );
    if (status.status === "complete") return;
    await delay(5_000);
  }
  throw new Error(
    `Deployment is still pending. Check bun run deploy --status --commit ${commit}`,
  );
}

if (import.meta.main) {
  await main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
