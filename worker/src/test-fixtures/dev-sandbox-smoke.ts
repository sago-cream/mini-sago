import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { resolveCodexPath } from "../codex-path";
import {
  developerFilesystemPermissions,
  preflightDeveloperRuntime,
  runtimeCommand,
} from "../developer-runtime";

const root = "/tmp/minisago-sandbox-smoke";
const codexPath = await resolveCodexPath("/usr/local/bin/codex", null, []);
const directory = join(root, "repo");
const temporaryDirectory = join(root, "tmp");
const repositoriesDirectory = join(root, "repositories");
const bin = join(root, "bin");
for (const path of [
  directory,
  temporaryDirectory,
  repositoriesDirectory,
  bin,
  join(root, "codex", "skills"),
])
  await mkdir(path, { recursive: true });
await Bun.spawn(["git", "init", directory], {
  stdout: "ignore",
  stderr: "ignore",
}).exited;
await Bun.write(
  join(bin, "gh"),
  '#!/bin/sh\nprintf \'{"nameWithOwner":"fixture/repo"}\\n\'\n',
);
await Bun.spawn(["chmod", "+x", join(bin, "gh")]).exited;
const workspace = {
  directory,
  repositoriesDirectory,
  temporaryDirectory,
  attachmentsDirectory: root,
  environment: {},
  sandboxReadPaths: [bin],
  sandboxWritePaths: [
    join(directory, ".git"),
    temporaryDirectory,
    repositoriesDirectory,
  ],
  cleanup: async () => {},
};
const environment = {
  ...process.env,
  HOME: root,
  CODEX_HOME: join(root, "codex"),
  TMPDIR: temporaryDirectory,
  PATH: `${bin}:${process.env.PATH}`,
} as Record<string, string>;
const configs = [
  'default_permissions="minisago-dev"',
  `permissions.minisago-dev.filesystem=${developerFilesystemPermissions(environment.CODEX_HOME!, workspace.sandboxReadPaths, workspace.sandboxWritePaths)}`,
  "permissions.minisago-dev.network.enabled=true",
];
await preflightDeveloperRuntime({
  workspace,
  environment,
  repository: "fixture/repo",
  codexPath,
  configArguments: configs.flatMap((c) => ["--config", c]),
});
// Additional repositories share the task's sandbox, including their Git metadata.
const additionalCheckout = join(repositoriesDirectory, "fixture", "other");
await runtimeCommand(
  [
    codexPath,
    "sandbox",
    ...configs.flatMap((c) => ["--config", c]),
    "--",
    "/bin/sh",
    "-c",
    'set -eu; git clone --no-hardlinks "$1" "$2"; cd "$2"; git switch -c chore/minisago-smoke; echo preserved > follow-up.txt',
    "minisago-additional-repo",
    directory,
    additionalCheckout,
  ],
  directory,
  environment,
);
await runtimeCommand(
  [
    codexPath,
    "sandbox",
    ...configs.flatMap((c) => ["--config", c]),
    "--",
    "/bin/sh",
    "-c",
    'set -eu; test "$(cat "$1/follow-up.txt")" = preserved; echo continued >> "$1/follow-up.txt"',
    "minisago-additional-repo-resume",
    additionalCheckout,
  ],
  directory,
  environment,
);
// Check that the bundled uploader is executable inside the developer sandbox.
await runtimeCommand(
  [
    codexPath,
    "sandbox",
    ...configs.flatMap((c) => ["--config", c]),
    "--",
    "gh-image",
    "--version",
  ],
  directory,
  environment,
);
// Repeat with a new process and the same persistent paths, as a task follow-up does.
await preflightDeveloperRuntime({
  workspace,
  environment,
  repository: "fixture/repo",
  codexPath,
  configArguments: configs.flatMap((c) => ["--config", c]),
});
// A directory writable by the worker must still be protected from task commands.
const outside = "/tmp/minisago-outside-task";
await mkdir(outside, { recursive: true });
await runtimeCommand(
  [
    codexPath,
    "sandbox",
    ...configs.flatMap((c) => ["--config", c]),
    "--",
    "/bin/sh",
    "-c",
    'if touch "$1/should-not-exist" 2>/dev/null; then echo "Sandbox allowed a write outside the task" >&2; exit 1; fi',
    "minisago-boundary-check",
    outside,
  ],
  directory,
  environment,
);
console.log(
  `Sandbox readiness, continuation, and write boundary passed as UID ${process.getuid?.()}.`,
);
