import { test, expect } from "bun:test";
import { chromium } from "playwright";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { submitLogin, AuthRequired } from "./source";
import { CCXP_LOGIN } from "../../contracts/ccxp-meetings";

const extension = process.env.CCXP_TEST_EXTENSION;
// Explicit opt-in so the core suite never installs or starts a browser implicitly.
test.skipIf(!extension)(
  "released ccxpLite fills the login challenge in headless Chromium; expiry is detected",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "ccxp-browser-"));
    const context = await chromium.launchPersistentContext(root, {
      channel: "chromium",
      headless: true,
      args: [
        `--disable-extensions-except=${extension}`,
        `--load-extension=${extension}`,
      ],
    });
    let expired = false;
    let submitted = false;
    try {
      await context.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.protocol === "chrome-extension:") {
          await route.continue();
          return;
        }
        if (url.pathname.endsWith("auth_img.php")) {
          await route.fulfill({
            contentType: "image/png",
            body: Buffer.from(
              await Bun.file(
                new URL("../test-fixtures/captcha.png", import.meta.url),
              ).arrayBuffer(),
            ),
          });
          return;
        }
        if (url.pathname.endsWith("pre_select_entry.php")) {
          const data = new URLSearchParams(route.request().postData() ?? "");
          expect(data.get("account")).toBe("fixture-account");
          expect(data.get("passwd")).toBe("fixture-password");
          expect(data.get("passwd2")).toMatch(/^\d{6}$/u);
          submitted = true;
          await route.fulfill(
            expired
              ? {
                  contentType: "text/html; charset=utf-8",
                  body: "<body>密碼已到期，請更新密碼</body>",
                }
              : {
                  contentType: "text/html",
                  body: `<script>location.href=${JSON.stringify(`${CCXP_LOGIN}select_entry.php?ACIXSTORE=fixture-token`)}</script>`,
                },
          );
          return;
        }
        if (url.pathname.endsWith("select_entry.php")) {
          await route.fulfill({
            contentType: "text/html",
            body: "<body>fixture signed in</body>",
          });
          return;
        }
        if (url.href === CCXP_LOGIN) {
          await route.fulfill({
            contentType: "text/html; charset=utf-8",
            body: `<html><body><table><tr><td><form name="form1" method="post" action="pre_select_entry.php"><span>帳號</span><input name="account"><span>密碼</span><input type="password" name="passwd"><span>驗證碼</span><input name="passwd2"><img src="auth_img.php"><input type="submit" value="登入"></form></td></tr></table></body></html>`,
          });
          return;
        }
        await route.abort();
      });
      const page = await context.newPage();
      const credentials = {
        account: "fixture-account",
        password: "fixture-password",
      };
      expect(await submitLogin(page, credentials)).toBe("fixture-token");
      expect(submitted).toBe(true);
      expired = true;
      await expect(submitLogin(page, credentials)).rejects.toMatchObject({
        reason: "password_expired",
      });
    } finally {
      await context.close();
      await rm(root, { recursive: true, force: true });
    }
  },
  60000,
);
