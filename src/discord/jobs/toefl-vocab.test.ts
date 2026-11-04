import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { DiscordRequest } from "../api/request";

import {
  buildToeflVocabMessagePayload,
  formatToeflVocabMessage,
  selectDailyToeflVocabEntry,
  sendDailyToeflVocabIfDue,
  type ToeflVocabEntry,
} from "./toefl-vocab";

const entries: ToeflVocabEntry[] = [
  {
    word: "abate",
    partOfSpeech: "verb",
    definition: "To lessen in force or intensity.",
    sourceUrl: "https://en.wiktionary.org/wiki/abate",
  },
  {
    word: "adapt",
    partOfSpeech: "verb",
    definition: "To make suitable.",
    sourceUrl: "https://en.wiktionary.org/wiki/adapt",
  },
];

describe("selectDailyToeflVocabEntry", () => {
  test("rotates deterministically and wraps around the word list", () => {
    expect(
      ["2026-06-27", "2026-06-28", "2026-06-29"].map(
        (date) => selectDailyToeflVocabEntry(entries, date).word,
      ),
    ).toEqual(["adapt", "abate", "adapt"]);
  });
});

describe("formatToeflVocabMessage", () => {
  test("formats a concise panel text display", () => {
    const message = formatToeflVocabMessage({
      entry: {
        ...entries[0],
        zhTw: "減弱；緩和",
        example: "The storm began to abate after midnight.",
        synonyms: ["lessen", "subside"],
      },
      attribution: {
        sourceName: "Wiktionary",
        sourceUrl: "https://en.wiktionary.org/wiki/Wiktionary:Main_Page",
        license: "CC BY-SA 4.0",
        licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
      },
    });

    expect(message).toBe(
      [
        "TOEFL Word of the Day",
        "## [abate](<https://en.wiktionary.org/wiki/abate>)",
        "*verb* · 減弱；緩和",
        "> The storm began to abate after midnight.",
        "",
        "[Wiktionary](<https://en.wiktionary.org/wiki/Wiktionary:Main_Page>) · [CC BY-SA 4.0](<https://creativecommons.org/licenses/by-sa/4.0/>)",
      ].join("\n"),
    );
    expect(message).not.toContain("To lessen in force or intensity.");
    expect(message).not.toContain("Example:");
    expect(message).not.toContain("Source:");
    expect(message).not.toContain("License:");
  });

  test("builds a Components V2 payload", () => {
    const payload = buildToeflVocabMessagePayload({
      entry: entries[1],
      wordBank: {
        sourceName: "AWL",
        sourceUrl: "https://www.eapfoundation.com/vocab/academic/awllists/",
      },
      attribution: {
        sourceName: "Wiktionary",
        sourceUrl: "https://en.wiktionary.org/wiki/Wiktionary:Main_Page",
        license: "CC BY-SA 4.0",
        licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
      },
    });

    expect(payload.flags).toBe((1 << 15) | (1 << 2));
    expect(payload.components).toEqual([
      {
        type: 10,
        content: [
          "TOEFL Word of the Day",
          "## [adapt](<https://en.wiktionary.org/wiki/adapt>)",
          "*verb*",
          "",
          "[AWL](<https://www.eapfoundation.com/vocab/academic/awllists/>) · [Wiktionary](<https://en.wiktionary.org/wiki/Wiktionary:Main_Page>) · [CC BY-SA 4.0](<https://creativecommons.org/licenses/by-sa/4.0/>)",
        ].join("\n"),
      },
    ]);
  });
});

test("retries only failed vocabulary destinations using the saved daily payload", async () => {
  const root = await mkdtemp(join(tmpdir(), "minisago-vocab-delivery-"));
  const config = {
    botToken: "test",
    dailyTime: "08:00",
    timezone: "Asia/Taipei",
    stateFile: join(root, "state.json"),
  };
  const destinations = [
    { guildId: "guild", channelId: "first" },
    { guildId: "guild", channelId: "second" },
  ];
  const sends: Array<{ path: string; body: unknown }> = [];
  let failed = true;
  const discordRequest = (async (path, options) => {
    if (options?.method !== "POST") return { guild_id: "guild" };
    sends.push({ path, body: options.body });
    if (path.includes("/second/") && failed) throw new Error("offline");
    return { id: "message" };
  }) as DiscordRequest;
  const now = new Date("2026-11-04T01:00:00Z");
  try {
    await sendDailyToeflVocabIfDue(config, now, {
      destinations,
      discordRequest,
    });
    const partial = JSON.parse(await readFile(config.stateFile, "utf8"));
    expect(partial.lastSentDate).toBeUndefined();
    expect(partial.pendingDelivery.deliveredChannelIds).toEqual(["first"]);
    const firstPayload = sends[0].body;
    sends.length = 0;
    failed = false;
    await sendDailyToeflVocabIfDue(config, now, {
      destinations,
      discordRequest,
    });
    expect(sends).toEqual([
      { path: "/channels/second/messages", body: firstPayload },
    ]);
    const complete = JSON.parse(await readFile(config.stateFile, "utf8"));
    expect(complete.lastSentDate).toBe("2026-11-04");
    expect(complete.pendingDelivery).toBeUndefined();
    sends.length = 0;
    await sendDailyToeflVocabIfDue(config, now, {
      destinations,
      discordRequest,
    });
    expect(sends).toEqual([]);
    await sendDailyToeflVocabIfDue(config, new Date("2026-11-05T01:00:00Z"), {
      destinations,
      discordRequest,
    });
    expect(sends.map(({ path }) => path)).toEqual([
      "/channels/first/messages",
      "/channels/second/messages",
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("keeps completed legacy vocabulary state and leaves total failures due", async () => {
  const root = await mkdtemp(join(tmpdir(), "minisago-vocab-failure-"));
  const config = {
    botToken: "test",
    dailyTime: "08:00",
    timezone: "Asia/Taipei",
    stateFile: join(root, "state.json"),
  };
  const options = {
    destinations: [{ guildId: "guild", channelId: "channel" }],
    discordRequest: (async () => {
      throw new Error("offline");
    }) as DiscordRequest,
  };
  try {
    await expect(
      sendDailyToeflVocabIfDue(
        config,
        new Date("2026-11-04T01:00:00Z"),
        options,
      ),
    ).rejects.toThrow("Every service destination failed");
    await expect(readFile(config.stateFile)).rejects.toThrow();
    await writeFile(
      config.stateFile,
      JSON.stringify({ lastSentDate: "2026-11-04", lastSentWord: "adapt" }),
    );
    await sendDailyToeflVocabIfDue(
      config,
      new Date("2026-11-04T01:00:00Z"),
      options,
    );
    expect(JSON.parse(await readFile(config.stateFile, "utf8"))).toEqual({
      lastSentDate: "2026-11-04",
      lastSentWord: "adapt",
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
