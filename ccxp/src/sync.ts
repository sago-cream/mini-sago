import {
  CCXP_CATEGORIES,
  type CcxpCategory,
  type CcxpDocument,
} from "../../contracts/ccxp-meetings";
import type { CcxpSource } from "./source";
import { AuthRequired } from "./source";
import { readDocuments, publishIndex } from "./store";
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
  const documents: CcxpDocument[] = [];
  let listed = 0,
    pending = 0,
    attempted = 0;
  // Visit every listing before downloads; interleave categories newest-first.
  const queue: {
    link: Awaited<ReturnType<CcxpSource["list"]>>[number];
    index: number;
  }[] = [];
  for (const category of options.categories ??
    (Object.keys(CCXP_CATEGORIES) as CcxpCategory[])) {
    const links = await source.list(category);
    listed += links.length;
    links.forEach((link, index) => queue.push({ link, index }));
  }
  queue.sort((a, b) => a.index - b.index);
  for (const { link, index } of queue) {
    const category = link.category;
    const cached = previous.get(link.id);
    const refreshAfter = (index < 10 ? 1 : 30) * 86400000;
    const due =
      !cached || now.getTime() - Date.parse(cached.fetchedAt) >= refreshAfter;
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
  await publishIndex(path, documents, coverage);
  return coverage;
}
