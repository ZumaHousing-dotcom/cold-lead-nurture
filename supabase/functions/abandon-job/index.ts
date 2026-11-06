// Called every 15 minutes by pg_cron (see supabase/cron.sql). Same X-Webhook-Secret as the webhook.
import { createMailchimp } from "../_shared/mailchimp.ts";
import { runAbandonJob } from "../_shared/jobs.ts";
import { generateNudge } from "../_shared/nudge.ts";
import { createSupabaseStore } from "../_shared/store.ts";
import { safeEqual } from "../_shared/webhook.ts";

const env = (k: string, d = "") => Deno.env.get(k) || d;
const secret = env("WEBHOOK_SECRET");
if (!secret) throw new Error("WEBHOOK_SECRET must be set");

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  if (!await safeEqual(req.headers.get("x-webhook-secret") ?? "", secret)) return new Response("invalid secret", { status: 401 });

  const store = createSupabaseStore(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
  const mc = createMailchimp(env("MAILCHIMP_API_KEY"), env("MAILCHIMP_LIST_ID"), env("MAILCHIMP_STATUS_IF_NEW", "subscribed"));
  const apiKey = env("ANTHROPIC_API_KEY"), model = env("CLAUDE_MODEL", "claude-sonnet-5-5");
  const afterMin = parseInt(env("ABANDON_AFTER_MIN", "60"), 10);

  const tagged = await runAbandonJob(store, mc, (lead) => generateNudge(lead, apiKey, model), afterMin);
  return new Response(JSON.stringify({ ok: true, tagged }), { headers: { "Content-Type": "application/json" } });
});
