const escape = (value: string) =>
  value.replace(
    /[&<>"']/gu,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
export const mailHeaders = {
  "Cache-Control": "no-store",
  "Content-Type": "text/html; charset=utf-8",
  "Content-Security-Policy":
    "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'self' https://accounts.google.com",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin",
  "X-Robots-Tag": "noindex, nofollow",
};
export function mailPage(title: string, content: string, status = 200) {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)} · discord-mail</title>
  <style>html{-webkit-font-smoothing:antialiased}body{font:18px/1.65 system-ui,sans-serif;color:#193329;background:#f4f7f4;margin:0}main{max-width:720px;margin:auto;padding:64px 24px}h1{line-height:1.2;font-size:36px;text-wrap:balance}h2{font-size:24px;margin-top:32px}p,li{text-wrap:pretty}.account{font-weight:600;overflow-wrap:anywhere}a{color:#17613d}nav{margin-bottom:40px}button{font:600 18px/1.4 system-ui,sans-serif;color:white;background:#17613d;border:0;border-radius:8px;padding:12px 24px;min-height:48px;cursor:pointer}button:hover{background:#193329}button:focus-visible,a:focus-visible{outline:3px solid #17613d;outline-offset:4px}button:active{transform:scale(.97)}footer{border-top:1px solid #c6d6cb;margin-top:48px;padding-top:20px;font-size:16px}@media(max-width:480px){main{padding-top:32px}h1{font-size:32px}}</style></head>
  <body><main><nav><a href="/mail">discord-mail</a></nav>${content}<footer>Operated for the National Tsing Hua University Student Association.<br>Contact: <a href="mailto:admin@nthusa.tw">admin@nthusa.tw</a> · <a href="/mail/privacy">Privacy policy</a></footer></main></body></html>`,
    { status, headers: mailHeaders },
  );
}
export function mailInvitationPage(
  email: string,
  token: string,
  expires: number,
) {
  return mailPage(
    "Connect your mailbox",
    `<h1>Connect your mailbox to Sago</h1><p class="account">${escape(email)}</p><p>Sago can search and summarize this mailbox when its operator asks in their private Discord conversation.</p>
  <h2>What you’re allowing</h2><p>Read-only access to email messages, attachments, and settings across this mailbox. Sago cannot send, delete, change labels, or mark messages as read.</p><p>Relevant message text is processed by OpenAI to answer the operator’s requests. Answers appear in their private Discord conversation. <a href="/mail/privacy">Read how your information is used</a>.</p>
  <form method="post" action="/mail/oauth/start"><input type="hidden" name="invite" value="${escape(token)}"><button type="submit">Continue with Google</button></form>
  <p>Sign in as <span class="account">${escape(email)}</span>, review Google’s permissions, then choose Allow. You can revoke access at any time in <a href="https://myaccount.google.com/connections">Google Account connections</a>.</p><p>This invitation expires ${escape(new Date(expires).toLocaleString("en-GB", { timeZone: "Asia/Taipei" }))} (Asia/Taipei).</p>`,
  );
}
export function mailPublicPage(path: string) {
  if (path === "/mail")
    return mailPage(
      "Mailbox access",
      `<h1>Read email through Sago</h1><p>discord-mail connects approved mailboxes to Sago for read-only searches and summaries in the operator’s private Discord conversation.</p><p>Mailbox owners receive a private invitation, sign in with Google, and approve read-only access. Ask the operator for an invitation to connect your mailbox.</p><p>Access is limited to approved accounts. Each owner controls their Google authorization and can revoke it at any time.</p>`,
    );
  if (path === "/mail/privacy")
    return mailPage(
      "Privacy policy",
      `<h1>Mail integration privacy policy</h1><p>Effective October 11, 2026. This policy covers the discord-mail integration operated for the National Tsing Hua University Student Association.</p>
  <h2>Data used</h2><p>The integration verifies your Google email address and requests read-only access to email messages, attachments, and settings throughout your mailbox. It reads message headers, snippets, and bounded message text to answer the operator’s explicit requests. It does not send, delete, mark messages as read, or change mailbox settings. Attachment downloads are not currently supported.</p>
  <h2>Where information goes</h2><p>Relevant email content and requests are processed by OpenAI to search and summarize mail. Results and answers appear only in the Sago operator’s private Discord conversation, where Discord also processes them. Email contents are untrusted reference material. The integration does not sell mailbox data, use it for advertising, or intentionally save it in server memory.</p>
  <h2>Storage</h2><p>OAuth refresh tokens are encrypted on the operator’s server; the encryption key and OAuth client secret stay on that server. Workers receive bounded tool results, never credentials. Email content is fetched on demand without a mailbox archive. Requests and results may remain in operational traces for up to 14 days and in Discord until removed. Encrypted credentials may be included in operator-managed recovery backups.</p>
  <h2>Control and removal</h2><p>Revoke access through <a href="https://myaccount.google.com/connections">Google Account connections</a>. Contact <a href="mailto:admin@nthusa.tw">admin@nthusa.tw</a> to disconnect a mailbox, request deletion of stored credentials and recovery copies, or ask about use of your data.</p>`,
    );
  return undefined;
}
