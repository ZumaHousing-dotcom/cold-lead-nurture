// Netlify runs this automatically after every successful *Netlify Forms* submission.
// NOTE: only fires for forms handled by Netlify Forms (data-netlify="true").
const { isValidEmail, forwardLead } = require("../lib/forward");

exports.handler = async (event) => {
  const payload = (JSON.parse(event.body || "{}").payload) || {};
  const data = payload.data || {};

  const wanted = process.env.FORM_NAME; // optional filter
  if (wanted && payload.form_name !== wanted) return { statusCode: 200, body: "ignored" };
  if (!isValidEmail(data.email)) return { statusCode: 200, body: "no valid email" };

  try {
    await forwardLead({
      email: data.email,
      first_name: String(data.first_name || data.firstName || "").trim().slice(0, 100),
      room_interest: String(data.room_interest || data.roomPreference || "").trim().slice(0, 200),
      step: "completed",
      completed: true,
    });
    return { statusCode: 200, body: "ok" };
  } catch (err) {
    console.error("submission-created forward failed:", err.message);
    return { statusCode: 500, body: "forward failed" };
  }
};
