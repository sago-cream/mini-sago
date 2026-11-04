import { expect, test } from "bun:test";
import { decodeEntities } from "./job-utils";

test("decodes named, decimal, and hexadecimal entities without losing Unicode", () => {
  expect(decodeEntities("&amp; &LT; &quot; &#20013; &#x1F365;")).toBe(
    '& < " 中 🍥',
  );
  expect(decodeEntities("&#x10ffff;")).toBe(String.fromCodePoint(0x10ffff));
});

test("preserves out-of-range numeric entities instead of aborting feed parsing", () => {
  const input = `before &#1114112; &#x110000; &#${"9".repeat(400)}; after`;
  expect(decodeEntities(input)).toBe(input);
});
