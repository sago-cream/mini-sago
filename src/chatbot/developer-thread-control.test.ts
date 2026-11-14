import { expect, test } from "bun:test";
import {
  endDeveloperThreadTarget,
  requestsNewDeveloperThread,
} from "./developer-thread-control";

test.each([
  "open another t3 linked dev thread to work on next.js version update",
  "Please start a new coding session for owner/repo",
  "create a separate T3 thread to fix the tests",
  "open another development thread",
  "另開開發討論串更新 Next.js",
  "請另外開 T3 連結的開發討論串",
])("recognizes a request for separate coding work: %s", (request) => {
  expect(requestsNewDeveloperThread(request)).toBe(true);
});

test.each([
  "continue the Next.js update",
  "open a new file",
  "open another thread about dinner",
  "explain how to open another T3 thread",
  'Someone said "open another t3 linked dev thread"',
  "do not open another coding thread",
  "fix detection of open another coding thread",
  "status",
])("keeps ordinary continuations in their session: %s", (request) => {
  expect(requestsNewDeveloperThread(request)).toBe(false);
});

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
