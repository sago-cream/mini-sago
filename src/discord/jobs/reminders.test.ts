import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { ReminderScheduler, type Reminder } from "./reminders";

const schedulers: ReminderScheduler[] = [];
const directories: string[] = [];

async function setup(now: Date, post = async (_reminder: Reminder) => {}) {
  const directory = await mkdtemp(join(tmpdir(), "minisago-reminders-"));
  directories.push(directory);
  let currentTime = now;
  const scheduler = new ReminderScheduler({
    stateFile: join(directory, "reminders.json"),
    post,
    now: () => currentTime,
  });
  schedulers.push(scheduler);
  await scheduler.start();
  return {
    scheduler,
    setNow(value: Date) {
      currentTime = value;
    },
    stateFile: join(directory, "reminders.json"),
  };
}

afterEach(async () => {
  for (const scheduler of schedulers.splice(0)) scheduler.stop();
  for (const directory of directories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

describe("Reminder scheduler", () => {
  test("lets anyone in a channel list, edit, and cancel reminders", async () => {
    const test = await setup(new Date("2026-07-25T10:00:00.000Z"));
    const reminder = await test.scheduler.create({
      requesterUserId: "user-1",
      channelId: "channel-1",
      content: "  drink water  ",
      runAt: "2026-07-25T18:30:00+08:00",
    });

    expect(reminder).toMatchObject({
      requesterUserId: "user-1",
      channelId: "channel-1",
      content: "drink water",
      nextRunAt: "2026-07-25T10:30:00.000Z",
    });
    expect(await test.scheduler.list("channel-1")).toHaveLength(1);
    expect(await test.scheduler.list("channel-2")).toEqual([]);

    const edited = await test.scheduler.edit({
      channelId: "channel-1",
      reminderId: reminder.id,
      content: "buy tickets",
      runAt: "2026-07-26T09:00:00+09:00",
      timezone: "Asia/Tokyo",
    });
    expect(edited).toMatchObject({
      id: reminder.id,
      requesterUserId: "user-1",
      content: "buy tickets",
      nextRunAt: "2026-07-26T00:00:00.000Z",
      timezone: "Asia/Tokyo",
    });
    expect(
      await test.scheduler.edit({
        channelId: "channel-2",
        reminderId: reminder.id,
        content: "not allowed from another channel",
      }),
    ).toBeUndefined();
    expect(await test.scheduler.cancel("channel-2", reminder.id)).toBe(false);
    expect(await test.scheduler.cancel("channel-1", reminder.id)).toBe(true);
    expect(
      JSON.parse(await readFile(test.stateFile, "utf8")).reminders,
    ).toEqual([]);
  });

  test("posts a due timer once and removes it", async () => {
    const posted: Reminder[] = [];
    const test = await setup(
      new Date("2026-07-25T10:00:00.000Z"),
      async (reminder) => {
        posted.push(reminder);
      },
    );
    await test.scheduler.create({
      requesterUserId: "user-1",
      channelId: "channel-1",
      content: "stand up",
      runAt: "2026-07-25T10:01:00Z",
    });

    test.setNow(new Date("2026-07-25T10:01:01.000Z"));
    await test.scheduler.tick();
    await test.scheduler.tick();

    expect(posted).toHaveLength(1);
    expect(await test.scheduler.list("channel-1")).toEqual([]);
  });

  test("does not retain a reminder when persistence fails", async () => {
    const directory = await mkdtemp(join(tmpdir(), "minisago-reminders-"));
    directories.push(directory);
    const blockedParent = join(directory, "not-a-directory");
    const scheduler = new ReminderScheduler({
      stateFile: join(blockedParent, "reminders.json"),
      post: async () => {},
      now: () => new Date("2026-07-25T10:00:00.000Z"),
    });
    schedulers.push(scheduler);
    await scheduler.start();
    await writeFile(blockedParent, "blocked");

    await expect(
      scheduler.create({
        requesterUserId: "user-1",
        channelId: "channel-1",
        content: "stand up",
        runAt: "2026-07-25T10:01:00Z",
      }),
    ).rejects.toThrow();
    expect(await scheduler.list("channel-1")).toEqual([]);
  });

  test.each([
    "{broken JSON",
    JSON.stringify({ version: 2, reminders: [] }),
    JSON.stringify({ version: 1, reminders: [null] }),
  ])(
    "preserves invalid saved state and retries after repair: %s",
    async (raw) => {
      const test = await setup(new Date("2026-07-25T10:00:00.000Z"));
      const input = {
        requesterUserId: "user-1",
        channelId: "channel-1",
        content: "stand up",
        runAt: "2026-07-25T10:01:00Z",
      };
      const saved = await test.scheduler.create(input);
      test.scheduler.stop();
      await writeFile(test.stateFile, raw);
      let posted = 0;
      const scheduler = new ReminderScheduler({
        stateFile: test.stateFile,
        post: async () => {
          posted++;
        },
        now: () => new Date("2026-07-25T10:00:00.000Z"),
      });
      schedulers.push(scheduler);

      await expect(scheduler.start()).rejects.toThrow();
      await expect(scheduler.create(input)).rejects.toThrow();
      await expect(scheduler.list("channel-1")).rejects.toThrow();
      await expect(scheduler.cancel("channel-1", saved.id)).rejects.toThrow();
      await expect(scheduler.tick()).rejects.toThrow();
      expect(posted).toBe(0);
      expect(await readFile(test.stateFile, "utf8")).toBe(raw);

      await writeFile(
        test.stateFile,
        JSON.stringify({ version: 1, reminders: [saved] }),
      );
      const added = await scheduler.create({
        ...input,
        content: "drink water",
      });
      expect(await scheduler.list("channel-1")).toEqual([saved, added]);
    },
  );

  test("does not treat an unreadable state path as an empty schedule", async () => {
    const directory = await mkdtemp(join(tmpdir(), "minisago-reminders-"));
    directories.push(directory);
    const scheduler = new ReminderScheduler({
      stateFile: directory,
      post: async () => {},
    });
    schedulers.push(scheduler);

    await expect(scheduler.start()).rejects.toThrow();
    await expect(scheduler.list("channel-1")).rejects.toThrow();
  });

  test("keeps a reminder active when cancellation cannot be persisted", async () => {
    const test = await setup(new Date("2026-07-25T10:00:00.000Z"));
    const reminder = await test.scheduler.create({
      requesterUserId: "user-1",
      channelId: "channel-1",
      content: "stand up",
      runAt: "2026-07-25T10:01:00Z",
    });
    // A directory at the temporary-file path makes the real state write fail.
    await mkdir(`${test.stateFile}.tmp`);

    await expect(
      test.scheduler.cancel("channel-1", reminder.id),
    ).rejects.toThrow();
    expect(await test.scheduler.list("channel-1")).toEqual([reminder]);
    expect(
      JSON.parse(await readFile(test.stateFile, "utf8")).reminders,
    ).toEqual([reminder]);

    await rm(`${test.stateFile}.tmp`, { recursive: true });
    expect(await test.scheduler.cancel("channel-1", reminder.id)).toBe(true);
    expect(await test.scheduler.list("channel-1")).toEqual([]);
    expect(
      JSON.parse(await readFile(test.stateFile, "utf8")).reminders,
    ).toEqual([]);
  });

  test("advances recurring cron reminders in their timezone", async () => {
    const posted: Reminder[] = [];
    const test = await setup(
      new Date("2026-07-25T00:00:00.000Z"),
      async (reminder) => {
        posted.push({ ...reminder });
      },
    );
    const reminder = await test.scheduler.create({
      requesterUserId: "user-1",
      channelId: "channel-1",
      content: "daily check-in",
      cron: "0 9 * * *",
      timezone: "Asia/Taipei",
    });
    expect(reminder.nextRunAt).toBe("2026-07-25T01:00:00.000Z");

    test.setNow(new Date("2026-07-25T01:00:01.000Z"));
    await test.scheduler.tick();

    expect(posted).toHaveLength(1);
    expect((await test.scheduler.list("channel-1"))[0]?.nextRunAt).toBe(
      "2026-07-26T01:00:00.000Z",
    );
  });

  test("preserves a recurring reminder's timezone when replacing its cron", async () => {
    const test = await setup(new Date("2026-07-25T00:00:00.000Z"));
    const reminder = await test.scheduler.create({
      requesterUserId: "user-1",
      channelId: "channel-1",
      content: "daily check-in",
      cron: "0 9 * * *",
      timezone: "Asia/Tokyo",
    });
    const edited = await test.scheduler.edit({
      channelId: "channel-1",
      reminderId: reminder.id,
      cron: "0 10 * * *",
    });
    expect(edited).toMatchObject({
      timezone: "Asia/Tokyo",
      nextRunAt: "2026-07-25T01:00:00.000Z",
    });
    expect(
      JSON.parse(await readFile(test.stateFile, "utf8")).reminders,
    ).toEqual([edited]);

    expect(
      await test.scheduler.edit({
        channelId: "channel-1",
        reminderId: reminder.id,
        cron: "0 10 * * *",
        timezone: "Asia/Taipei",
      }),
    ).toMatchObject({
      timezone: "Asia/Taipei",
      nextRunAt: "2026-07-25T02:00:00.000Z",
    });
  });

  test("uses Taipei when editing a legacy reminder without a timezone", async () => {
    const test = await setup(new Date("2026-07-25T00:00:00.000Z"));
    const reminder = await test.scheduler.create({
      requesterUserId: "user-1",
      channelId: "channel-1",
      content: "daily check-in",
      runAt: "2026-07-25T01:00:00Z",
    });
    expect(
      await test.scheduler.edit({
        channelId: "channel-1",
        reminderId: reminder.id,
        cron: "0 10 * * *",
      }),
    ).toMatchObject({
      timezone: "Asia/Taipei",
      nextRunAt: "2026-07-25T02:00:00.000Z",
    });
  });

  test("rejects ambiguous, past, offset-less, and invalid cron schedules", async () => {
    const test = await setup(new Date("2026-07-25T10:00:00.000Z"));
    const base = {
      requesterUserId: "user-1",
      channelId: "channel-1",
      content: "test",
    };

    await expect(test.scheduler.create(base)).rejects.toThrow(
      "Provide exactly one",
    );
    await expect(
      test.scheduler.create({
        ...base,
        runAt: "2026-07-25T11:00:00",
      }),
    ).rejects.toThrow("UTC offset");
    await expect(
      test.scheduler.create({
        ...base,
        runAt: "2026-07-25T09:00:00Z",
      }),
    ).rejects.toThrow("future");
    await expect(
      test.scheduler.create({
        ...base,
        cron: "not a cron",
        timezone: "Asia/Taipei",
      }),
    ).rejects.toThrow();
    await expect(
      test.scheduler.create({
        ...base,
        cron: "0 9 * * *",
      }),
    ).rejects.toThrow("IANA timezone");
  });
});
