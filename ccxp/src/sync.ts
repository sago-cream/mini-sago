import {
  CCXP_CATEGORIES,
  type CcxpCategory,
  type CcxpDocument,
} from "../../contracts/ccxp-meetings";
import type { CcxpSource } from "./source";
import { AuthRequired } from "./source";
import {
  readDocuments,
  readManifest,
  publishIndex,
  type ListingManifest,
} from "./store";
import { extractPages } from "./extract";

export async function syncMeetings(
  source: Pick<CcxpSource, "list" | "download">,
  path: string,
  options: {
    budget?: number;
    now?: Date;
    categories?: CcxpCategory[];
    delayMs?: number;
  } = {},
) {
  const now = options.now ?? new Date();
  const previous = new Map(readDocuments(path).map((doc) => [doc.id, doc]));
  const manifest = readManifest(path);
  const listings: ListingManifest = {};
  const documents: CcxpDocument[] = [];
  let listed = 0,
    pending = 0,
    attempted = 0;
  // Visit every listing before downloads; interleave categories newest-first.
  const queue: {
    link: Awaited<ReturnType<CcxpSource["list"]>>[number];
    index: number;
    priority: number;
  }[] = [];
  for (const category of options.categories ??
    (Object.keys(CCXP_CATEGORIES) as CcxpCategory[])) {
    const links = await source.list(category);
    listed += links.length;
    links.forEach((link, index) => {
      const old = manifest?.[link.id];
      const cached = previous.get(link.id);
      const fresh = Boolean(
        manifest && (!old || old.revision !== link.revision || old.fresh),
      );
      listings[link.id] = {
        revision: link.revision,
        // Adopt existing snapshots without discarding their cached records.
        fetchedRevision:
          old?.fetchedRevision ??
          (cached && !manifest ? link.revision : undefined),
        fresh,
      };
      const revalidate =
        cached && now.getTime() - Date.parse(cached.fetchedAt) >= 30 * 86400000;
      queue.push({
        link,
        index,
        priority: fresh ? 0 : !cached ? 1 : revalidate ? 2 : 3,
      });
    });
  }
  queue.sort((a, b) => a.priority - b.priority || a.index - b.index);
  for (const { link } of queue) {
    const category = link.category;
    const cached = previous.get(link.id);
    const listing = listings[link.id];
    // Revalidate monthly for edits that do not change the listing's attachment.
    const due =
      !cached ||
      listing.fetchedRevision !== link.revision ||
      now.getTime() - Date.parse(cached.fetchedAt) >= 30 * 86400000;
    if (!due) {
      documents.push(cached!);
      continue;
    }
    if (attempted >= (options.budget ?? 100)) {
      pending++;
      if (cached) documents.push(cached);
      continue;
    }
    attempted++;
    try {
      const { bytes, contentType } = await source.download(link);
      const pageKind =
        new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-"
          ? "page"
          : "section";
      const pages = await extractPages(bytes, contentType);
      listing.fetchedRevision = link.revision;
      listing.fresh = false;
      documents.push({
        id: link.id,
        category,
        title: link.title,
        sourceUrl: link.sourceUrl,
        fetchedAt: now.toISOString(),
        state:
          pages === null
            ? "unsupported"
            : pages.some((p) => p.trim())
              ? "indexed"
              : "empty",
        pageKind,
        pages: pages ?? [],
      });
    } catch (error) {
      if (error instanceof AuthRequired) throw error;
      pending++;
      if (cached) documents.push(cached);
    } finally {
      if (options.delayMs) await Bun.sleep(options.delayMs);
    }
  }
  const coverage = {
    checkedAt: now.toISOString(),
    listed,
    pending,
    indexed: documents.filter((d) => d.state === "indexed").length,
    empty: documents.filter((d) => d.state === "empty").length,
    unsupported: documents.filter((d) => d.state === "unsupported").length,
  };
  await publishIndex(path, documents, coverage, listings);
  return coverage;
}
