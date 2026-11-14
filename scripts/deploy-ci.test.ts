import { expect, test } from "bun:test";

import { deployFromCi } from "./deploy-ci";

const commit = "a".repeat(40);
const newer = "b".repeat(40);
const unknown = `unknown ${commit}`;
const accepted = `accepted ${commit}`;
const status = (value: string, exitCode: number | null = null) =>
  JSON.stringify({
    commit,
    status: value,
    exitCode,
    updatedAt: "2026-11-14T00:00:00Z",
  });

function client(responses: string[], mains = [commit]) {
  const calls: string[] = [];
  let time = 0;
  return {
    calls,
    run: () =>
      deployFromCi({
        commit,
        currentMain: () => (mains.length > 1 ? mains.shift()! : mains[0]!),
        request: (command) => {
          calls.push(command);
          const response = responses.shift();
          if (!response) throw new Error("Unexpected request");
          return response;
        },
        now: () => time,
        wait: async () => {
          time += 60_000;
        },
      }),
  };
}

test("submits the bounded job and waits for commit-specific completion", async () => {
  const ci = client([
    unknown,
    accepted,
    status("queued"),
    status("running"),
    status("complete", 0),
  ]);
  expect(await ci.run()).toBe("complete");
  expect(ci.calls).toEqual(["status", "deploy", "status", "status", "status"]);
});

test("joins an existing deployment and does not resubmit it", async () => {
  const ci = client([status("running"), status("complete", 0)]);
  expect(await ci.run()).toBe("complete");
  expect(ci.calls).toEqual(["status", "status"]);
});

test("a completed release makes repeated CI runs idempotent", async () => {
  const ci = client([status("complete", 0)]);
  expect(await ci.run()).toBe("complete");
  expect(ci.calls).toEqual(["status"]);
});

test("waits for a busy host before submitting an unaccepted job", async () => {
  const ci = client([
    unknown,
    "busy deployment-in-progress",
    unknown,
    accepted,
    status("complete", 0),
  ]);
  expect(await ci.run()).toBe("complete");
  expect(ci.calls).toEqual(["status", "deploy", "status", "deploy", "status"]);
});

test("skips commits superseded before submission", async () => {
  const ci = client([], [newer]);
  expect(await ci.run()).toBe("superseded");
  expect(ci.calls).toEqual([]);
});

test("handles a main change between the client check and host validation", async () => {
  const ci = client(
    [unknown, "denied commit-is-not-origin-main"],
    [commit, newer],
  );
  expect(await ci.run()).toBe("superseded");
});

test("reports host failure without automatically redeploying an accepted job", async () => {
  const ci = client([unknown, accepted, status("failed", 42)]);
  await expect(ci.run()).rejects.toThrow("failed: 42");
  expect(ci.calls.filter((command) => command === "deploy")).toHaveLength(1);
});

test("allows an explicit CI rerun to retry a failed release", async () => {
  const ci = client([status("failed", 42), accepted, status("complete", 0)]);
  expect(await ci.run()).toBe("complete");
});

test("bounds waiting without cancelling or resubmitting the host job", async () => {
  const ci = client(Array.from({ length: 20 }, () => status("running")));
  await expect(ci.run()).rejects.toThrow("host job may still be running");
  expect(ci.calls).not.toContain("deploy");
});

test("fails closed on invalid main, unexpected denial, or a mismatched status", async () => {
  await expect(client([], ["invalid"]).run()).rejects.toThrow(
    "Unable to resolve",
  );
  await expect(
    client([unknown, "denied origin-main-unavailable"]).run(),
  ).rejects.toThrow("origin-main-unavailable");
  await expect(
    client([unknown, "denied commit-is-not-origin-main"]).run(),
  ).rejects.toThrow("commit-is-not-origin-main");
  await expect(
    client([status("complete", 0).replace(commit, newer)]).run(),
  ).rejects.toThrow("Invalid MiniSago deployment status");
});
