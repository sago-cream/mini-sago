import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { DiscordRequest } from "../api/request";
import { shouldSkipImageReminder } from "./reminder-images";
import { ReminderScheduler, type Reminder } from "./reminders";

const reminder: Reminder = {
  id: "test",
  requesterUserId: "123",
  channelId: "456",
  content: "draw",
  createdAt: "2026-09-01T00:00:00Z",
  nextRunAt: "2026-09-11T15:00:00Z",
  cron: "0 23 * * *",
  timezone: "Asia/Taipei",
  skipIfImagePosted: { threadId: "789", userId: "123" },
};
const now = new Date("2026-09-11T15:00:00Z");
const message = (timestamp = "2026-09-10T16:00:00Z", author = "123") => ({
  id: "1000",
  timestamp,
  author: { id: author },
  attachments: [{ content_type: "image/png" }],
});
function request(pages: unknown[][], paths: string[] = []): DiscordRequest {
  return (async (path: string) => {
    paths.push(path);
    return path.includes("/messages?")
      ? (pages.shift() ?? [])
      : { parent_id: "456" };
  }) as DiscordRequest;
}

test("matches only the target user's images in the current Taipei day", async () => {
  expect(
    await shouldSkipImageReminder(reminder, request([[message()]]), now),
  ).toBe(true);
  expect(
    await shouldSkipImageReminder(
      reminder,
      request([[message("2026-09-10T15:59:59Z")]]),
      now,
    ),
  ).toBe(false);
  expect(
    await shouldSkipImageReminder(
      reminder,
      request([[message(undefined, "999")]]),
      now,
    ),
  ).toBe(false);
  expect(
    await shouldSkipImageReminder(
      reminder,
      request([[{ ...message(), attachments: [] }]]),
      now,
    ),
  ).toBe(false);
  expect(
    await shouldSkipImageReminder(
      reminder,
      request([
        [
          {
            ...message(),
            attachments: [{ content_type: "video/mp4", filename: "image.png" }],
          },
        ],
      ]),
      now,
    ),
  ).toBe(false);
  expect(
    await shouldSkipImageReminder(
      reminder,
      request([[{ ...message(), attachments: [{ filename: "photo.JPG" }] }]]),
      now,
    ),
  ).toBe(true);
  expect(
    await shouldSkipImageReminder(
      reminder,
      request([
        [
          {
            ...message(),
            attachments: [],
            embeds: [{ image: { url: "https://example.com/image.png" } }],
          },
        ],
      ]),
      now,
    ),
  ).toBe(true);
});

test("paginates busy threads and avoids fetching for ordinary reminders", async () => {
  const paths: string[] = [];
  const page = Array.from({ length: 100 }, (_, i) => ({
    ...message(),
    id: String(2000 - i),
    attachments: [],
  }));
  expect(
    await shouldSkipImageReminder(
      reminder,
      request([page, [message()]], paths),
      now,
    ),
  ).toBe(true);
  expect(paths.at(-1)).toContain("&before=1901");
  const unused: string[] = [];
  expect(
    await shouldSkipImageReminder(
      { ...reminder, skipIfImagePosted: undefined },
      request([], unused),
      now,
    ),
  ).toBe(false);
  expect(unused).toEqual([]);
});

test("does not treat Discord failures or the wrong parent as permission to send", async () => {
  const failure = (async () => {
    throw new Error("403");
  }) as DiscordRequest;
  await expect(shouldSkipImageReminder(reminder, failure, now)).rejects.toThrow(
    "403",
  );
  const wrongParent = (async () => ({ parent_id: "999" })) as DiscordRequest;
  await expect(
    shouldSkipImageReminder(reminder, wrongParent, now),
  ).rejects.toThrow("belong");
});

test("persists a skipped day's advancement, preserves condition on edits, and sends the next day", async () => {
  const dir = await mkdtemp(join(tmpdir(), "reminder-images-"));
  const stateFile = join(dir, "reminders.json");
  await writeFile(
    stateFile,
    JSON.stringify({ version: 1, reminders: [reminder] }),
  );
  let current = now;
  let hasImage = true;
  let sent = 0;
  const scheduler = new ReminderScheduler({
    stateFile,
    now: () => current,
    post: async (value) => {
      if (
        await shouldSkipImageReminder(
          value,
          request(hasImage ? [[message()]] : [[]]),
          current,
        )
      )
        return;
      sent++;
    },
  });
  try {
    await scheduler.edit({
      channelId: "456",
      reminderId: "test",
      content: "drawing time",
    });
    await scheduler.tick();
    await scheduler.tick();
    expect(sent).toBe(0);
    const saved = JSON.parse(await readFile(stateFile, "utf8")).reminders[0];
    expect(saved.skipIfImagePosted).toEqual(reminder.skipIfImagePosted);
    expect(saved.nextRunAt).toBe("2026-09-12T15:00:00.000Z");
    current = new Date(saved.nextRunAt);
    hasImage = false;
    await scheduler.tick();
    expect(sent).toBe(1);
  } finally {
    scheduler.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
