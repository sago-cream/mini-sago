import { expect, test } from "bun:test";
import {
  parseDeploymentArguments,
  resolveDeploymentCommit,
} from "./deploy.mjs";

const commit = "a".repeat(40);
test("deploys remote main from an isolated or dirty feature worktree", () => {
  const calls: unknown[] = [];
  const output = (command: string, args: string[]) => {
    calls.push([command, args]);
    return `${commit}\trefs/heads/main`;
  };
  expect(resolveDeploymentCommit(undefined, output)).toBe(commit);
  expect(calls).toEqual([
    ["git", ["ls-remote", "--exit-code", "origin", "refs/heads/main"]],
  ]);
  expect(() => resolveDeploymentCommit("b".repeat(40), output)).toThrow(
    "origin/main",
  );
});
test("requires an explicit full SHA to query a job", () => {
  expect(parseDeploymentArguments(["--commit", commit, "--status"])).toEqual({
    commit,
    wait: true,
    status: true,
  });
  expect(parseDeploymentArguments(["--no-wait"])).toEqual({
    commit: undefined,
    wait: false,
    status: false,
  });
  for (const args of [
    ["--commit"],
    ["--commit", "main"],
    ["--status"],
    ["--force"],
  ])
    expect(() => parseDeploymentArguments(args)).toThrow();
});
