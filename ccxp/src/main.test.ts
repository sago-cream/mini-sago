import { test, expect } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { collectOnce } from "./main";
import { AuthRequired } from "./source";

test("rejected credentials pause login across restarts; file rotation resumes and clears health", async () => {
  const root = await mkdtemp(join(tmpdir(), "ccxp-rotation-"));
  try {
    const indexPath = join(root, "index.sqlite");
    const credentialsPath = join(root, "ccxp.env");
    await writeFile(
      credentialsPath,
      "CCXP_ACCOUNT=test\nCCXP_PASSWORD=old-password\n",
    );
    let opens = 0,
      closes = 0;
    const options = {
      indexPath,
      credentialsPath,
      stateDir: join(root, "state"),
      openSource: async (input: { credentials: { password: string } }) => {
        opens++;
        if (input.credentials.password !== "new-password")
          throw new AuthRequired("password_expired");
        return {
          list: async () => [],
          download: async () => ({ bytes: new Uint8Array(), contentType: "" }),
          close: async () => {
            closes++;
          },
        };
      },
      sync: async () => ({
        checkedAt: new Date().toISOString(),
        listed: 1,
        indexed: 1,
        pending: 0,
        empty: 0,
        unsupported: 0,
      }),
    };
    await collectOnce(options);
    const blocked = await Bun.file(`${indexPath}.status.json`).json();
    expect(blocked).toMatchObject({
      state: "auth_required",
      reason: "password_expired",
    });
    await collectOnce(options);
    expect(opens).toBe(1);
    await writeFile(
      credentialsPath,
      "CCXP_ACCOUNT=test\nCCXP_PASSWORD=another-old-password\n",
    );
    await collectOnce(options);
    expect(opens).toBe(2);
    expect((await Bun.file(`${indexPath}.status.json`).json()).episode).toBe(
      blocked.episode,
    );
    await writeFile(
      credentialsPath,
      "CCXP_ACCOUNT=test\nCCXP_PASSWORD=new-password\n",
    );
    await collectOnce(options);
    expect(opens).toBe(3);
    expect(closes).toBe(1);
    expect((await Bun.file(`${indexPath}.status.json`).json()).state).toBe(
      "healthy",
    );
    await collectOnce(options);
    expect(opens).toBe(3);
    expect(await Bun.file(`${indexPath}.status.json`).text()).not.toContain(
      "password=",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
