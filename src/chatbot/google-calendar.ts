import { createHash } from "node:crypto";
import { z } from "zod";

export const CALENDAR_GUILD_ID = "1514899496797212683";
export const CALENDAR_ID =
  "c_14bf5641071c6089c46061dda50e795027b7bd66885861a4f6d0a72a68cd3703@group.calendar.google.com";
const timezone = "Asia/Taipei";
const timestamp = z.iso.datetime({ offset: true });
const date = z.iso.date();
const eventId = z.string().regex(/^[a-zA-Z0-9_-]{5,1024}$/u);
const schedule = z
  .discriminatedUnion("kind", [
    z
      .object({ kind: z.literal("timed"), start: timestamp, end: timestamp })
      .strict(),
    z.object({ kind: z.literal("all_day"), start: date, end: date }).strict(),
  ])
  .refine((value) => Date.parse(value.end) > Date.parse(value.start), {
    message: "End must be after start; all-day end dates are exclusive.",
  });
const fields = {
  title: z.string().trim().min(1).max(300),
  description: z.string().max(8000),
  location: z.string().max(1000),
  schedule,
};
export const calendarSchemas = {
  list_calendar_events: z
    .object({
      start: timestamp,
      end: timestamp,
      query: z.string().trim().min(1).max(200).optional(),
      pageToken: z.string().max(4096).optional(),
      limit: z.number().int().min(1).max(50).default(25),
    })
    .strict()
    .refine(
      ({ start, end }) => {
        const duration = Date.parse(end) - Date.parse(start);
        return duration > 0 && duration <= 366 * 86400000;
      },
      { message: "Use a positive date range of at most 366 days." },
    ),
  get_calendar_event: z.object({ eventId }).strict(),
  create_calendar_event: z
    .object({
      ...fields,
      description: fields.description.optional(),
      location: fields.location.optional(),
      operationKey: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/u),
    })
    .strict(),
  edit_calendar_event: z
    .object({
      eventId,
      etag: z.string().min(1).max(256),
      title: fields.title.optional(),
      description: fields.description.optional(),
      location: fields.location.optional(),
      schedule: fields.schedule.optional(),
    })
    .strict()
    .refine(
      (input) =>
        [input.title, input.description, input.location, input.schedule].some(
          (value) => value !== undefined,
        ),
      { message: "Provide at least one changed field." },
    ),
};
export type CalendarToolName = keyof typeof calendarSchemas;
export const calendarDescriptions: Record<CalendarToolName, string> = {
  list_calendar_events:
    "List 學生會辦空間登記 events in a bounded time range. Times require UTC offsets; default local timezone is Asia/Taipei. Follow nextPageToken to get more results.",
  get_calendar_event:
    "Read an event and its etag before editing. Recurring occurrences can be edited individually; whole recurring series cannot be edited with these tools.",
  create_calendar_event:
    "Create a one-off event in 學生會辦空間登記 when requested. Use timed RFC3339 timestamps with offsets or all_day dates with an exclusive end date. Use a distinct operationKey for each requested event and reuse that key unchanged on retries. Check existing bookings first; overlaps are allowed by Google Calendar.",
  edit_calendar_event:
    "Edit an explicitly requested event using its latest etag from get_calendar_event. Omitted fields stay unchanged; empty description/location clears them. All-day end dates are exclusive. Edits to an individual recurring occurrence are allowed; whole series edits are unsupported. Existing guests are notified of changes. On conflict, reread and reconcile before retrying.",
};
type CalendarEvent = Record<string, any>;
function compact(event: CalendarEvent) {
  return Object.fromEntries(
    [
      "id",
      "etag",
      "summary",
      "description",
      "location",
      "start",
      "end",
      "status",
      "htmlLink",
      "recurrence",
      "recurringEventId",
      "originalStartTime",
    ]
      .filter((key) => event[key] !== undefined)
      .map((key) => [
        key,
        typeof event[key] === "string" ? event[key].slice(0, 8000) : event[key],
      ]),
  );
}
function eventFields(input: {
  title?: string;
  description?: string;
  location?: string;
  schedule?: z.infer<typeof schedule>;
}) {
  const result: CalendarEvent = {};
  if (input.title !== undefined) result.summary = input.title;
  if (input.description !== undefined) result.description = input.description;
  if (input.location !== undefined) result.location = input.location;
  if (input.schedule) {
    const { kind, start, end } = input.schedule;
    result.start =
      kind === "timed"
        ? { dateTime: start, timeZone: timezone }
        : { date: start };
    result.end =
      kind === "timed" ? { dateTime: end, timeZone: timezone } : { date: end };
  }
  return result;
}
class CalendarError extends Error {}
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export function createGoogleCalendarClient(
  env: Record<string, string | undefined>,
  context: { guildId?: string; messageId: string },
  request: typeof fetch = fetch,
) {
  if (context.guildId !== CALENDAR_GUILD_ID) return undefined;
  const clientId = env.MINISAGO_GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = env.MINISAGO_GOOGLE_CALENDAR_CLIENT_SECRET;
  const refreshToken = env.MINISAGO_GOOGLE_CALENDAR_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return undefined;
  let token: { value: string; expires: number } | undefined;
  let refreshing: Promise<string> | undefined;
  async function accessToken() {
    if (token && token.expires > Date.now() + 60000) return token.value;
    if (refreshing) return refreshing;
    refreshing = (async () => {
      const response = await request("https://oauth2.googleapis.com/token", {
        method: "POST",
        body: new URLSearchParams({
          client_id: clientId!,
          client_secret: clientSecret!,
          refresh_token: refreshToken!,
          grant_type: "refresh_token",
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok)
        throw new CalendarError(
          "Calendar authorization unavailable; an administrator must check the saved OAuth credentials.",
        );
      const data = (await response.json()) as Record<string, unknown>;
      if (
        typeof data.access_token !== "string" ||
        typeof data.expires_in !== "number"
      )
        throw new CalendarError(
          "Calendar authorization returned an invalid response.",
        );
      token = {
        value: data.access_token,
        expires: Date.now() + data.expires_in * 1000,
      };
      return token.value;
    })();
    try {
      return await refreshing;
    } finally {
      refreshing = undefined;
    }
  }
  const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events`;
  async function api(path = "", init: RequestInit = {}) {
    const bearer = await accessToken();
    const response = await request(base + path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init.headers,
        Authorization: `Bearer ${bearer}`,
      },
      signal: AbortSignal.timeout(20000),
    });
    if (response.status === 401) token = undefined;
    return response;
  }
  async function body(response: Response): Promise<CalendarEvent> {
    if (!response.ok) {
      const errors: Record<number, string> = {
        401: "Calendar authorization expired. Ask an administrator to reconnect the account.",
        403: "Calendar access denied. Ask an administrator to check access or quota.",
        404: "Calendar event not found.",
        409: "This operationKey already belongs to a different event request. Read the existing booking before continuing.",
        412: "Calendar event changed. Read it again and reconcile changes before retrying.",
        429: "Calendar rate limit reached. Retry later with the same operationKey.",
      };
      throw new CalendarError(
        errors[response.status] ??
          "Google Calendar request failed. Read the event before retrying an edit; reuse the same operationKey when retrying creation.",
      );
    }
    return (await response.json()) as CalendarEvent;
  }
  return {
    async call(
      name: CalendarToolName,
      raw: unknown,
    ): Promise<Record<string, unknown>> {
      try {
        if (name === "list_calendar_events") {
          const input = calendarSchemas.list_calendar_events.parse(raw);
          const params = new URLSearchParams({
            timeMin: input.start,
            timeMax: input.end,
            maxResults: String(input.limit),
            singleEvents: "true",
            orderBy: "startTime",
            timeZone: timezone,
          });
          if (input.query) params.set("q", input.query);
          if (input.pageToken) params.set("pageToken", input.pageToken);
          const data = await body(await api(`?${params}`));
          return {
            status: "complete",
            events: (data.items ?? []).map(compact),
            nextPageToken: data.nextPageToken,
          };
        }
        if (name === "get_calendar_event") {
          const input = calendarSchemas.get_calendar_event.parse(raw);
          return {
            status: "complete",
            event: compact(await body(await api(`/${input.eventId}`))),
          };
        }
        if (name === "create_calendar_event") {
          const input = calendarSchemas.create_calendar_event.parse(raw);
          const event = eventFields(input);
          const id = digest(
            `${context.guildId}:${context.messageId}:${input.operationKey}`,
          );
          const fingerprint = digest(JSON.stringify(event));
          const response = await api("?sendUpdates=all", {
            method: "POST",
            body: JSON.stringify({
              ...event,
              id,
              extendedProperties: {
                private: { minisagoFingerprint: fingerprint },
              },
            }),
          });
          if (response.status === 409) {
            const existing = await body(await api(`/${id}`));
            if (
              existing.status !== "cancelled" &&
              existing.extendedProperties?.private?.minisagoFingerprint ===
                fingerprint
            ) {
              return {
                status: "complete",
                reused: true,
                event: compact(existing),
              };
            }
          }
          return { status: "complete", event: compact(await body(response)) };
        }
        const input = calendarSchemas.edit_calendar_event.parse(raw);
        const existing = await body(await api(`/${input.eventId}`));
        if (existing.etag !== input.etag)
          throw new CalendarError(
            "Calendar event changed. Read it again and reconcile changes before retrying.",
          );
        if (existing.recurrence)
          throw new CalendarError(
            "Whole recurring series edits are unsupported. List occurrences and edit the intended instance instead.",
          );
        if (existing.status === "cancelled")
          throw new CalendarError("Cancelled events cannot be edited.");
        return {
          status: "complete",
          event: compact(
            await body(
              await api(
                `/${input.eventId}?sendUpdates=all&conferenceDataVersion=1`,
                {
                  method: "PATCH",
                  headers: { "If-Match": input.etag },
                  body: JSON.stringify(eventFields(input)),
                },
              ),
            ),
          ),
        };
      } catch (error) {
        return {
          status: "unavailable",
          error:
            error instanceof CalendarError
              ? error.message
              : error instanceof z.ZodError
                ? "Invalid calendar input. Check dates, event ID, and required fields."
                : "Calendar request could not be completed. Reuse the same operationKey for creation retries; read events again before retrying edits.",
        };
      }
    },
  };
}
export type GoogleCalendarClient = NonNullable<
  ReturnType<typeof createGoogleCalendarClient>
>;
