import type { DiscordRequest } from "../api/request";
import type { Reminder } from "./reminders";

type Message = {
  id: string;
  author: { id: string };
  timestamp: string;
  attachments?: { content_type?: string; filename?: string }[];
  embeds?: { type?: string; image?: { url?: string } }[];
};

// Returning normally consumes this occurrence; errors leave it due for retry.
export async function shouldSkipImageReminder(
  reminder: Reminder,
  request: DiscordRequest,
  now = new Date(),
): Promise<boolean> {
  const condition = reminder.skipIfImagePosted;
  if (!condition) return false;
  if (!/^\d+$/.test(condition.threadId) || !/^\d+$/.test(condition.userId)) {
    throw new Error("Invalid reminder image condition.");
  }
  const thread = await request<{ parent_id?: string }>(
    `/channels/${condition.threadId}`,
  );
  if (thread.parent_id !== reminder.channelId) {
    throw new Error("Reminder image thread must belong to its channel.");
  }

  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: reminder.timezone ?? "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const today = day.format(now);
  // Scan newest-first through the entire local day, including busy threads.
  let before: string | undefined;
  while (true) {
    const messages = await request<Message[]>(
      `/channels/${condition.threadId}/messages?limit=100${before ? `&before=${before}` : ""}`,
    );
    if (!messages.length) return false;
    for (const message of messages) {
      const sentAt = new Date(message.timestamp);
      if (!Number.isFinite(sentAt.getTime())) {
        throw new Error("Invalid Discord message timestamp.");
      }
      if (sentAt > now) continue;
      if (day.format(sentAt) !== today) return false;
      if (message.author.id !== condition.userId) continue;
      const image = message.attachments?.some((attachment) =>
        attachment.content_type
          ? attachment.content_type.startsWith("image/")
          : /\.(?:png|jpe?g|gif|webp|avif|heic|heif|bmp|tiff?)$/i.test(
              attachment.filename ?? "",
            ),
      );
      if (
        image ||
        message.embeds?.some(
          (embed) => embed.type === "image" || Boolean(embed.image?.url),
        )
      ) {
        return true;
      }
    }
    if (messages.length < 100) return false;
    const nextBefore = messages.at(-1)!.id;
    if (nextBefore === before) throw new Error("Discord pagination stalled.");
    before = nextBefore;
  }
}
