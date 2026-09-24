export const CCXP_ORIGIN = "https://www.ccxp.nthu.edu.tw";
export const CCXP_LOGIN = `${CCXP_ORIGIN}/ccxp/INQUIRE/`;
export const CCXP_MEETINGS_PATH = "/ccxp/INQUIRE/OT/SCRT/2/";
export const CCXP_CATEGORIES = {
  "1": "校務會議",
  "4": "行政會議",
  "16": "校務會報會議",
  "17": "校務發展委員會會議",
  "10": "校務監督委員會會議",
  "11": "校務基金管理委員會會議",
  "12": "校園景觀環境審議委員會會議",
  "13": "教務會議",
  "14": "校課程委員會議",
  "15": "校教評會會議",
  "19": "學務會議",
} as const;
export type CcxpCategory = keyof typeof CCXP_CATEGORIES;
export type CcxpDocument = {
  id: string;
  category: CcxpCategory;
  title: string;
  // Source URLs intentionally contain neither session tokens nor document keys.
  sourceUrl: string;
  fetchedAt: string;
  state: "indexed" | "empty" | "unsupported";
  pageKind: "page" | "section";
  pages: string[];
};
export type CcxpCoverage = {
  checkedAt: string;
  listed: number;
  indexed: number;
  pending: number;
  empty: number;
  unsupported: number;
};
export function normalizeMeetingText(text: string) {
  return text.normalize("NFKC").toLowerCase().replace(/\s+/gu, "");
}
// Bigrams allow two-character Chinese queries; Latin words are indexed whole.
export function meetingTokens(text: string) {
  const normalized = normalizeMeetingText(text);
  const tokens = new Set(
    text
      .normalize("NFKC")
      .toLowerCase()
      .match(/[a-z0-9]+/gu) ?? [],
  );
  for (const run of normalized.match(/[\p{Script=Han}]+/gu) ?? []) {
    const chars = [...run];
    for (let i = 0; i < chars.length - 1; i++)
      tokens.add(chars.slice(i, i + 2).join(""));
  }
  return [...tokens].join(" ");
}
