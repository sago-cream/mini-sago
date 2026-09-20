import { expect, test } from "bun:test";
import { matchCalendarContacts } from "./calendar-contacts";
const header = [
  "Last Name",
  "Middle Name",
  "First Name",
  "Nickname",
  "Organization Name",
  "Labels",
  "E-mail 1 - Label",
  "E-mail 1 - Value",
];
test("matches Chinese names across spaces and returns ambiguity without notes or phone numbers", () => {
  const rows = [
    header,
    [
      "陳",
      "",
      "宇",
      "宇",
      "資訊處",
      "",
      "work",
      "yu@example.com",
      "private note",
      "mobile",
      "0912345678",
    ],
    ["陳", "", "宇", "小宇", "秘書處", "", "work", "other@example.com"],
  ];
  const result = matchCalendarContacts(rows, "陳宇", 10);
  expect(result.matchCount).toBe(2);
  expect(result.requiresSelection).toBe(true);
  expect(result.matches[0]?.email).toBe("yu@example.com");
  expect(JSON.stringify(result)).not.toContain("0912345678");
  expect(JSON.stringify(result)).not.toContain("private note");
  expect(matchCalendarContacts(rows, "missing", 10).matches).toEqual([]);
  expect(matchCalendarContacts(rows, "資訊", 10).requiresSelection).toBe(false);
});
test("does not guess malformed emails and reports truncated matches", () => {
  const rows = [
    header,
    ...Array.from({ length: 12 }, (_, i) => [
      "Person",
      "",
      "" + i,
      "",
      "team",
      "",
      "",
      `p${i}@example.com`,
    ]),
    ["Person", "", "unknown", "", "team", "", "", "broken"],
  ];
  const result = matchCalendarContacts(rows, "team", 3);
  expect(result.matchCount).toBe(12);
  expect(result.matches).toHaveLength(3);
  expect(result.truncated).toBe(true);
  expect(() => matchCalendarContacts([["wrong"]], "Person", 10)).toThrow(
    "headers changed",
  );
});
