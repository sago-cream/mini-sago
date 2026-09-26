import { access, constants, stat } from "node:fs/promises";
import { join } from "node:path";
import type { DeveloperWorkspace } from "./developer-workspace";

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
