// Called by lead-capture-snippet.html (same-origin). Validates, then forwards with the secret.
const { isValidEmail, forwardLead } = require("../lib/forward");

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "method not allowed" });
  if ((event.body || "").length > 10000) return json(413, { error: "too large" });

  let data;
  try {
    data = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "invalid json" });
  }
  if (!isValidEmail(data.email)) return json(400, { error: "invalid email" });

  const str = (v, n) => (v == null ? "" : String(v).trim().slice(0, n));
  try {
    await forwardLead({
      email: data.email,
      first_name: str(data.first_name, 100),
      room_interest: str(data.room_interest, 200),
      step: str(data.step, 20),
      completed: data.completed === true,
    });
    return json(200, { ok: true });
  } catch (err) {
    console.error("lead-capture forward failed:", err.message);
    return json(502, { error: "upstream failed" });
  }
};
