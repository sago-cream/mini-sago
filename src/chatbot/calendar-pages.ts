const frame = (title: string, content: string) => `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · discord-calendar</title>
<style>body{font:18px/1.65 system-ui,sans-serif;color:#193329;background:#f4f7f4;margin:0}main{max-width:720px;margin:auto;padding:64px 24px}h1{line-height:1.2;font-size:36px}h2{font-size:23px;margin-top:36px}a{color:#17613d}nav{margin-bottom:40px}footer{border-top:1px solid #c6d6cb;margin-top:48px;padding-top:20px;font-size:15px}</style>
<main><nav><a href="/calendar">discord-calendar</a> / MiniSago</nav>${content}<footer>Operated for the National Tsing Hua University Student Association.<br>Contact: <a href="mailto:admin@nthusa.tw">admin@nthusa.tw</a> · <a href="/calendar/privacy">Privacy policy</a></footer></main></html>`;

const home = frame(
  "Calendar bookings",
  `
<h1>Office bookings through MiniSago</h1>
<p>discord-calendar connects MiniSago in the NTHUSA Discord server to the shared 學生會辦空間登記 Google Calendar.</p>
<p>Members can ask about availability, prepare a booking, change a meeting time, and invite people by email. MiniSago shows the booking details and guest list for the requester to confirm before saving changes or requesting invitation notifications.</p>
<p>Calendar access is authorized by the designated booking account. This integration is operated for the association and does not offer public Google account registration.</p>
<h2>Using the calendar</h2><p>Ask MiniSago in the association’s Discord server, for example: 「下禮拜有人要用會辦嗎？」 For a booking, provide the date, time, location, and any guest email addresses. Review the preview and choose Confirm or Cancel. Google Calendar allows overlapping events, so check availability before booking.</p>`,
);

const privacy = frame(
  "Privacy policy",
  `
<h1>Calendar integration privacy policy</h1><p>Effective September 19, 2026. This policy covers the discord-calendar integration in MiniSago.</p>
<h2>Data used</h2><p>The integration verifies the authorized Google account’s email address and accesses event titles, descriptions, times, locations, event identifiers, and guest email addresses and RSVP status in the designated shared calendar. It uses this information to answer calendar questions, prepare bookings, update events, and request invitations after confirmation.</p>
<h2>Where information goes</h2><p>Relevant calendar and conversation information is processed by MiniSago and its AI provider, OpenAI, to respond to requests. Booking previews and answers appear in the Discord channel where the request was made and are visible to people with access to that channel. Google receives confirmed changes and sends event information to the selected guests. The integration does not sell calendar information or use it for advertising.</p>
<h2>Credentials and storage</h2><p>Google OAuth credentials are stored on the operator’s server, with an encrypted recovery copy in the association’s Vaultwarden. Credentials are not provided to the AI worker or posted in Discord. Pending booking drafts expire after 15 minutes and are removed during subsequent draft activity. Calendar events and Discord messages remain in their respective services until removed. Related request details may also remain in operational traces and configured backups; worker debug traces are retained for up to 14 days.</p>
<h2>Control and removal</h2><p>The authorized account can revoke access from <a href="https://myaccount.google.com/connections">Google Account connections</a>. Calendar administrators can change sharing permissions or remove events in Google Calendar. Contact <a href="mailto:admin@nthusa.tw">admin@nthusa.tw</a> to request assistance with access, correction, or removal of integration data and recovery copies.</p>`,
);

export function handleCalendarPage(request: Request): Response | undefined {
  const path = new URL(request.url).pathname;
  const content =
    path === "/calendar"
      ? home
      : path === "/calendar/privacy"
        ? privacy
        : undefined;
  if (!content) return undefined;
  if (request.method !== "GET" && request.method !== "HEAD")
    return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
  return new Response(request.method === "HEAD" ? null : content, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
