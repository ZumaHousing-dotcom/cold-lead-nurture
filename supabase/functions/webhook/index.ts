// POST /functions/v1/webhook   (called by the Netlify function lead-capture)
// GET  /functions/v1/webhook/health
import { createMailchimp } from "../_shared/mailchimp.ts";
import { createSupabaseStore } from "../_shared/store.ts";
import { createLimiter, createWebhookHandler } from "../_shared/webhook.ts";

const env = (k: string, d = "") => Deno.env.get(k) || d;
const secret = env("WEBHOOK_SECRET");
if (!secret) throw new Error("WEBHOOK_SECRET must be set");

Deno.serve(createWebhookHandler({
  secret,
  store: createSupabaseStore(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY")),
  mailchimp: createMailchimp(env("MAILCHIMP_API_KEY"), env("MAILCHIMP_LIST_ID"), env("MAILCHIMP_STATUS_IF_NEW", "subscribed")),
  allow: createLimiter(parseInt(env("RATE_LIMIT_PER_MIN", "60"), 10)),
}));
