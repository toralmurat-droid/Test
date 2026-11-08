// Outgoing email (password reset codes) through Resend's HTTP API (resend.com).
// Railway blocks normal mail ports, so mail goes out over HTTPS.
// Set RESEND_API_KEY on the server (Railway: service -> Variables). MAIL_FROM picks the sender
// (default "Pixel Town Brawl <noreply@fmtpa.ch>"; its domain must be verified in Resend).
// Without a key no mail is sent: in dev the mail is printed to the console instead.

export const mailReady = () => !!process.env.RESEND_API_KEY || process.env.NODE_ENV !== "production";

export interface Mail { to: string; subject: string; text: string }

/** Test hook: mails sent while no API key is set (dev and tests). */
export const outbox: Mail[] = [];

export async function sendMail(mail: Mail): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV === "production") throw new Error("Email is not set up on this server yet.");
    outbox.push(mail);
    if (outbox.length > 50) outbox.shift();
    if (!process.env.NODE_TEST_CONTEXT) console.log(`[mail to ${mail.to}] ${mail.subject}\n${mail.text}`);
    return;
  }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.MAIL_FROM || "Pixel Town Brawl <noreply@fmtpa.ch>",
      to: [mail.to], subject: mail.subject, text: mail.text,
    }),
  });
  if (!r.ok) {
    console.error("Mail send failed:", r.status, (await r.text().catch(() => "")).slice(0, 300));
    throw new Error("The email could not be sent. Try again later.");
  }
}
