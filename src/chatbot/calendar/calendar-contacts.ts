import { z } from "zod";

export const CONTACTS_SPREADSHEET_ID =
  "1e-GG1m6AqVsJAEtQ6fLd-qL8amTPvr2lOXKC_J_hJnU";
export const CONTACTS_SHEET_ID = 817689538;
export const contactsSchema = z
  .object({
    query: z
      .string()
      .trim()
      .min(2)
      .max(80)
      .regex(/[\p{L}\p{N}]/u),
    limit: z.number().int().min(1).max(10).default(10),
  })
  .strict();
const normalize = (value: string) =>
  value.normalize("NFKC").toLowerCase().replace(/\s+/gu, "");

export function matchCalendarContacts(
  rows: string[][],
  query: string,
  limit: number,
) {
  const header = rows[0] ?? [];
  const required = [
    "Last Name",
    "Middle Name",
    "First Name",
    "Nickname",
    "Organization Name",
    "E-mail 1 - Value",
  ];
  if (required.some((name) => !header.includes(name)))
    throw new Error(
      "Contact directory headers changed; an administrator must check the configured sheet.",
    );
  const needle = normalize(query);
  const found = new Map<
    string,
    {
      name: string;
      nickname: string;
      organization: string;
      email: string;
      exact: boolean;
    }
  >();
  for (const row of rows.slice(1)) {
    const cell = (name: string) =>
      (row[header.indexOf(name)] ?? "").trim().slice(0, 300);
    const name = [cell("Last Name"), cell("Middle Name"), cell("First Name")]
      .filter(Boolean)
      .join(" ");
    const nickname = cell("Nickname");
    const organization = cell("Organization Name");
    const email = cell("E-mail 1 - Value");
    if (!name || !z.email().safeParse(email).success) continue;
    const terms = [name, nickname, organization, email].map(normalize);
    if (!terms.some((value) => value.includes(needle))) continue;
    const contact = {
      name,
      nickname,
      organization,
      email,
      exact: terms.some((value) => value === needle),
    };
    found.set(`${normalize(name)}:${email.toLowerCase()}`, contact);
  }
  const matches = [...found.values()].sort(
    (a, b) => Number(b.exact) - Number(a.exact),
  );
  return {
    matches: matches
      .slice(0, limit)
      .map(({ exact: _exact, ...contact }) => contact),
    matchCount: matches.length,
    truncated: matches.length > limit,
    requiresSelection: matches.length !== 1,
  };
}
