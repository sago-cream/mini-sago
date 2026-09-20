import { z } from "zod";

export const CALENDAR_GUILD_ID = "1514899496797212683";
export const OFFICE_CALENDAR_ID =
  "c_14bf5641071c6089c46061dda50e795027b7bd66885861a4f6d0a72a68cd3703@group.calendar.google.com";
export const CALENDAR_USER_ACCOUNT = "nthusa@gapp.nthu.edu.tw";
const secondaryCalendar = z
  .string()
  .regex(/^[a-zA-Z0-9_]+@group\.calendar\.google\.com$/u);
const settingsSchema = z
  .object({
    guildId: z.string().regex(/^\d{17,20}$/u),
    calendarId: secondaryCalendar,
    calendarName: z.string().trim().min(1).max(100),
    officeCalendarId: secondaryCalendar,
    account: z.email(),
  })
  .refine((value) => value.calendarId !== value.officeCalendarId);

// These settings and the neutral Google calendar travel with the NTHUSA fork.
// Missing configuration must never fall back to writing the office calendar.
export function calendarSettings(env: Record<string, string | undefined>) {
  const parsed = settingsSchema.safeParse({
    guildId: env.DISCORD_CALENDAR_GUILD_ID || CALENDAR_GUILD_ID,
    calendarId: env.DISCORD_CALENDAR_ID,
    calendarName: env.DISCORD_CALENDAR_NAME || "discord-calendar",
    officeCalendarId: env.DISCORD_OFFICE_CALENDAR_ID || OFFICE_CALENDAR_ID,
    account: env.DISCORD_CALENDAR_ACCOUNT || CALENDAR_USER_ACCOUNT,
  });
  return parsed.success ? parsed.data : undefined;
}
export type CalendarSettings = NonNullable<ReturnType<typeof calendarSettings>>;
