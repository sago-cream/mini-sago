import { expect, test } from "bun:test";
import { endDeveloperThreadTarget } from "./developer-thread-control";

test.each([
  "end dev thread",
  "Please end this development thread!",
  "close the coding thread.",
  "結束這個開發討論串",
])("recognizes an explicit end command: %s", (request) => {
  expect(endDeveloperThreadTarget(request, "current")).toBe("current");
});

test.each([
  "end dev thread 123456789012345678",
  "end dev thread <#123456789012345678>",
  "end dev thread https://discord.com/channels/917436845187563610/123456789012345678",
  "end dev thread https://discord.com/channels/917436845187563610/123456789012345678/123456789012345679",
])("recognizes an exact target: %s", (request) => {
  expect(endDeveloperThreadTarget(request, "current")).toBe(
    "123456789012345678",
  );
});

test.each([
  "stop",
  "pause",
  "status",
  "end",
  "implement an end dev thread command",
  "end dev thread after the tests pass",
  'Someone said "end dev thread"',
  "end dev thread https://example.com/channels/917436845187563610/123456789012345678",
])("leaves other requests alone: %s", (request) => {
  expect(endDeveloperThreadTarget(request, "current")).toBeUndefined();
});
