import { expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { preflightDeveloperRuntime } from "./developer-runtime";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "minisago-preflight-"));
  const git = join(root, ".git");
  const temporaryDirectory = join(root, "tmp");
  await mkdir(git);
  await mkdir(temporaryDirectory);
  const codexPath = join(root, "codex");
  await Bun.write(
    codexPath,
    '#!/bin/sh\necho "bwrap: mount failed" >&2\nexit 101\n',
  );
  await chmod(codexPath, 0o700);
  return {
    root,
    options: {
      workspace: {
        directory: root,
        temporaryDirectory,
        attachmentsDirectory: root,
        environment: {},
        sandboxReadPaths: [],
        sandboxWritePaths: [git, temporaryDirectory],
        cleanup: async () => {},
      },
      codexPath,
      configArguments: [],
      environment: { PATH: process.env.PATH!, TMPDIR: temporaryDirectory },
      repository: "owner/repo",
    },
  };
}

test("rejects a non-directory writable root before launching Codex", async () => {
  const { root, options } = await fixture();
  try {
    const notDirectory = join(root, "socket-placeholder");
    await Bun.write(notDirectory, "not a directory");
    options.workspace.sandboxWritePaths.push(notDirectory);
    await expect(preflightDeveloperRuntime(options)).rejects.toThrow(
      `Sandbox writable root is not a directory: ${notDirectory}`,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("propagates sandbox setup failures instead of starting a model turn", async () => {
  const { root, options } = await fixture();
  try {
    await expect(preflightDeveloperRuntime(options)).rejects.toThrow(
      "bwrap: mount failed",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
