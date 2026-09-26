import { access, constants, stat } from "node:fs/promises";
import { join } from "node:path";
import type {
  DeveloperTaskOutcome,
  OracleAnswerJob,
} from "../../contracts/worker-contract";
import type { DeveloperWorkspace } from "./developer-workspace";

// Use the same overrides for sandbox readiness, initial threads, and resumed threads.
export const DEV_TOOL_CONFIG = [
  "features.apps=false",
  "features.connectors=false",
  "features.plugins=false",
  "features.skip_host_skill_discovery=true",
  "skills.include_instructions=false",
  "mcp_servers={}",
];

export const DEV_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "status", "artifact"],
  properties: {
    reply: { type: "string", minLength: 1 },
    artifact: {
      type: ["string", "null"],
      description:
        "Absolute path of one requested review artifact in the task artifacts directory, or null. Maximum 8 MB.",
    },
    status: { type: "string", enum: ["done", "needs_input", "blocked"] },
  },
};

export const DEV_RESULT_INSTRUCTIONS = `Return the final answer through the output schema. status=done means this turn's requested work is done; it does not assert that a PR is ready or merged. Use needs_input when a user decision is required and blocked when access or the execution environment prevents progress. Report tests, remaining blockers, and concrete PR/artifact URLs in reply. Preserve already granted owner authorization from earlier turns. Deployment, when available, uses deploy_minisago with an immutable commit; do not call the raw host socket from a shell.`;

export async function runtimeCommand(
  command: string[],
  cwd: string,
  environment: Record<string, string>,
  signal?: AbortSignal,
) {
  const child = Bun.spawn(command, {
    cwd,
    env: environment,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stop = () => child.kill();
  if (signal?.aborted) stop();
  signal?.addEventListener("abort", stop, { once: true });
  const timer = setTimeout(stop, 30_000);
  try {
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (code !== 0 || signal?.aborted)
      throw new Error(
        stderr.trim().slice(-1500) || `Command exited with status ${code}.`,
      );
    return stdout.trim();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", stop);
  }
}

export async function preflightDeveloperRuntime(options: {
  workspace: DeveloperWorkspace;
  codexPath: string;
  configArguments: string[];
  environment: Record<string, string>;
  repository: string;
  signal?: AbortSignal;
}) {
  const { workspace, environment } = options;
  for (const path of [workspace.directory, ...workspace.sandboxWritePaths]) {
    if (!(await stat(path)).isDirectory())
      throw new Error(`Sandbox writable root is not a directory: ${path}`);
    await access(path, constants.R_OK | constants.W_OK);
  }
  // Executed as the worker's service UID through Codex's actual shell sandbox.
  // Positional parameters keep repository and paths out of shell interpolation.
  await runtimeCommand(
    [
      options.codexPath,
      "sandbox",
      ...options.configArguments,
      "--",
      "/bin/sh",
      "-c",
      'set -eu; git rev-parse --show-toplevel; p=$(mktemp "$TMPDIR/preflight.XXXXXX"); rm "$p"; p=$(mktemp .git/minisago-preflight.XXXXXX); rm "$p"; gh repo view "$1" --json nameWithOwner',
      "minisago-preflight",
      options.repository,
    ],
    workspace.directory,
    environment,
    options.signal,
  );
}

export async function checkpointDeveloperWorkspace(
  workspace: DeveloperWorkspace,
  jobId: string,
  sessionId?: string,
) {
  const env = { ...process.env, ...workspace.environment } as Record<
    string,
    string
  >;
  const head = await runtimeCommand(
    [workspace.environment.MINISAGO_REAL_GIT!, "rev-parse", "HEAD"],
    workspace.directory,
    env,
  );
  const branch = await runtimeCommand(
    [workspace.environment.MINISAGO_REAL_GIT!, "branch", "--show-current"],
    workspace.directory,
    env,
  );
  const status = await runtimeCommand(
    [workspace.environment.MINISAGO_REAL_GIT!, "status", "--porcelain=v1"],
    workspace.directory,
    env,
  );
  const checkpoint = {
    version: 1,
    jobId,
    head,
    branch,
    sessionId,
    workspace: workspace.directory,
    dirty: Boolean(status),
    updatedAt: new Date().toISOString(),
  };
  // This records the retained checkout; it is NOT a portable backup or permission to delete it.
  await Bun.write(
    join(workspace.root, "checkpoints", `${jobId}.json`),
    JSON.stringify(checkpoint, null, 2),
  );
  return checkpoint;
}

export async function verifyDeveloperOutcome(
  content: string,
  job: OracleAnswerJob,
  workspace: DeveloperWorkspace,
  run = runtimeCommand,
): Promise<{ content: string; taskOutcome: DeveloperTaskOutcome; files: [] }> {
  const answer = JSON.parse(content) as { reply?: unknown; status?: unknown };
  if (
    typeof answer.reply !== "string" ||
    !["done", "needs_input", "blocked"].includes(String(answer.status))
  ) {
    throw new Error("Invalid coding task outcome.");
  }
  const environment = { ...process.env, ...workspace.environment } as Record<
    string,
    string
  >;
  const head = await run(
    [workspace.environment.MINISAGO_REAL_GIT!, "rev-parse", "HEAD"],
    workspace.directory,
    environment,
  );
  const branch = await run(
    [workspace.environment.MINISAGO_REAL_GIT!, "branch", "--show-current"],
    workspace.directory,
    environment,
  );
  const taskOutcome: DeveloperTaskOutcome = {
    state:
      answer.status === "needs_input"
        ? "needs_input"
        : answer.status === "blocked"
          ? "blocked_environment"
          : "turn_complete",
    workspace: workspace.directory,
    branch,
    head,
  };
  if (
    answer.status === "done" &&
    branch === workspace.environment.MINISAGO_GIT_BRANCH
  ) {
    try {
      const prs = JSON.parse(
        await run(
          [
            workspace.environment.MINISAGO_REAL_GH!,
            "pr",
            "list",
            "--repo",
            job.repository,
            "--head",
            branch,
            "--state",
            "all",
            "--limit",
            "10",
            "--json",
            "url,headRefOid,state,statusCheckRollup,reviewDecision",
          ],
          workspace.directory,
          environment,
        ),
      ) as Array<{
        url: string;
        headRefOid: string;
        state: string;
        reviewDecision?: string;
        statusCheckRollup: Array<{
          status?: string;
          conclusion?: string;
          state?: string;
        }>;
      }>;
      const pr = prs.find(
        (item) =>
          item.headRefOid === head &&
          item.url.startsWith(`https://github.com/${job.repository}/pull/`),
      );
      if (pr) {
        taskOutcome.pullRequestUrl = pr.url;
        const checks = pr.statusCheckRollup ?? [];
        const failed = checks.some((check) =>
          [
            "FAILURE",
            "ERROR",
            "CANCELLED",
            "TIMED_OUT",
            "ACTION_REQUIRED",
          ].includes(check.conclusion ?? check.state ?? ""),
        );
        const pending = checks.some((check) =>
          check.status
            ? check.status !== "COMPLETED"
            : ["PENDING", "EXPECTED"].includes(check.state ?? ""),
        );
        taskOutcome.checks = failed
          ? "failed"
          : pending
            ? "pending"
            : checks.length
              ? "passed"
              : "none";
        const dirty = Boolean(
          await run(
            [workspace.environment.MINISAGO_REAL_GIT!, "status", "--porcelain"],
            workspace.directory,
            environment,
          ),
        );
        if (dirty)
          taskOutcome.detail =
            "The workspace has uncommitted changes; the PR does not include all local work.";
        else if (pr.reviewDecision === "CHANGES_REQUESTED")
          taskOutcome.detail =
            "The pull request has requested changes to address.";
        taskOutcome.state =
          pr.state === "MERGED"
            ? "merged"
            : pr.state === "CLOSED" ||
                dirty ||
                pr.reviewDecision === "CHANGES_REQUESTED"
              ? "needs_input"
              : failed
                ? "needs_input"
                : pending
                  ? "awaiting_checks"
                  : "ready_for_review";
      }
    } catch {
      taskOutcome.state = "blocked_access";
      taskOutcome.detail =
        "The turn finished, but GitHub PR/check readback failed. Publication is unverified.";
    }
  }
  return { content: answer.reply, taskOutcome, files: [] };
}

export function developerFilesystemPermissions(
  codexHome: string,
  readPaths: string[],
  writePaths: string[] = [],
  platform: NodeJS.Platform = process.platform,
) {
  const runtimeReadPaths = platform === "linux" ? ["/proc"] : [];
  const directReads = [
    ...new Set([...runtimeReadPaths, join(codexHome, "skills"), ...readPaths]),
  ]
    .map((path) => `${JSON.stringify(path)}="read"`)
    .join(",");
  const directWrites = [...new Set(writePaths)]
    .map((path) => `${JSON.stringify(path)}="write"`)
    .join(",");
  const directPermissions = [directReads, directWrites]
    .filter(Boolean)
    .join(",");
  return `{":minimal"="read",${directPermissions},":workspace_roots"={"."="write"}}`;
}
