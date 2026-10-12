import { afterEach, expect, test } from "bun:test";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { BotStatusStore, botStatusFile } from "./bot-status";
import { BotManagement } from "./bot-management";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "minisago-bot-status-"));
  roots.push(root);
  const file = join(root, "bot-status.json");
  return { root, file, store: new BotStatusStore(file, "initial") };
}

test("saved status survives a new bot process and overrides the configured default", async () => {
  const { file, store } = await fixture();
  const first = new BotManagement(() => null, store);
  expect(
    await first.updateCustomStatus({
      text: "mini.sagocream.com",
      presence: "idle",
    }),
  ).toEqual({ status: "saved", text: "mini.sagocream.com", presence: "idle" });
  first.dispose();
  const restarted = new BotManagement(
    () => null,
    new BotStatusStore(file, "different environment default"),
  );
  expect(restarted.getPresence()).toMatchObject({
    status: "idle",
    activities: [{ state: "mini.sagocream.com" }],
  });
  restarted.dispose();
});

test("cleared text is persisted, writes are restricted, and temporary files are cleaned up", async () => {
  const { file, root, store } = await fixture();
  await store.save({ text: "", presence: "invisible" });
  expect(JSON.parse(await readFile(file, "utf8"))).toEqual({
    version: 1,
    text: "",
    presence: "invisible",
  });
  expect(new BotStatusStore(file, "initial").load()).toEqual({
    text: "",
    presence: "invisible",
  });
  expect((await stat(file)).mode & 0o777).toBe(0o600);
  expect(await readdir(root)).toEqual(["bot-status.json"]);
});

test("only a missing file falls back to the configured initial text", async () => {
  const { file, store } = await fixture();
  expect(store.load()).toEqual({ text: "initial", presence: "online" });
  expect(new BotStatusStore(file, "").load()).toEqual({
    text: "",
    presence: "online",
  });
  for (const content of [
    "broken json",
    JSON.stringify({ version: 2, text: "a", presence: "online" }),
    JSON.stringify({ version: 1, text: "a", presence: "offline" }),
  ]) {
    await writeFile(file, content);
    expect(() => store.load()).toThrow();
    expect(await readFile(file, "utf8")).toBe(content);
  }
});

test("failed persistence does not report success or leave temporary files", async () => {
  const { root } = await fixture();
  const blocker = join(root, "not-a-directory");
  await writeFile(blocker, "keep");
  const store = new BotStatusStore(join(blocker, "bot-status.json"), "initial");
  await expect(
    store.save({ text: "new", presence: "online" }),
  ).rejects.toThrow();
  expect(await readFile(blocker, "utf8")).toBe("keep");
  expect(await readdir(root)).toEqual(["not-a-directory"]);
});

test("state path defaults match the persistent core volume and local data directory", () => {
  expect(botStatusFile({ NODE_ENV: "production" })).toBe(
    "/app/state/bot-status.json",
  );
  expect(botStatusFile({ NODE_ENV: "development" })).toBe(
    ".data/bot-status.json",
  );
  expect(
    botStatusFile({ MINISAGO_BOT_STATUS_FILE: " /custom/status.json " }),
  ).toBe("/custom/status.json");
});
