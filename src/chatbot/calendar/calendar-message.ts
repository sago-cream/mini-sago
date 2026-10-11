import type { GoogleCalendarClient } from "./google-calendar";

type Event = Record<string, any>;
export type CalendarPreview = {
  title: string;
  calendar: string;
  schedule: string;
  location?: string;
  description?: string;
  attendees: string[];
  office: boolean;
  changes: { name: string; before: string; after: string }[];
};
export type CalendarMessageState =
  | "draft"
  | "saving"
  | "complete"
  | "retry"
  | "stale"
  | "uncertain"
  | "unavailable";
export type CalendarMessageDraft = {
  id: string;
  name:
    | "create_calendar_event"
    | "edit_calendar_event"
    | "delete_calendar_event";
  requesterId: string;
  expires: number;
  preview: string;
  details?: CalendarPreview;
  state?: CalendarMessageState;
  result?: string;
  discussion?: string;
  officeReservation?: string;
  eventLink?: string;
  error?: string;
};
const safe = (value: unknown) =>
  String(value ?? "").replace(/([\\`*_~|<>])/g, "\\$1");
export function scheduleText(start: string, end: string, allDay: boolean) {
  if (allDay) {
    const last = new Date(Date.parse(end) - 86400000)
      .toISOString()
      .slice(0, 10);
    return `${start}${start === last ? "" : ` → ${last}`}（全天）`;
  }
  const local = (time: string) =>
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Taipei",
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(time));
  return `${local(start)} → ${local(end)}（台北時間）`;
}
export function calendarPreview(
  name: CalendarMessageDraft["name"],
  input: Record<string, any>,
  existing: Event | undefined,
  config: GoogleCalendarClient["config"],
): CalendarPreview {
  const eventTime = () =>
    scheduleText(
      existing?.start?.dateTime ?? existing?.start?.date,
      existing?.end?.dateTime ?? existing?.end?.date,
      Boolean(existing?.start?.date),
    );
  const oldOffice =
    existing?.attendees?.some(
      (a: Event) =>
        a.email?.toLowerCase() === config.officeCalendarId.toLowerCase(),
    ) ?? false;
  const guests = (values: string[]) =>
    values.filter(
      (email) => email.toLowerCase() !== config.officeCalendarId.toLowerCase(),
    );
  const oldGuests = guests(
    existing?.attendees?.map((a: Event) => a.email) ?? [],
  );
  const details: CalendarPreview = {
    title: input.title ?? existing?.summary ?? "未命名活動",
    calendar: config.calendarName,
    schedule: input.schedule
      ? scheduleText(
          input.schedule.start,
          input.schedule.end,
          input.schedule.kind === "all_day",
        )
      : eventTime(),
    location: input.location ?? existing?.location,
    description: input.description ?? existing?.description,
    attendees: guests(input.attendees ?? oldGuests),
    office: input.useOffice ?? oldOffice,
    changes: [],
  };
  if (name === "edit_calendar_event" && existing) {
    const compare = (name: string, before: string, after: string) => {
      if (before !== after) details.changes.push({ name, before, after });
    };
    compare("名稱", existing.summary ?? "未命名活動", details.title);
    compare("時間", eventTime(), details.schedule);
    compare(
      "地點",
      existing.location || "未指定",
      details.location || "未指定",
    );
    compare("說明", existing.description || "無", details.description || "無");
    compare(
      "邀請",
      oldGuests.join("、") || "無",
      details.attendees.join("、") || "無",
    );
    compare(
      "會辦",
      oldOffice ? "邀請" : "不使用",
      details.office ? "邀請" : "不使用",
    );
  }
  return details;
}
export function calendarPreviewText(details: CalendarPreview) {
  return [
    details.title,
    details.calendar,
    details.schedule,
    details.location,
    details.description,
    ...details.attendees,
    ...details.changes.flatMap((change) => [
      change.name,
      change.before,
      change.after,
    ]),
  ]
    .filter(Boolean)
    .join("\n");
}
function button(
  id: string,
  action: string,
  label: string,
  style = 2,
  disabled = false,
) {
  return {
    type: 2,
    style,
    label,
    custom_id: `calendar:${action}:${id}`,
    ...(disabled ? { disabled } : {}),
  };
}
export function calendarMessage(draft: CalendarMessageDraft) {
  const state = draft.state ?? (draft.result ? "complete" : "draft");
  const deleting = draft.name === "delete_calendar_event";
  const verb = deleting
    ? "刪除"
    : draft.name === "edit_calendar_event"
      ? "修改"
      : "建立";
  const title = safe(draft.details?.title ?? "活動");
  if (
    draft.result &&
    (deleting ||
      draft.result.startsWith("已取消") ||
      draft.result.includes("已過期") ||
      draft.result.includes("已替換"))
  ) {
    return {
      content: draft.discussion ?? draft.result,
      embeds: draft.discussion
        ? [{ description: draft.result, color: 0x8b909b }]
        : [],
      components: draft.result.includes("已過期")
        ? [{ type: 1, components: [button(draft.id, "refresh", "重新預覽")] }]
        : [],
      allowed_mentions: { parse: [] },
    };
  }
  let status =
    state === "saving"
      ? `${verb}中…`
      : state === "complete"
        ? `已${deleting ? "刪除" : draft.name === "edit_calendar_event" ? "更新" : "建立"}`
        : state === "retry"
          ? `尚未${verb}`
          : state === "stale"
            ? "活動已變更"
            : state === "uncertain"
              ? "結果未確認"
              : state === "unavailable"
                ? "日曆暫時無法使用"
                : `待你確認${deleting ? "刪除" : draft.name === "edit_calendar_event" ? "修改" : ""}`;
  if (
    state === "complete" &&
    draft.officeReservation &&
    draft.officeReservation !== "not_requested"
  ) {
    status += ` · 會辦${draft.officeReservation === "accepted" ? "已接受" : draft.officeReservation === "declined" ? "已拒絕" : "待回覆"}`;
  }
  const details = draft.details;
  const description = details
    ? [
        title.length > 256 ? title : "",
        details.schedule,
        `${safe(details.calendar)}${details.office ? " · 會辦" : ""}`,
        details.location ? `地點：${safe(details.location)}` : "",
        details.attendees.length
          ? `邀請：${details.attendees.map(safe).join("、")}`
          : "",
        details.description ? safe(details.description) : "",
        ...(state === "draft"
          ? details.changes.map(
              (change) =>
                `**${change.name}**\n${safe(change.before)} → ${safe(change.after)}`,
            )
          : []),
        state === "draft" && deleting ? "此處無法復原。" : "",
        draft.error ? safe(draft.error) : "",
      ]
        .filter(Boolean)
        .join("\n")
    : draft.preview;
  const components: Record<string, unknown>[] = [];
  if (state === "draft" || state === "retry") {
    components.push(
      button(
        draft.id,
        "confirm",
        `${state === "retry" ? "重試" : "確認"}${verb}`,
        deleting ? 4 : 1,
      ),
    );
    components.push(
      button(
        draft.id,
        "cancel",
        deleting
          ? "保留活動"
          : draft.name === "edit_calendar_event"
            ? "取消修改"
            : "取消",
      ),
    );
  } else if (state === "saving") {
    components.push(
      button(draft.id, "confirm", `確認${verb}`, deleting ? 4 : 1, true),
    );
  } else if (state === "stale") {
    components.push(button(draft.id, "refresh", "讀取最新內容", 1));
    components.push(button(draft.id, "cancel", "取消這次操作"));
  }
  if (state === "uncertain")
    components.push(button(draft.id, "verify", "查詢結果", 1));
  if (state === "complete" && draft.officeReservation === "pending")
    components.push(button(draft.id, "office", "更新會辦狀態"));
  if (
    draft.eventLink &&
    /^https:\/\/calendar\.google\.com\//.test(draft.eventLink)
  )
    components.push({
      type: 2,
      style: 5,
      label: "開啟日曆",
      url: draft.eventLink,
    });
  return {
    content: draft.discussion ?? "",
    embeds: [
      {
        author: { name: status },
        title: title.slice(0, 256),
        description: description.slice(0, 4096),
        color:
          state === "complete" && draft.officeReservation !== "declined"
            ? 0x81c79b
            : ["retry", "unavailable"].includes(state) ||
                draft.officeReservation === "declined"
              ? 0xf09093
              : state === "saving"
                ? 0x8992fa
                : 0xe7bc74,
        ...(state === "draft"
          ? {
              footer: {
                text: `${new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", hour12: false }).format(draft.expires)} 到期`,
              },
            }
          : {}),
      },
    ],
    components: components.length ? [{ type: 1, components }] : [],
    allowed_mentions: { parse: [] },
  };
}
