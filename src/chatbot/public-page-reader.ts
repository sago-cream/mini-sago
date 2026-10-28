const MAX_READER_BYTES = 256_000;

export class PublicPageReadError extends Error {}

export function publicPageReaderBaseUrl() {
  return (
    process.env.LINK_READER_BASE_URL?.trim() ||
    process.env.THREADS_SEARCH_READER_BASE_URL?.trim() ||
    "https://r.jina.ai/"
  );
}

export function buildReaderUrl(
  url: string,
  readerBaseUrl = publicPageReaderBaseUrl(),
) {
  return `${readerBaseUrl.replace(/\/*$/u, "/")}${url}`;
}

export async function fetchReaderPage(
  url: string,
  readerBaseUrl = publicPageReaderBaseUrl(),
) {
  const response = await fetch(buildReaderUrl(url, readerBaseUrl), {
    headers: {
      "User-Agent": "MiniSago/0.1",
      "X-Cache-Tolerance": "300",
      "X-Respond-With": "markdown",
    },
    signal: AbortSignal.timeout(30_000),
    redirect: "error",
  });
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new PublicPageReadError(
      `Public page reader returned HTTP ${response.status}.`,
    );
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_READER_BYTES) {
        await reader.cancel();
        throw new PublicPageReadError("Reader response too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const markdown = Buffer.concat(chunks).toString("utf8");
  if (
    !markdown.trim() ||
    /Warning: Target URL returned error|^Title: (?:Page Not Found|Log in|Login|Access Denied)|^Title: [^\n]*[•|–—]\s*(?:Log in|Login)\s*$/imu.test(
      markdown,
    ) ||
    /requiring CAPTCHA|verify you are human|log in to (?:see|continue)|(?:content|page) (?:isn't|is not) available/iu.test(
      markdown,
    )
  ) {
    throw new PublicPageReadError(
      "The public page could not be read; it may require login or verification.",
    );
  }
  return markdown;
}
