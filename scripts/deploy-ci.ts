import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { COMMIT_SHA, parseDeploymentStatus } from "./deploy-socket";

type DeploymentClient = {
  commit: string;
  currentMain: () => string | Promise<string>;
  request: (command: "deploy" | "status") => string | Promise<string>;
  wait?: () => Promise<void>;
  now?: () => number;
};

export async function deployFromCi({
  commit,
  currentMain,
  request,
  wait = () => delay(5_000),
  now = Date.now,
}: DeploymentClient) {
  if (!COMMIT_SHA.test(commit))
    throw new Error("CD requires a full commit SHA.");
  const isCurrent = async () => {
    const main = await currentMain();
    if (!COMMIT_SHA.test(main))
      throw new Error("Unable to resolve origin/main.");
    return main === commit;
  };
  const deadline = now() + 20 * 60_000;
  let submitted = false;
  let previous;
  while (now() < deadline) {
    if (!submitted && !(await isCurrent())) return "superseded";
    const response = await request("status");
    const status =
      response === `unknown ${commit}`
        ? undefined
        : parseDeploymentStatus(response, commit);
    if (status?.status === "complete") return "complete";
    if (!submitted && (!status || status.status === "failed")) {
      const accepted = await request("deploy");
      if (accepted === "busy deployment-in-progress") {
        await wait();
        continue;
      }
      if (
        accepted === "denied commit-is-not-origin-main" &&
        !(await isCurrent())
      )
        return "superseded";
      if (accepted !== `accepted ${commit}`) throw new Error(accepted);
      submitted = true;
    } else {
      if (!status) throw new Error("Accepted deployment status is missing.");
      submitted = true;
      if (status.status === "failed")
        throw new Error(`Deployment ${commit} failed: ${status.exitCode}.`);
      if (status.status !== previous)
        console.log(`MiniSago deployment: ${status.status}`);
      previous = status.status;
    }
    await wait();
  }
  throw new Error(
    `Deployment wait timed out; the host job may still be running. Query status for ${commit} before retrying.`,
  );
}

if (import.meta.main) {
  const commit = process.argv[2] ?? "";
  const host = process.env.SAGO_CLOUD_HOST ?? "sago-cloud";
  const result = await deployFromCi({
    commit,
    currentMain: () =>
      execFileSync(
        "git",
        ["ls-remote", "--exit-code", "origin", "refs/heads/main"],
        {
          encoding: "utf8",
          timeout: 20_000,
        },
      ).split(/\s/u)[0] ?? "",
    request: (command) =>
      execFileSync(
        "ssh",
        [
          "-i",
          join(homedir(), ".ssh/sago-cloud-cd"),
          "-o",
          "BatchMode=yes",
          "-o",
          "IdentitiesOnly=yes",
          "-o",
          "StrictHostKeyChecking=yes",
          "-o",
          "ConnectTimeout=10",
          `ubuntu@${host}`,
          `/srv/sago-cloud/operations/scripts/request-minisago-deploy ${command} ${commit}`,
        ],
        { encoding: "utf8", timeout: 45_000 },
      ).trim(),
  });
  console.log(`MiniSago CD ${commit}: ${result}`);
}
