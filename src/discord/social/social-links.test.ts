import { describe, expect, test } from "bun:test";

import {
  getInstagramReplyUrls,
  getSocialLinkReplacement,
  getThreadsReplyUrls,
  getTwitterReplyUrls,
} from "./social-links";

describe("getInstagramReplyUrls", () => {
  test("returns only the transformed URL from a message", () => {
    expect(
      getInstagramReplyUrls(
        "look at this https://instagram.com/reel/abc/ please!",
      ),
    ).toEqual(["https://kkinstagram.com/reel/abc/"]);
  });

  test("returns each transformed URL without trailing punctuation", () => {
    expect(
      getInstagramReplyUrls(
        "(https://www.instagram.com/reel/a/), https://m.instagram.com/p/b/.",
      ),
    ).toEqual([
      "https://www.kkinstagram.com/reel/a/",
      "https://m.kkinstagram.com/p/b/",
    ]);
  });

  test("ignores links that are already transformed", () => {
    expect(
      getInstagramReplyUrls("https://www.kkinstagram.com/reel/abc/"),
    ).toEqual([]);
  });
});

describe("getTwitterReplyUrls", () => {
  test("transforms Twitter and X links to FxTwitter", () => {
    expect(
      getTwitterReplyUrls(
        "https://twitter.com/minisago/status/1 https://x.com/minisago/status/2",
      ),
    ).toEqual([
      "https://fxtwitter.com/minisago/status/1",
      "https://fxtwitter.com/minisago/status/2",
    ]);
  });

  test("normalizes mobile and www hosts and preserves query parameters", () => {
    expect(
      getTwitterReplyUrls(
        "(https://mobile.twitter.com/minisago/status/1?s=20), https://www.x.com/minisago/status/2.",
      ),
    ).toEqual([
      "https://fxtwitter.com/minisago/status/1?s=20",
      "https://fxtwitter.com/minisago/status/2",
    ]);
  });

  test("ignores links that are already transformed", () => {
    expect(
      getTwitterReplyUrls("https://fxtwitter.com/minisago/status/1"),
    ).toEqual([]);
  });
});

describe("getThreadsReplyUrls", () => {
  test("handles both Threads domains, subdomains, and surrounding punctuation", () => {
    expect(
      getThreadsReplyUrls(
        "https://threads.net/@alice/post/abc https://threads.com/@bob/post/def " +
          "(https://www.threads.net/@alice/post/ghi?xmt=A#media), " +
          "<https://www.threads.com/@bob/post/jkl/>",
      ),
    ).toEqual([
      "https://fixthreads.seria.moe/@alice/post/abc",
      "https://fixthreads.seria.moe/@bob/post/def",
      "https://fixthreads.seria.moe/@alice/post/ghi?xmt=A#media",
      "https://fixthreads.seria.moe/@bob/post/jkl/",
    ]);
  });

  test.each([
    "https://fixthreads.seria.moe/@alice/post/abc",
    "https://www.fixthreads.seria.moe/@alice/post/abc",
    "https://notthreads.com/@alice/post/abc",
    "https://threads.net.example.com/@alice/post/abc",
    "https://threads.com@example.com/@alice/post/abc",
  ])("ignores transformed or unrelated URL %s", (url) => {
    expect(getThreadsReplyUrls(url)).toEqual([]);
    expect(getSocialLinkReplacement(url)).toBeNull();
  });
});

describe("getSocialLinkReplacement", () => {
  test("preserves the message while suppressing original social embeds", () => {
    expect(
      getSocialLinkReplacement(
        "look https://instagram.com/reel/abc/, then https://x.com/user/status/1! " +
          "also https://threads.com/@alice/post/abc.",
      ),
    ).toBe(
      "look <https://instagram.com/reel/abc/>, then <https://x.com/user/status/1>! " +
        "also <https://threads.com/@alice/post/abc>.\n" +
        "https://kkinstagram.com/reel/abc/\n" +
        "https://fxtwitter.com/user/status/1\n" +
        "https://fixthreads.seria.moe/@alice/post/abc",
    );
  });

  test("does not wrap an already suppressed original link twice", () => {
    expect(getSocialLinkReplacement("<https://www.instagram.com/p/abc/>")).toBe(
      "<https://www.instagram.com/p/abc/>\nhttps://www.kkinstagram.com/p/abc/",
    );
    expect(
      getSocialLinkReplacement("<https://www.threads.net/@alice/post/abc>"),
    ).toBe(
      "<https://www.threads.net/@alice/post/abc>\nhttps://fixthreads.seria.moe/@alice/post/abc",
    );
  });

  test("returns null when there is no original social link", () => {
    expect(getSocialLinkReplacement("https://example.com")).toBeNull();
  });
});
