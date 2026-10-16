import "server-only";

// Transactional email. Uses Resend (resend.com) when RESEND_API_KEY and EMAIL_FROM are set.
// Without them nothing is sent: in development the message is printed to the server log instead.
// STATUS: the Resend call follows Resend's documented API; it has not been run against a live account here.

export function emailConfigured() {
  return !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(to: string, subject: string, text: string, html: string): Promise<boolean> {
  if (!emailConfigured()) {
    if (process.env.NODE_ENV !== "production") console.log(`[email:dev] to=${to} subject="${subject}"\n${text}`);
    else console.warn("[email] RESEND_API_KEY / EMAIL_FROM not set — email not sent:", subject);
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, text, html }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error("[email] Resend refused the message:", res.status, (await res.text()).slice(0, 200));
    return res.ok;
  } catch (e) {
    console.error("[email] sending failed:", (e as Error).message);
    return false;
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** A simple, readable email layout: one heading, a few lines, one button. */
export function simpleEmail(title: string, lines: string[], button?: { label: string; url: string }) {
  const text = [title, "", ...lines, ...(button ? ["", `${button.label}: ${button.url}`] : []), "", "— Project Connect"].join("\n");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#2B1F45">
<p style="font-size:20px;font-weight:bold;color:#2E2A6E;margin:0 0 16px">Project Connect</p>
<h1 style="font-size:22px;margin:0 0 12px">${esc(title)}</h1>
${lines.map((l) => `<p style="font-size:15px;line-height:1.5;margin:0 0 12px">${esc(l)}</p>`).join("")}
${button ? `<p style="margin:24px 0"><a href="${esc(button.url)}" style="background:#2E2A6E;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:bold;display:inline-block">${esc(button.label)}</a></p>
<p style="font-size:12px;color:#5D5B82;word-break:break-all">Or paste this link into your browser: ${esc(button.url)}</p>` : ""}
</div>`;
  return { text, html };
}
