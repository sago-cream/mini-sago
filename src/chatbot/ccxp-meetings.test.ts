import { test, expect } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { publishIndex } from "../../ccxp/src/store";
import type { CcxpDocument } from "../../contracts/ccxp-meetings";
import { FeatureAvailabilityStore } from "../discord/feature-availability";
import { createCcxpMeetingsClient } from "./ccxp-meetings";

test("CCXP registration is required and revocation closes existing clients", async () => {
  const root = await mkdtemp(join(tmpdir(), "ccxp-access-"));
  try {
    const availability = new FeatureAvailabilityStore(
      join(root, "features.json"),
      {},
    );
    const env = { MINISAGO_CCXP_INDEX_PATH: "/private/index.sqlite" };
    for (const guildId of [undefined, "other", "1514899496797212683"])
      expect(
        createCcxpMeetingsClient(env, { guildId }, availability),
      ).toBeUndefined();
    expect(
      createCcxpMeetingsClient(
        {},
        { guildId: "1394943277836402779" },
        availability,
      ),
    ).toBeUndefined();
    for (const guildId of ["1394943277836402779", "1000249491494019092"])
      expect(
        createCcxpMeetingsClient(env, { guildId }, availability),
      ).toBeDefined();
    const guildId = "1514899496797212683";
    await availability.configure({
      feature: "ccxp_meetings",
      scope: "guild",
      targetId: guildId,
      action: "enable",
    });
    const client = createCcxpMeetingsClient(env, { guildId }, availability)!;
    expect(client).toBeDefined();
    await availability.configure({
      feature: "ccxp_meetings",
      scope: "guild",
      targetId: guildId,
      action: "disable",
    });
    expect(
      createCcxpMeetingsClient(env, { guildId }, availability),
    ).toBeUndefined();
    expect(
      await client.call("search_ccxp_meetings", { query: "校務" }),
    ).toEqual({ status: "forbidden" });
    expect(
      await client.call("read_ccxp_meeting", { documentId: "a".repeat(32) }),
    ).toEqual({ status: "forbidden" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Chinese bigram search, page reads, freshness, and snapshot replacement", async () => {
  const root = await mkdtemp(join(tmpdir(), "ccxp-index-"));
  try {
    const path = join(root, "meetings.sqlite");
    const client = createCcxpMeetingsClient(
      { MINISAGO_CCXP_INDEX_PATH: path },
      { guildId: "1394943277836402779" },
      new FeatureAvailabilityStore(join(root, "features.json"), {}),
    )!;
    expect(
      (await client.call("search_ccxp_meetings", { query: "宿舍" })).status,
    ).toBe("unavailable");
    const doc: CcxpDocument = {
      id: "a".repeat(32),
      category: "1",
      title: "114學年度第4次校務會議紀錄",
      sourceUrl: "https://www.ccxp.nthu.edu.tw/ccxp/INQUIRE/OT/SCRT/2/1.php",
      fetchedAt: "2026-01-01T00:00:00Z",
      state: "indexed",
      pageKind: "page",
      pages: [
        "校 園\n宿 舍興建工程的預算。Campus housing budget.",
        "課程委員會審議。" + "內容".repeat(7000),
        "",
      ],
    };
    const coverage = {
      checkedAt: doc.fetchedAt,
      listed: 3,
      indexed: 1,
      pending: 2,
      empty: 0,
      unsupported: 0,
    };
    await publishIndex(path, [doc], coverage);
    const result = await client.call("search_ccxp_meetings", {
      query: "宿舍 預算",
    });
    expect(
      (await client.call("search_ccxp_meetings", { query: "housing budget" }))
        .results,
    ).toHaveLength(1);
    expect(result).toMatchObject({
      status: "complete",
      stale: true,
      coverage: { pending: 2 },
      results: [{ documentId: doc.id, page: 1, pageCount: 3 }],
    });
    expect(
      (await client.call("search_ccxp_meetings", { query: "宿舍 課程" }))
        .results,
    ).toEqual([]);
    expect(
      (
        await client.call("search_ccxp_meetings", {
          query: "宿舍",
          category: "4",
        })
      ).results,
    ).toEqual([]);
    const titleHits = await client.call("search_ccxp_meetings", {
      query: "校務",
    });
    expect(
      (titleHits.results as { page: number }[]).some((p) => p.page === 3),
    ).toBe(false);
    expect(
      await client.call("read_ccxp_meeting", { documentId: doc.id, page: 3 }),
    ).toMatchObject({ textStatus: "no_extractable_text" });
    const read = await client.call("read_ccxp_meeting", {
      documentId: doc.id,
      page: 2,
    });
    expect(read.nextOffset).toBe(12000);
    expect(
      (
        await client.call("read_ccxp_meeting", {
          documentId: doc.id,
          page: 2,
          offset: 12000,
        })
      ).nextOffset,
    ).toBeNull();
    expect(
      (await client.call("read_ccxp_meeting", { documentId: doc.id, page: 4 }))
        .status,
    ).toBe("not_found");
    await expect(
      client.call("read_ccxp_meeting", {
        documentId: doc.id,
        url: "https://evil.test",
      }),
    ).rejects.toThrow();
    await publishIndex(path, [], {
      ...coverage,
      checkedAt: new Date().toISOString(),
      indexed: 0,
    });
    expect(
      await client.call("search_ccxp_meetings", { query: "宿舍" }),
    ).toMatchObject({ stale: false, results: [] });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
