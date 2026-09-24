import { createHash } from "node:crypto";
import { chromium, type BrowserContext, type Page } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  CCXP_CATEGORIES,
  CCXP_LOGIN,
  CCXP_ORIGIN,
  CCXP_MEETINGS_PATH,
  type CcxpCategory,
} from "../../contracts/ccxp-meetings";

export class AuthRequired extends Error {
  constructor(
    public reason: "password_expired" | "login_required" = "login_required",
  ) {
    super(reason);
  }
}
export type MeetingLink = {
  id: string;
  category: CcxpCategory;
  title: string;
  url: string;
  sourceUrl: string;
  revision: string;
};
export const documentId = (category: string, title: string) =>
  createHash("sha256")
    .update(`${category}\n${title}`)
    .digest("hex")
    .slice(0, 32);

function publicAcademicAttachment(url: URL, category: CcxpCategory) {
  return (
    (category === "13" || category === "14") &&
    url.origin === "https://academic.site.nthu.edu.tw" &&
    /^\/var\/file\/7\/1007\/img\/[\w/-]+\.pdf$/u.test(url.pathname) &&
    !url.search
  );
}

export function meetingLink(
  category: CcxpCategory,
  title: string,
  href: string,
  base: string,
): MeetingLink | undefined {
  const url = new URL(href, base);
  if (
    url.username ||
    url.password ||
    !(
      publicAcademicAttachment(url, category) ||
      (url.origin === CCXP_ORIGIN &&
        new RegExp(`^${CCXP_MEETINGS_PATH}view[0-9]*\\.php$`, "u").test(
          url.pathname,
        ) &&
        url.searchParams.get("l"))
    ) ||
    !title.trim() ||
    title.length > 1000
  )
    return;
  const cleanTitle = title.replace(/\s+/gu, " ").trim();
  // Protected links contain randomized ciphertext in `l`, even within one session.
  // Fingerprint stable listing metadata; only public attachments have stable URLs.
  const identity = publicAcademicAttachment(url, category)
    ? url.href
    : `${url.origin}${url.pathname}\n${category}\n${cleanTitle}`;
  return {
    revision: createHash("sha256").update(identity).digest("hex"),
    id: documentId(category, cleanTitle),
    category,
    title: cleanTitle,
    url: url.href,
    sourceUrl: publicAcademicAttachment(url, category)
      ? url.href
      : `${CCXP_ORIGIN}${CCXP_MEETINGS_PATH}${category}.php`,
  };
}

export async function submitLogin(
  page: Page,
  credentials: { account: string; password: string },
) {
  await page.goto(CCXP_LOGIN, { waitUntil: "domcontentloaded" });
  // The pinned ccxpLite extension runs its bundled model locally.
  await page.waitForFunction(
    () =>
      /^\d{6}$/u.test(
        (
          document.querySelector(
            'input[name="passwd2"]',
          ) as HTMLInputElement | null
        )?.value ?? "",
      ),
    undefined,
    { timeout: 15000 },
  );
  // Wait for the extension's form replacement before filling credentials.
  await page.locator('input[name="account"]').fill(credentials.account);
  await page.locator('input[name="passwd"]').fill(credentials.password);
  await page.locator('input[name="passwd"]').press("Enter");
  await page.waitForLoadState("domcontentloaded");
  try {
    await page.waitForURL(
      (url) =>
        url.pathname.endsWith("/select_entry.php") &&
        !!url.searchParams.get("ACIXSTORE"),
      { timeout: 15000 },
    );
  } catch {
    const text = await page.locator("body").innerText();
    throw new AuthRequired(
      /密碼[\s\S]{0,40}(?:到期|逾期|過期)|(?:請|必須)[\s\S]{0,15}(?:變更|更改|更新)密碼/u.test(
        text,
      )
        ? "password_expired"
        : "login_required",
    );
  }
  return new URL(page.url()).searchParams.get("ACIXSTORE")!;
}

export class CcxpSource {
  private constructor(
    private context: BrowserContext,
    private page: Page,
    private stateDir: string,
    private token: string,
  ) {}

  static async open(options: {
    stateDir: string;
    extensionPath: string;
    credentials: { account: string; password: string };
  }) {
    await mkdir(options.stateDir, { recursive: true, mode: 0o700 });
    const context = await chromium.launchPersistentContext(
      `${options.stateDir}/browser`,
      {
        channel: "chromium",
        headless: true,
        args: [
          `--disable-extensions-except=${options.extensionPath}`,
          `--load-extension=${options.extensionPath}`,
        ],
        serviceWorkers: "block",
      },
    );
    try {
      await context.route("**/*", (route) => {
        const url = new URL(route.request().url());
        return url.origin === CCXP_ORIGIN ||
          url.protocol === "chrome-extension:"
          ? route.continue()
          : route.abort();
      });
      const page = await context.newPage();
      page.setDefaultTimeout(20000);
      let token = "";
      const credentialHash = createHash("sha256")
        .update(JSON.stringify(options.credentials))
        .digest("hex");
      try {
        const stored = JSON.parse(
          await readFile(`${options.stateDir}/session.json`, "utf8"),
        );
        if (stored.credentialHash === credentialHash)
          token = stored.token ?? "";
      } catch {}
      const source = new CcxpSource(context, page, options.stateDir, token);
      if (token) {
        try {
          await source.list("1");
          return source;
        } catch (error) {
          if (!(error instanceof AuthRequired)) throw error;
        }
      }
      await context.clearCookies();
      source.token = await submitLogin(page, options.credentials);
      // A login URL alone is insufficient: verify actual meeting access.
      await source.list("1");
      await writeFile(
        `${options.stateDir}/session.json`,
        JSON.stringify({ token: source.token, credentialHash }),
        { mode: 0o600 },
      );
      return source;
    } catch (error) {
      await context.close();
      throw error;
    }
  }

  async list(category: CcxpCategory): Promise<MeetingLink[]> {
    const url = new URL(`${CCXP_MEETINGS_PATH}${category}.php`, CCXP_ORIGIN);
    url.searchParams.set("ACIXSTORE", this.token);
    const response = await this.page.goto(url.href, {
      waitUntil: "domcontentloaded",
    });
    if (response && [401, 403].includes(response.status()))
      throw new AuthRequired();
    if (!response?.ok()) throw new Error("CCXP listing unavailable");
    const raw = await this.page.locator("a[href]").evaluateAll((es) =>
      es.map((e) => ({
        title: e.textContent ?? "",
        href: e.getAttribute("href")!,
      })),
    );
    const links = raw
      .map((r) => meetingLink(category, r.title, r.href, url.href))
      .filter((r): r is MeetingLink => !!r);
    if (!links.length) {
      // Never replace an index with a login page or an unrecognized layout.
      const body = await this.page.locator("body").innerText();
      if (/登入|登錄|密碼|login|ACIXSTORE/iu.test(body))
        throw new AuthRequired();
      throw new Error("CCXP meeting layout not recognized");
    }
    return [...new Map(links.map((link) => [link.id, link])).values()];
  }

  async download(
    link: MeetingLink,
  ): Promise<{ bytes: Uint8Array; contentType: string }> {
    return downloadMeeting(
      link,
      (await this.context.cookies(CCXP_ORIGIN))
        .map((c) => `${c.name}=${c.value}`)
        .join("; "),
    );
  }

  close() {
    return this.context.close();
  }
}

export async function downloadMeeting(
  link: MeetingLink,
  cookie: string,
  request: typeof fetch = fetch,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const headers = { cookie };
  let url = new URL(link.url);
  // Redirects remain inside the meeting subtree; never forward the session off-site.
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await request(url, {
      headers: url.origin === CCXP_ORIGIN ? headers : {},
      redirect: "manual",
      signal: AbortSignal.timeout(60000),
    });
    if (url.origin === CCXP_ORIGIN && [401, 403].includes(response.status))
      throw new AuthRequired();
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Invalid CCXP redirect");
      const next = new URL(location, url);
      if (
        next.username ||
        next.password ||
        !(
          (next.origin === CCXP_ORIGIN &&
            next.pathname.startsWith(CCXP_MEETINGS_PATH)) ||
          publicAcademicAttachment(next, link.category)
        )
      )
        throw new AuthRequired();
      url = next;
      continue;
    }
    if (!response.ok || !response.body)
      throw new Error("CCXP document unavailable");
    const max = 30 * 1024 * 1024;
    if (Number(response.headers.get("content-length")) > max) {
      await response.body.cancel();
      throw new Error("CCXP document too large");
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > max) throw new Error("CCXP document too large");
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (/text\/html/iu.test(contentType)) {
      const text = new TextDecoder("big5").decode(bytes);
      if (
        /name\s*=\s*["']?(?:passwd|account)|(?:請先|重新|逾時)[^<]{0,15}登[入錄]/iu.test(
          text,
        )
      )
        throw new AuthRequired();
    }
    return { bytes, contentType };
  }
  throw new Error("Too many CCXP redirects");
}
