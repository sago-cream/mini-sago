import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export async function extractPages(
  bytes: Uint8Array,
  contentType: string,
): Promise<string[] | null> {
  if (new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-") {
    const loading = getDocument({
      data: bytes,
      useWorkerFetch: false,
      verbosity: 0,
    });
    const document = await loading.promise;
    try {
      if (document.numPages > 1000) return null;
      const pages: string[] = [];
      let total = 0;
      for (let i = 1; i <= document.numPages; i++) {
        const page = await document.getPage(i);
        const content = await page.getTextContent();
        const text = content.items
          .map((item) =>
            "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "",
          )
          .join("")
          .trim();
        total += text.length;
        if (text.length > 100000 || total > 3000000) return null;
        pages.push(text);
        page.cleanup();
      }
      return pages;
    } finally {
      await loading.destroy();
    }
  }
  if (/text\/html/iu.test(contentType)) {
    const sample = new TextDecoder().decode(bytes.slice(0, 2048));
    const charset =
      /charset\s*=\s*["']?([\w-]+)/iu.exec(contentType)?.[1] ??
      /charset\s*=\s*["']?([\w-]+)/iu.exec(sample)?.[1] ??
      "big5";
    const html = new TextDecoder(charset).decode(bytes);
    // HTMLRewriter removes executable and navigation content before collecting text.
    const clean = await new HTMLRewriter()
      .on("script,style,noscript,form,nav", {
        element: (e) => {
          e.remove();
        },
      })
      .transform(new Response(html))
      .text();
    let text = "";
    await new HTMLRewriter()
      .onDocument({
        text: (t) => {
          text += t.text;
        },
      })
      .on("*", {
        element: (e) => {
          if (["p", "br", "div", "tr", "h1", "h2"].includes(e.tagName))
            text += "\n";
        },
      })
      .transform(new Response(clean))
      .text();
    if (text.length > 3000000) return null;
    const pages = [];
    for (let i = 0; i < text.length; i += 12000)
      pages.push(text.slice(i, i + 12000));
    return pages;
  }
  return null;
}
