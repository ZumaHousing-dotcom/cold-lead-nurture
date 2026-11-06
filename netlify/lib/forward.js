// Shared helper: forwards a lead to the lead webhook. The secret only ever lives in Netlify env vars.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function isValidEmail(email) {
  return typeof email === "string" && email.length <= 254 && EMAIL_RE.test(email.trim());
}

async function forwardLead(lead) {
  // Full URL of the Supabase Edge Function, e.g. https://<ref>.supabase.co/functions/v1/webhook
  const url = process.env.LEAD_WEBHOOK_URL;
  const secret = process.env.WEBHOOK_SECRET;
  if (!url || !secret) throw new Error("LEAD_WEBHOOK_URL / WEBHOOK_SECRET not configured");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Webhook-Secret": secret },
      body: JSON.stringify({ ...lead, email: lead.email.trim().toLowerCase(), source: "netlify_form" }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Lead webhook responded ${res.status}`);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { isValidEmail, forwardLead };
