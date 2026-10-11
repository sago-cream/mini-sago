import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import type { DiscordRequest } from "../discord/api/request";
import type { DiscordApplicationCommandInteraction } from "../discord/interactions";
import {
  calendarCreatedEventId,
  calendarSchemas,
  createGoogleCalendarClient,
  type GoogleCalendarClient,
} from "./google-calendar";
import {
  calendarMessage,
  calendarPreview,
  calendarPreviewText,
  type CalendarPreview,
} from "./calendar-message";
import { getFeatureAvailabilityStore } from "../discord/feature-availability";
import { resolveDriveRequester } from "./drive-discord-access";

const draftSchema = z.object({
  id: z.string(),
  guildId: z.string(),
  calendarBinding: z.string().optional(),
  channelId: z.string(),
  requesterId: z.string(),
  messageId: z.string(),
  responseMessageId: z.string().optional(),
  expires: z.number(),
  name: z.enum([
    "create_calendar_event",
    "edit_calendar_event",
    "delete_calendar_event",
  ]),
  input: z.record(z.string(), z.unknown()),
  preview: z.string(),
  result: z.string().optional(),
  details: z
    .object({
      title: z.string(),
      calendar: z.string(),
      schedule: z.string(),
      location: z.string().optional(),
      description: z.string().optional(),
      attendees: z.array(z.string()),
      office: z.boolean(),
      changes: z.array(
        z.object({ name: z.string(), before: z.string(), after: z.string() }),
      ),
    })
    .optional(),
  state: z
    .enum([
      "draft",
      "saving",
      "complete",
      "retry",
      "stale",
      "uncertain",
      "unavailable",
    ])
    .optional(),
  discussion: z.string().optional(),
  eventId: z.string().optional(),
  eventLink: z.string().optional(),
  officeReservation: z.string().optional(),
  error: z.string().optional(),
});
type Draft = z.infer<typeof draftSchema>;
type Context = {
  guildId?: string;
  channelId: string;
  requesterId: string;
  messageId: string;
};
const busy = new Set<string>();
const pendingDiscussion = new Map<
  string,
  { content: string; discord: DiscordRequest }
>();
async function release(id: string) {
  busy.delete(id);
  const pending = pendingDiscussion.get(id);
  pendingDiscussion.delete(id);
  if (pending)
    await updateCalendarDraftDiscussion(id, pending.content, pending.discord);
}
const statePath = () =>
  process.env.DISCORD_CALENDAR_DRAFTS_FILE ||
  process.env.MINISAGO_CALENDAR_DRAFTS_FILE ||
  join(
    dirname(process.env.MINISAGO_REMINDER_STATE_FILE || ".data/reminders.json"),
    "calendar-drafts.json",
  );
function load(): Draft[] {
  try {
    return z
      .array(draftSchema)
      .parse(JSON.parse(readFileSync(statePath(), "utf8")))
      .filter((d) => d.expires + 86400000 > Date.now());
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw new Error("Calendar draft storage is unavailable.");
  }
}
function save(drafts: Draft[]) {
  const path = statePath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path + ".tmp", JSON.stringify(drafts), { mode: 0o600 });
  renameSync(path + ".tmp", path);
}
function put(draft: Draft) {
  save([...load().filter((d) => d.id !== draft.id), draft]);
}
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const binding = (client: GoogleCalendarClient) => hash(client.config);
const title = (draft: Draft) =>
  String(draft.details?.title ?? "活動").replace(/([\\`*_~|<>])/g, "\\$1");
async function update(draft: Draft, discord: DiscordRequest) {
  if (!draft.responseMessageId) return;
  await discord(
    `/channels/${draft.channelId}/messages/${draft.responseMessageId}`,
    { method: "PATCH", body: calendarMessage(draft) },
  );
}
export async function updateCalendarDraftDiscussion(
  id: string,
  content: string,
  discord: DiscordRequest,
) {
  if (busy.has(id)) {
    pendingDiscussion.set(id, { content, discord });
    return true;
  }
  const draft = load().find((d) => d.id === id);
  if (!draft?.responseMessageId) return false;
  busy.add(id);
  try {
    draft.discussion = content;
    put(draft);
    await update(draft, discord);
    return true;
  } finally {
    await release(id);
  }
}
export async function expireCalendarDrafts(
  discord: DiscordRequest,
  now = Date.now(),
) {
  for (const draft of load()) {
    if (draft.result || busy.has(draft.id)) continue;
    const interrupted = draft.state === "saving";
    if (!interrupted && (draft.expires > now || draft.state === "uncertain"))
      continue;
    busy.add(draft.id);
    try {
      if (interrupted) {
        draft.state = "uncertain";
        draft.error = "未收到 Google 的回覆。";
      } else draft.result = `「${title(draft)}」草稿已過期。`;
      await update(draft, discord);
      put(draft);
    } finally {
      await release(draft.id);
    }
  }
}

export function startCalendarDraftExpiry(discord: DiscordRequest) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await expireCalendarDrafts(discord);
    } catch {
      console.warn("Calendar draft expiry update failed.");
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), 30000);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
async function prepare(
  name: Draft["name"],
  input: Record<string, any>,
  client: GoogleCalendarClient,
): Promise<CalendarPreview> {
  let existing: Record<string, any> | undefined;
  if (name !== "create_calendar_event") {
    const found = await client.call("get_calendar_event", {
      eventId: input.eventId,
    });
    if (found.status !== "complete") throw new Error(String(found.error));
    existing = found.event as Record<string, any>;
    if (existing.attendeeCount > 50)
      throw new Error(
        "This event has too many guests to preview safely. Edit it in Google Calendar.",
      );
    if (existing.etag !== input.etag)
      throw new Error(
        "The event changed. Read it again before preparing an edit.",
      );
  }
  if (existing?.recurrence || existing?.status === "cancelled")
    throw new Error(
      "Select a current single event or recurring occurrence; whole-series changes are unsupported.",
    );
  const details = calendarPreview(name, input, existing, client.config);
  if (calendarPreviewText(details).length > 1800)
    throw new Error(
      "The booking preview is too long. Shorten the description or reduce the guest list.",
    );
  return details;
}
export function withCalendarConfirmation(
  client: GoogleCalendarClient,
  context: Context,
  discord: DiscordRequest,
  allowed: () => Promise<boolean> = async () =>
    getFeatureAvailabilityStore().isEnabled("calendar", context),
): GoogleCalendarClient {
  return {
    config: client.config,
    async call(name, raw) {
      if (context.guildId !== client.config.guildId || !(await allowed()))
        return {
          status: "unavailable",
          error: "Calendar access is unavailable here.",
        };
      if (name === "list_calendar_events" || name === "get_calendar_event")
        return client.call(name, raw);
      try {
        const input = calendarSchemas[name].parse(raw);
        const calendarBinding = binding(client);
        const id = hash([context, calendarBinding, name, input]).slice(0, 40);
        const old = load().find((d) => d.id === id);
        if (old)
          return {
            status: old.result ? "complete" : "awaiting_confirmation",
            detail:
              "The calendar message is already delivered. Do not repeat it in chat.",
            calendarDraftId: old.id,
            replyDelivered: Boolean(old.responseMessageId),
          };
        const details = await prepare(name, input, client);
        if (
          load().filter(
            (d) =>
              d.requesterId === context.requesterId &&
              !d.result &&
              d.expires > Date.now(),
          ).length >= 10
        )
          return {
            status: "unavailable",
            error:
              "Too many pending previews. Confirm or cancel an existing preview first.",
          };
        const draft: Draft = {
          id,
          ...context,
          guildId: client.config.guildId,
          calendarBinding,
          name,
          input,
          preview: calendarPreviewText(details),
          details,
          state: "draft",
          expires: Date.now() + 15 * 60000,
        };
        put(draft);
        try {
          const message = await discord<{ id: string }>(
            `/channels/${context.channelId}/messages`,
            {
              method: "POST",
              body: {
                ...calendarMessage(draft),
                message_reference: {
                  message_id: context.messageId,
                  fail_if_not_exists: false,
                },
              },
            },
          );
          draft.responseMessageId = message.id;
          put(draft);
        } catch {
          save(load().filter((d) => d.id !== id));
          return {
            status: "unavailable",
            error:
              "Could not post the confirmation preview. No calendar changes were made.",
          };
        }
        return {
          status: "awaiting_confirmation",
          calendarDraftId: id,
          replyDelivered: true,
          detail:
            "The calendar message is the complete user-facing reply and will update in place. Return reply:null and reaction:null unless other parts of the request need an answer. Do not repeat the preview or explain its buttons.",
        };
      } catch (error) {
        return {
          status: "unavailable",
          error:
            error instanceof Error
              ? error.message
              : "Could not prepare the booking preview. Check the inputs and try again.",
        };
      }
    },
  };
}
function complete(draft: Draft, result: Record<string, unknown>) {
  draft.state = "complete";
  draft.error = undefined;
  const event = result.event as Record<string, any> | undefined;
  draft.eventId = event?.id ?? draft.eventId;
  draft.eventLink = event?.htmlLink ?? draft.eventLink;
  draft.officeReservation =
    typeof result.officeReservation === "string"
      ? result.officeReservation
      : undefined;
  draft.result =
    draft.name === "delete_calendar_event"
      ? `已刪除「${title(draft)}」${draft.details ? `（${draft.details.schedule}）` : ""}。`
      : `已${draft.name === "create_calendar_event" ? "建立" : "更新"}「${title(draft)}」。`;
}
export async function handleCalendarConfirmation(
  interaction: DiscordApplicationCommandInteraction,
  discord: DiscordRequest,
  env: Record<string, string | undefined> = process.env,
  makeClient = createGoogleCalendarClient,
) {
  const match =
    interaction.type === 3
      ? /^calendar:(confirm|cancel|refresh|office|verify):([a-f0-9]{40})$/.exec(
          interaction.data?.custom_id || "",
        )
      : null;
  if (!match) return false;
  const callback = (type: number, data?: unknown) =>
    discord(`/interactions/${interaction.id}/${interaction.token}/callback`, {
      method: "POST",
      authenticated: false,
      body: { type, ...(data ? { data } : {}) },
    });
  const respond = (content: string) =>
    callback(4, { content, flags: 64, allowed_mentions: { parse: [] } });
  let draft: Draft | undefined;
  try {
    draft = load().find((d) => d.id === match[2]);
  } catch {
    await respond("活動確認暫時無法使用。");
    return true;
  }
  if (
    !draft ||
    draft.guildId !== interaction.guild_id ||
    draft.channelId !== interaction.channel_id
  ) {
    await respond("找不到這份活動草稿。請重新提出活動。");
    return true;
  }
  const requester = interaction.member?.user?.id ?? interaction.user?.id;
  if (draft.requesterId !== requester) {
    await respond("只有原本提出活動的人能確認這份草稿。");
    return true;
  }
  const action = match[1]!;
  if (busy.has(draft.id)) {
    await respond("正在處理這筆活動。");
    return true;
  }
  if (
    draft.result &&
    !(action === "office" && draft.state === "complete") &&
    !(action === "refresh" && draft.result.includes("已過期"))
  ) {
    await respond(draft.result);
    return true;
  }
  if (
    !draft.result &&
    draft.expires <= Date.now() &&
    !["saving", "uncertain"].includes(draft.state ?? "") &&
    action !== "refresh"
  ) {
    draft.result = `「${title(draft)}」草稿已過期。`;
    put(draft);
    await callback(7, calendarMessage(draft));
    return true;
  }
  if (action === "cancel") {
    if (draft.state === "saving" || draft.state === "uncertain") {
      await respond("這筆活動的操作結果尚未確認。");
      return true;
    }
    draft.result = `已取消「${title(draft)}」${draft.name === "create_calendar_event" ? "草稿" : draft.name === "edit_calendar_event" ? "的修改草稿" : "的刪除草稿"}。`;
    put(draft);
    await callback(7, calendarMessage(draft));
    return true;
  }
  if (
    action === "confirm" &&
    !["draft", "retry"].includes(draft.state ?? "draft")
  ) {
    await respond("這份草稿需要先重新讀取活動。");
    return true;
  }
  busy.add(draft.id);
  try {
    if (action === "confirm") {
      draft.state = "saving";
      draft.error = undefined;
      put(draft);
      await callback(7, calendarMessage(draft));
    } else await callback(6);
    const patch = (d: Draft) =>
      discord(
        `/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`,
        { method: "PATCH", authenticated: false, body: calendarMessage(d) },
      );
    const client = makeClient(env, {
      guildId: draft.guildId,
      channelId: draft.channelId,
      roleIds: interaction.member?.roles,
      messageId: draft.messageId,
      resolveRoleIds: async () =>
        (
          await resolveDriveRequester(
            { guildId: draft!.guildId, requesterId: draft!.requesterId },
            discord,
          )
        ).roleIds,
    });
    if (!client || draft.calendarBinding !== binding(client)) {
      if (action === "office") {
        await discord(
          `/webhooks/${interaction.application_id}/${interaction.token}`,
          {
            method: "POST",
            authenticated: false,
            body: {
              content: "日曆存取權或設定已變更。",
              flags: 64,
              allowed_mentions: { parse: [] },
            },
          },
        );
        return true;
      }
      draft.state = "unavailable";
      draft.error = "日曆存取權或設定已變更。請管理員檢查授權。";
      put(draft);
      await patch(draft);
      return true;
    }
    if (action === "office") {
      if (draft.state !== "complete" || !draft.eventId) return true;
      const result = await client.call("get_calendar_event", {
        eventId: draft.eventId,
      });
      if (result.status === "complete") {
        const event = result.event as Record<string, any>;
        if (event.status === "cancelled") {
          draft.result = `「${title(draft)}」活動已取消。`;
          draft.state = "unavailable";
          draft.officeReservation = "not_requested";
          draft.error = "Google 日曆中的活動已取消。";
        } else {
          draft.details = calendarPreview(
            "delete_calendar_event",
            {},
            event,
            client.config,
          );
          draft.officeReservation = String(
            result.officeReservation ?? "not_requested",
          );
        }
        put(draft);
        await patch(draft);
      }
      return true;
    }
    if (action === "refresh") {
      if (
        draft.state === "complete" ||
        draft.state === "uncertain" ||
        draft.state === "saving"
      )
        return true;
      const input = { ...draft.input };
      if (draft.name !== "create_calendar_event") {
        const result = await client.call("get_calendar_event", {
          eventId: input.eventId,
        });
        if (result.status !== "complete") {
          draft.state = "unavailable";
          draft.error = "無法讀取活動。";
          put(draft);
          await patch(draft);
          return true;
        }
        input.etag = (result.event as Record<string, unknown>).etag;
      }
      try {
        const details = await prepare(draft.name, input, client);
        const fresh: Draft = {
          ...draft,
          id: hash(randomUUID()).slice(0, 40),
          input,
          details,
          preview: calendarPreviewText(details),
          expires: Date.now() + 15 * 60000,
          state: "draft",
          result: undefined,
          error: undefined,
        };
        draft.result = `「${title(draft)}」草稿已替換。`;
        put(draft);
        put(fresh);
        await patch(fresh);
      } catch {
        draft.state = "unavailable";
        draft.error = "無法準備最新預覽。請重新提出活動。";
        put(draft);
        await patch(draft);
      }
      return true;
    }
    if (action === "verify") {
      if (draft.state !== "uncertain" && draft.state !== "saving") return true;
      const eventId =
        draft.name === "create_calendar_event"
          ? calendarCreatedEventId(
              client.config.calendarId,
              draft.guildId,
              draft.messageId,
              String(draft.input.operationKey),
            )
          : String(draft.input.eventId);
      const result = await client.call("get_calendar_event", { eventId });
      if (result.failureKind === "not_found") {
        if (draft.name === "delete_calendar_event")
          complete(draft, { status: "complete" });
        else {
          draft.state =
            draft.name === "create_calendar_event" ? "retry" : "unavailable";
          draft.error = "找不到這筆活動。";
        }
      } else if (result.status === "complete") {
        const event = result.event as Record<string, any>;
        if (
          draft.name === "delete_calendar_event" &&
          event.status === "cancelled"
        )
          complete(draft, result);
        else if (
          draft.name !== "delete_calendar_event" &&
          event.status !== "cancelled" &&
          (event.attendeeCount ?? 0) <= 50
        ) {
          const actual = calendarPreview(
            "delete_calendar_event",
            {},
            event,
            client.config,
          );
          if (
            draft.details &&
            [
              "title",
              "schedule",
              "location",
              "description",
              "attendees",
              "office",
            ].every(
              (key) =>
                JSON.stringify(actual[key as keyof CalendarPreview] ?? "") ===
                JSON.stringify(
                  draft!.details![key as keyof CalendarPreview] ?? "",
                ),
            )
          )
            complete(draft, result);
          else {
            draft.state = "unavailable";
            draft.error = "日曆內容與草稿不同。請重新提出修改。";
          }
        } else {
          draft.state = "stale";
          draft.error = undefined;
        }
      }
      put(draft);
      await patch(draft);
      return true;
    }
    const result = await client.call(draft.name, draft.input);
    if (result.status === "complete") complete(draft, result);
    else {
      draft.state =
        result.failureKind === "stale"
          ? "stale"
          : result.failureKind === "uncertain"
            ? "uncertain"
            : result.failureKind === "retryable" || !result.failureKind
              ? "retry"
              : "unavailable";
      draft.error =
        draft.state === "uncertain"
          ? "未收到 Google 的回覆。"
          : draft.state === "stale"
            ? undefined
            : draft.state === "retry"
              ? "Google 暫時無法處理這筆請求。"
              : String(result.error ?? "無法完成活動操作。");
    }
    put(draft);
    await patch(draft);
  } catch {
    if (!draft.result) {
      draft.state = draft.state === "saving" ? "uncertain" : "unavailable";
      draft.error =
        draft.state === "uncertain"
          ? "未收到 Google 的回覆。"
          : "活動操作暫時無法使用。";
      put(draft);
      await update(draft, discord).catch(() => undefined);
    }
  } finally {
    await release(draft.id);
  }
  return true;
}
