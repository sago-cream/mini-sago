import { expect, test } from "bun:test";
import type { OracleAnswerJob } from "../../contracts/worker-contract";
import { verifyDeveloperOutcome } from "./developer-runtime";
import type { DeveloperWorkspace } from "./developer-workspace";
const head = "a".repeat(40);
const workspace: DeveloperWorkspace = {
  root: "/task",
  directory: "/task/repo",
  temporaryDirectory: "/task/tmp",
  artifactsDirectory: "/task/artifacts",
  attachmentsDirectory: "/task/attachments",
  sandboxReadPaths: [],
  sandboxWritePaths: [],
  environment: {
    MINISAGO_REAL_GIT: "git",
    MINISAGO_REAL_GH: "gh",
    MINISAGO_GIT_BRANCH: "minisago/task",
  },
  cleanup: async () => {},
};
const job = { repository: "owner/repo" } as OracleAnswerJob;
const output = JSON.stringify({ reply: "Opened the PR.", status: "done" });
const verify = (prs: unknown, content = output) =>
  verifyDeveloperOutcome(content, job, workspace, async (args) =>
    args[0] === "gh"
      ? JSON.stringify(prs)
      : args[1] === "rev-parse"
        ? head
        : args[1] === "status"
          ? ""
          : "minisago/task",
  );

test("verifies the repository and exact head before marking a PR ready", async () => {
  const pr = {
    url: "https://github.com/owner/repo/pull/4",
    headRefOid: head,
    state: "OPEN",
    statusCheckRollup: [{ status: "COMPLETED", conclusion: "SUCCESS" }],
  };
  expect((await verify([pr])).taskOutcome).toMatchObject({
    state: "ready_for_review",
    checks: "passed",
    pullRequestUrl: pr.url,
    head,
  });
  expect(
    (await verify([{ ...pr, headRefOid: "b".repeat(40) }])).taskOutcome.state,
  ).toBe("turn_complete");
  expect(
    (await verify([{ ...pr, url: "https://github.com/other/repo/pull/4" }]))
      .taskOutcome.state,
  ).toBe("turn_complete");
  expect(
    (await verify([{ ...pr, statusCheckRollup: [{ status: "IN_PROGRESS" }] }]))
      .taskOutcome.state,
  ).toBe("awaiting_checks");
  expect(
    (
      await verify([
        {
          ...pr,
          statusCheckRollup: [{ status: "COMPLETED", conclusion: "FAILURE" }],
        },
      ])
    ).taskOutcome,
  ).toMatchObject({ state: "needs_input", checks: "failed" });
  expect((await verify([{ ...pr, state: "MERGED" }])).taskOutcome.state).toBe(
    "merged",
  );
});
test("a completed model turn can remain blocked or require input", async () => {
  expect(
    (
      await verify(
        [],
        JSON.stringify({ reply: "Cannot access files.", status: "blocked" }),
      )
    ).taskOutcome.state,
  ).toBe("blocked_environment");
  expect(
    (
      await verify(
        [],
        JSON.stringify({ reply: "Which approach?", status: "needs_input" }),
      )
    ).taskOutcome.state,
  ).toBe("needs_input");
  const result = await verifyDeveloperOutcome(
    output,
    job,
    workspace,
    async (args) => {
      if (args[0] === "gh") throw new Error("Token expired");
      return args[1] === "rev-parse" ? head : "minisago/task";
    },
  );
  expect(result.taskOutcome.state).toBe("blocked_access");
});
