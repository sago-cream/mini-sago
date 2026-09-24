// Explicit operator-only live check; outputs counts, never credentials or document text.
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { Database } from "bun:sqlite";
import { CcxpSource } from "./source";
import { syncMeetings } from "./sync";
import {
  CCXP_CATEGORIES,
  type CcxpCategory,
} from "../../contracts/ccxp-meetings";

if (import.meta.main) {
  if (process.env.CCXP_LIVE_SMOKE !== "true")
    throw new Error("Set CCXP_LIVE_SMOKE=true for an authorized live check.");
  let source: CcxpSource | undefined;
  let stage = "login";
  try {
    const env = parseEnv(
      await readFile(
        process.env.CCXP_CREDENTIALS_FILE ?? "/run/secrets/ccxp.env",
        "utf8",
      ),
    );
    if (!env.CCXP_ACCOUNT || !env.CCXP_PASSWORD)
      throw new Error("Missing credentials");
    source = await CcxpSource.open({
      stateDir: process.env.CCXP_STATE_DIR ?? "/state",
      extensionPath: process.env.CCXP_EXTENSION_PATH ?? "/opt/ccxplite",
      credentials: { account: env.CCXP_ACCOUNT, password: env.CCXP_PASSWORD },
    });
    stage = "list-and-extract";
    const counts: Record<string, number> = {};
    const path = process.env.CCXP_INDEX_PATH ?? "/index/smoke.sqlite";
    const coverage = await syncMeetings(
      {
        list: async (category: CcxpCategory) => {
          const links = await source!.list(category);
          counts[category] = links.length;
          console.log(
            JSON.stringify({ event: "listing", category, count: links.length }),
          );
          return links.slice(0, 1);
        },
        download: async (link) => {
          try {
            const result = await source!.download(link);
            console.log(
              JSON.stringify({
                event: "download",
                category: link.category,
                bytes: result.bytes.length,
                contentType: result.contentType,
              }),
            );
            return result;
          } catch (error) {
            console.error(
              JSON.stringify({
                event: "download_failed",
                category: link.category,
                type:
                  error instanceof Error ? error.constructor.name : "unknown",
                code: (error as { code?: string }).code,
              }),
            );
            throw error;
          }
        },
      },
      path,
      { delayMs: 500 },
    );
    console.log(JSON.stringify({ event: "coverage", ...coverage }));
    const db = new Database(path, { readonly: true });
    const search = db
      .query<
        { n: number },
        []
      >("SELECT count(*) AS n FROM pages_fts WHERE pages_fts MATCH '\"校務\"'")
      .get()!;
    const pages = db
      .query<
        { n: number },
        []
      >("SELECT count(*) AS n FROM pages WHERE length(text)>0")
      .get()!;
    db.close();
    if (
      Object.keys(counts).length !== Object.keys(CCXP_CATEGORIES).length ||
      !search.n ||
      !pages.n ||
      coverage.pending
    )
      throw new Error("Incomplete live smoke");
    console.log(
      JSON.stringify({
        status: "pass",
        categories: counts,
        coverage,
        textPages: pages.n,
        matchingPages: search.n,
      }),
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        status: "fail",
        stage,
        type: error instanceof Error ? error.constructor.name : "unknown",
      }),
    );
    process.exitCode = 1;
  } finally {
    await source?.close();
  }
}
