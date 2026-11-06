// Shared helper: forwards a lead to the Python app. The secret only ever lives in Netlify env vars.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function isValidEmail(email) {
  return typeof email === "string" && email.length <= 254 && EMAIL_RE.test(email.trim());
}

async function forwardLead(lead) {
  const base = process.env.PYTHON_APP_URL;
  const secret = process.env.WEBHOOK_SECRET;
  if (!base || !secret) throw new Error("PYTHON_APP_URL / WEBHOOK_SECRET not configured");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch(base.replace(/\/+$/, "") + "/webhook/lead", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Webhook-Secret": secret },
      body: JSON.stringify({ ...lead, email: lead.email.trim().toLowerCase(), source: "netlify_form" }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Python app responded ${res.status}`);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { isValidEmail, forwardLead };
