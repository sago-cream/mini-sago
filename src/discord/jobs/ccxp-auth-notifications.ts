import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { createDiscordRequest } from "../api/request";
import { CCXP_LOGIN } from "../../../contracts/ccxp-meetings";

const healthSchema = z.object({
  state: z.enum(["healthy", "auth_required", "unavailable"]),
  episode: z.string().uuid(),
  reason: z.string().optional(),
});

export function createCcxpAuthNotifier(options: {
  indexPath: string;
  checkpointPath: string;
  ownerId: string;
  request: ReturnType<typeof createDiscordRequest>;
}) {
  let running = false;
  return async () => {
    if (running) return;
    running = true;
    try {
      const health = healthSchema.parse(
        JSON.parse(await readFile(`${options.indexPath}.status.json`, "utf8")),
      );
      if (health.state !== "auth_required") return;
      const checkpoint = await readFile(options.checkpointPath, "utf8").catch(
        () => "",
      );
      if (checkpoint === health.episode) return;
      const channel = await options.request<{ id: string }>(
        "/users/@me/channels",
        { method: "POST", body: { recipient_id: options.ownerId } },
      );
      const reason =
        health.reason === "password_expired"
          ? "CCXP 要求更新密碼"
          : "CCXP 登入需要你處理（可能是密碼到期或登入資料失效）";
      await options.request(`/channels/${channel.id}/messages`, {
        method: "POST",
        body: {
          content: `${reason}。請自行到 ${CCXP_LOGIN} 完成登入或更改密碼，再更新 Oracle 的 CCXP 憑證檔。不要把密碼傳給我。更新後我會自動重試；目前仍可搜尋上次同步的會議紀錄，並標示資料時間。`,
          allowed_mentions: { parse: [] },
          nonce: createHash("sha256")
            .update(health.episode)
            .digest("hex")
            .slice(0, 24),
          enforce_nonce: true,
        },
      });
      await mkdir(dirname(options.checkpointPath), {
        recursive: true,
        mode: 0o700,
      });
      await writeFile(`${options.checkpointPath}.tmp`, health.episode, {
        mode: 0o600,
      });
      await rename(`${options.checkpointPath}.tmp`, options.checkpointPath);
    } catch {
      // Retry failed delivery later; never put CCXP status contents or credentials in logs.
    } finally {
      running = false;
    }
  };
}

export function startCcxpAuthNotificationMonitor() {
  const indexPath = process.env.MINISAGO_CCXP_INDEX_PATH;
  const token = process.env.DISCORD_BOT_TOKEN;
  const ownerId = process.env.MINISAGO_CHATBOT_OWNER_USER_ID;
  if (
    !indexPath ||
    !token ||
    !ownerId ||
    process.env.DISCORD_GATEWAY_DISABLED === "true"
  )
    return;
  const poll = createCcxpAuthNotifier({
    indexPath,
    ownerId,
    checkpointPath:
      process.env.MINISAGO_CCXP_NOTIFICATION_STATE_PATH ??
      "/app/state/ccxp-auth-notification",
    request: createDiscordRequest(token),
  });
  void poll();
  setInterval(() => void poll(), 5 * 60000).unref();
}
