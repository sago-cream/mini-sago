import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { OracleAnswerJob } from "../../contracts/worker-contract";
import { prepareDeveloperWorkspace } from "./developer-workspace";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function options() {
  const root = await mkdtemp(join(tmpdir(), "minisago-dev-workspace-"));
  roots.push(root);
  return {
    githubConfigDir: "/secrets/github",
    githubRepositories: ["sago-cream/mini-sago"],
    githubWorktreeRoot: join(root, "worktrees"),
  };
}

function job(): OracleAnswerJob {
  return {
    id: "job-123",
    requesterUserId: "917446775873343600",
    purpose: "answer",
    executionRoute: "oracle",
    repository: "sago-cream/mini-sago",
    mcpAccessToken: "test-token",
    channelId: "channel-1",
    requestMessageId: "message-1",
    request: "review the PR",
    messages: [],
  };
}

describe("developer workspace", () => {
  test("clones only the selected repo with the dedicated credential", async () => {
    const commands: Array<{
      command: string[];
      environment: Record<string, string>;
    }> = [];
    const workspace = await prepareDeveloperWorkspace(
      job(),
      await options(),
      async (command, environment) => {
        commands.push({ command, environment });
      },
    );

    expect(workspace.directory).toEndWith(
      "/worktrees/job-123/sago-cream/mini-sago",
    );
    expect(commands).toHaveLength(2);
    expect(commands[0]!.command.slice(0, 4)).toEqual([
      "gh",
      "repo",
      "clone",
      "sago-cream/mini-sago",
    ]);
    expect(commands[0]!.environment.GH_CONFIG_DIR).toBe("/secrets/github");
    expect(workspace.sandboxReadPaths[0]).toEndWith("/worktrees/job-123/bin");
    expect(workspace.sandboxReadPaths[1]).toBe("/secrets/github");
    expect(workspace.sandboxReadPaths).not.toContain(workspace.directory);
    expect(workspace.sandboxWritePaths).toEqual([
      join(workspace.directory, ".git"),
      workspace.temporaryDirectory,
    ]);
    await workspace.cleanup();
  });

  test("prepares every owner coding job on a protected feature branch", async () => {
    const commands: Array<{
      command: string[];
      environment: Record<string, string>;
    }> = [];
    await prepareDeveloperWorkspace(
      job(),
      await options(),
      async (command, environment) => {
        commands.push({ command, environment });
      },
    );

    expect(commands).toHaveLength(2);
    expect(
      commands.every(
        ({ environment }) => environment.GH_CONFIG_DIR === "/secrets/github",
      ),
    ).toBe(true);
    expect(commands[1]!.command.at(-1)).toBe("minisago/job-123");
  });

  test("never supplies the deployment socket as a writable directory", async () => {
    const workspace = await prepareDeveloperWorkspace(
      job(),
      {
        ...(await options()),
        deploySocketPath: "/run/sago-cloud/minisago-deploy.sock",
        deploySocketRepository: "sago-cream/mini-sago",
      },
      async () => undefined,
    );

    expect(workspace.environment.MINISAGO_DEPLOY_SOCKET).toBeUndefined();
    expect(workspace.sandboxWritePaths).toEqual([
      join(workspace.directory, ".git"),
      workspace.temporaryDirectory,
    ]);
  });

  test("hides the deployment socket from other repositories", async () => {
    const workspaceOptions = await options();
    workspaceOptions.githubRepositories.push("sago-cream/other");
    const workspace = await prepareDeveloperWorkspace(
      { ...job(), repository: "sago-cream/other" },
      {
        ...workspaceOptions,
        deploySocketPath: "/run/sago-cloud/minisago-deploy.sock",
        deploySocketRepository: "sago-cream/mini-sago",
      },
      async () => undefined,
    );

    expect(workspace.environment.MINISAGO_DEPLOY_SOCKET).toBeUndefined();
    expect(workspace.sandboxWritePaths).toEqual([
      join(workspace.directory, ".git"),
      workspace.temporaryDirectory,
    ]);
  });

  test("preserves and reuses a coding task workspace", async () => {
    const workspaceOptions = await options();
    const commands: string[][] = [];
    const taskJob = {
      ...job(),
      developerTask: { id: "task-456" },
    };
    const first = await prepareDeveloperWorkspace(
      taskJob,
      workspaceOptions,
      async (command) => {
        commands.push(command);
        if (command.slice(0, 3).join(" ") === "gh repo clone") {
          await mkdir(command[4]!, { recursive: true });
        }
      },
    );
    await first.cleanup();

    const resumed = await prepareDeveloperWorkspace(
      {
        ...taskJob,
        id: "turn-2",
        developerTask: {
          id: "task-456",
          resumeSessionId: "019-session",
        },
      },
      workspaceOptions,
      async (command) => {
        commands.push(command);
      },
    );

    expect(resumed.directory).toBe(first.directory);
    expect(commands).toHaveLength(2);
    await resumed.cleanup();
  });

  test("allows bounded issue, draft PR, and merge mutations", async () => {
    const workspace = await prepareDeveloperWorkspace(
      job(),
      await options(),
      async () => undefined,
    );
    const gh = join(workspace.environment.PATH!.split(":")[0]!, "gh");
    const environment = {
      ...process.env,
      ...workspace.environment,
      MINISAGO_REAL_GH: "/bin/echo",
    };
    const draftPr = Bun.spawn([gh, "pr", "create", "--draft"], {
      env: environment,
      stdout: "ignore",
      stderr: "ignore",
    });
    expect(await draftPr.exited).toBe(0);
    for (const args of [
      ["pr", "edit", "12"],
      ["pr", "ready", "12"],
      ["pr", "comment", "12"],
      ["pr", "review", "12", "--comment"],
      ["run", "rerun", "123", "--failed"],
    ]) {
      expect(
        await Bun.spawn([gh, ...args], {
          env: environment,
          stdout: "ignore",
          stderr: "ignore",
        }).exited,
      ).toBe(0);
    }
    const allowed = Bun.spawn([gh, "issue", "comment", "12"], {
      env: environment,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(await allowed.exited).toBe(0);
    expect(await new Response(allowed.stdout).text()).toContain(
      "issue comment 12",
    );
    const merge = Bun.spawn([gh, "pr", "merge", "12"], {
      env: environment,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(await merge.exited).toBe(0);
    expect(await new Response(merge.stdout).text()).toContain("pr merge 12");
    const denied = Bun.spawn([gh, "pr", "merge", "12", "--admin"], {
      env: environment,
      stdout: "ignore",
      stderr: "ignore",
    });
    expect(await denied.exited).toBe(77);
    const assignedAdmin = Bun.spawn([gh, "pr", "merge", "12", "--admin=true"], {
      env: environment,
      stdout: "ignore",
      stderr: "ignore",
    });
    expect(await assignedAdmin.exited).toBe(77);
  });

  test("rejects a repository outside the worker advertisement", async () => {
    await expect(
      prepareDeveloperWorkspace(
        { ...job(), repository: "sago-cream/other" },
        await options(),
        async () => {
          throw new Error("command should not run");
        },
      ),
    ).rejects.toThrow("not available on this worker");
  });
});

test("retains dirty files and scratch files when a turn never produced a session", async () => {
  const opts = await options();
  const taskJob = { ...job(), developerTask: { id: "task-no-session" } };
  const first = await prepareDeveloperWorkspace(
    taskJob,
    opts,
    async (command) => {
      if (command[0] === "gh") await mkdir(command[4]!, { recursive: true });
    },
  );
  await Bun.write(join(first.directory, "uncommitted.txt"), "keep my work");
  await Bun.write(join(first.temporaryDirectory, "scratch"), "scratch");
  await first.cleanup();
  const second = await prepareDeveloperWorkspace(
    { ...taskJob, id: "turn-two" },
    opts,
    async () => {
      throw new Error("Must not clone or reset an existing workspace");
    },
  );
  expect(await Bun.file(join(second.directory, "uncommitted.txt")).text()).toBe(
    "keep my work",
  );
  expect(
    await Bun.file(join(second.temporaryDirectory, "scratch")).text(),
  ).toBe("scratch");
  await expect(
    prepareDeveloperWorkspace({ ...job(), developerTask: { id: ".." } }, opts),
  ).rejects.toThrow("filesystem-safe");
});
