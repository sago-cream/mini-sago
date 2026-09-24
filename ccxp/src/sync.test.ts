import { test, expect } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { meetingLink, AuthRequired, downloadMeeting } from "./source";
import { extractPages } from "./extract";
import { syncMeetings } from "./sync";
import { readDocuments } from "./store";

const base =
  "https://www.ccxp.nthu.edu.tw/ccxp/INQUIRE/OT/SCRT/2/1.php?ACIXSTORE=secret";
test("observed CCXP view links accept duplicate session parameters but never publish secrets", () => {
  const link = meetingLink(
    "1",
    "  114學年度第4次校務會議紀錄(1150602)\n",
    "view.php?ACIXSTORE=&l=opaque&ACIXSTORE=secret",
    base,
  )!;
  expect(link.sourceUrl).toBe(base.split("?")[0]);
  expect(
    meetingLink("1", link.title, "view4.php?l=other&ACIXSTORE=new", base)?.id,
  ).toBe(link.id);
  for (const href of [
    "?ACIXSTORE=secret",
    "https://evil.test/view.php?l=x",
    "../../passwd.php?l=x",
    "javascript:alert(1)",
  ])
    expect(meetingLink("1", "record", href, base)).toBeUndefined();
});

test("HTML extraction removes executable text and handles Chinese", async () => {
  const pages = await extractPages(
    new TextEncoder().encode(
      "<html><script>secret()</script><style>hidden</style><body><h1>校務會議</h1><p>宿舍預算</p></body></html>",
    ),
    "text/html; charset=utf-8",
  );
  expect(pages?.join("")).toContain("宿舍預算");
  expect(pages?.join("")).not.toContain("secret");
  expect(pages?.join("").match(/宿舍預算/gu)).toHaveLength(1);
  expect(
    await extractPages(new Uint8Array([0, 1]), "application/msword"),
  ).toBeNull();
});

test("sync preserves good data on expiry, reports partial coverage, and removes withdrawn records", async () => {
  const root = await mkdtemp(join(tmpdir(), "ccxp-sync-"));
  try {
    const path = join(root, "index.sqlite");
    const links = [1, 2].map(
      (n) =>
        meetingLink(
          "1",
          `第${n}次校務會議`,
          `view.php?l=${n}&ACIXSTORE=secret`,
          base,
        )!,
    );
    let listed = links;
    let expired = false;
    let downloads = 0;
    const source = {
      list: async () => listed,
      download: async () => {
        downloads++;
        if (expired) throw new AuthRequired();
        return {
          bytes: new TextEncoder().encode("<p>宿舍預算</p>"),
          contentType: "text/html; charset=utf-8",
        };
      },
    };
    const now = new Date("2026-09-24T00:00:00Z");
    expect(
      await syncMeetings(source, path, { budget: 1, now, categories: ["1"] }),
    ).toMatchObject({ listed: 2, indexed: 1, pending: 1 });
    expect(readDocuments(path)).toHaveLength(1);
    expect(
      await syncMeetings(source, path, { now, categories: ["1"] }),
    ).toMatchObject({ indexed: 2, pending: 0 });
    expect(downloads).toBe(2);
    const before = await Bun.file(path).arrayBuffer();
    expired = true;
    await expect(
      syncMeetings(source, path, {
        now: new Date("2026-09-26"),
        categories: ["1"],
      }),
    ).rejects.toThrow(AuthRequired);
    expect(await Bun.file(path).arrayBuffer()).toEqual(before);
    expired = false;
    listed = [links[1]];
    await syncMeetings(source, path, { now, categories: ["1"] });
    expect(readDocuments(path).map((d) => d.id)).toEqual([links[1].id]);
    expect(JSON.stringify(readDocuments(path))).not.toContain("ACIXSTORE");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("public academic PDFs use no CCXP cookies and redirects never leave approved hosts", async () => {
  const publicUrl =
    "https://academic.site.nthu.edu.tw/var/file/7/1007/img/4647/393127011.pdf";
  const link = meetingLink("13", "教務會議", publicUrl, base)!;
  expect(link.sourceUrl).toBe(publicUrl);
  expect(meetingLink("1", "wrong category", publicUrl, base)).toBeUndefined();
  expect(
    meetingLink("13", "token leak", publicUrl + "?ACIXSTORE=secret", base),
  ).toBeUndefined();
  const seen: RequestInit[] = [];
  const request = (async (_url: unknown, init?: RequestInit) => {
    seen.push(init!);
    return new Response("%PDF-test", {
      headers: { "content-type": "application/pdf" },
    });
  }) as typeof fetch;
  await downloadMeeting(link, "private-cookie", request);
  expect(seen[0].headers).toEqual({});
  const protectedLink = meetingLink(
    "1",
    "紀錄",
    "view.php?l=opaque&ACIXSTORE=secret",
    base,
  )!;
  await downloadMeeting(protectedLink, "private-cookie", request);
  expect(seen[1].headers).toEqual({ cookie: "private-cookie" });
  let requests = 0;
  const redirect = (async () => {
    requests++;
    return new Response(null, {
      status: 302,
      headers: { location: "https://evil.test/steal" },
    });
  }) as unknown as typeof fetch;
  await expect(
    downloadMeeting(protectedLink, "private-cookie", redirect),
  ).rejects.toThrow(AuthRequired);
  expect(requests).toBe(1);
  const huge = (async () =>
    new Response("x", {
      headers: { "content-length": String(31 * 1024 * 1024) },
    })) as unknown as typeof fetch;
  await expect(
    downloadMeeting(protectedLink, "private-cookie", huge),
  ).rejects.toThrow("too large");
});

test("a bounded backfill visits newest records across categories before older records", async () => {
  const root = await mkdtemp(join(tmpdir(), "ccxp-fair-"));
  try {
    const path = join(root, "index.sqlite");
    const source = {
      list: async (category: "1" | "4") =>
        [1, 2].map(
          (n) => meetingLink(category, `record ${n}`, `view.php?l=${n}`, base)!,
        ),
      download: async () => ({
        bytes: new TextEncoder().encode("<p>text</p>"),
        contentType: "text/html; charset=utf-8",
      }),
    };
    await syncMeetings(source as Parameters<typeof syncMeetings>[0], path, {
      categories: ["1", "4"],
      budget: 2,
    });
    expect(readDocuments(path).map((d) => [d.category, d.title])).toEqual([
      ["1", "record 1"],
      ["4", "record 1"],
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("PDF downloads become searchable pages with correct provenance", async () => {
  const root = await mkdtemp(join(tmpdir(), "ccxp-pdf-"));
  try {
    const path = join(root, "index.sqlite");
    const link = meetingLink("1", "校務會議", "view.php?l=fixture", base)!;
    const source = {
      list: async () => [link],
      download: async () => ({
        bytes: new Uint8Array(
          await Bun.file(
            new URL("../test-fixtures/meeting.pdf", import.meta.url),
          ).arrayBuffer(),
        ),
        contentType: "application/pdf",
      }),
    };
    expect(
      await syncMeetings(source, path, { categories: ["1"] }),
    ).toMatchObject({ indexed: 1, pending: 0 });
    expect(readDocuments(path)[0]).toMatchObject({
      pageKind: "page",
      pages: ["Campus budget approved."],
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
