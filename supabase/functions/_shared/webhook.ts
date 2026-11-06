import type { Mailchimp, Store } from "./types.ts";

export const DEFAULT_SOURCE = "netlify_form";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SOURCE_RE = /^[a-z0-9_]{1,40}$/;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Constant-time string comparison (compares SHA-256 digests). */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([a, b].map(async (s) => new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)))));
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

/** Tiny in-memory sliding-window limiter. Per Edge Function instance (see README). */
export function createLimiter(limitPerMin: number) {
  const hits = new Map<string, number[]>();
  return (key: string): boolean => {
    if (limitPerMin <= 0) return true;
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= limitPerMin) { hits.set(key, recent); return false; }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5000) hits.clear();
    return true;
  };
}

export interface WebhookDeps {
  secret: string;
  store: Store;
  mailchimp: Mailchimp;
  allow: (key: string) => boolean;
}

const str = (v: unknown, max: number) => (v == null ? "" : String(v).trim().slice(0, max));

export function createWebhookHandler({ secret, store, mailchimp, allow }: WebhookDeps) {
  return async (req: Request): Promise<Response> => {
    const path = new URL(req.url).pathname;
    if (req.method === "GET" && path.endsWith("/health")) return json(200, { status: "ok" });
    if (req.method !== "POST") return json(405, { error: "method not allowed" });

    const client = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
    if (!allow(client)) return json(429, { error: "rate limited" });
    if (!await safeEqual(req.headers.get("x-webhook-secret") ?? "", secret)) return json(401, { error: "invalid secret" });

    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return json(422, { error: "invalid json" }); }

    const email = str(body.email, 254).toLowerCase();
    if (!EMAIL_RE.test(email)) return json(422, { error: "invalid email" });
    const source = str(body.source, 40).toLowerCase() || DEFAULT_SOURCE;
    if (!SOURCE_RE.test(source)) return json(422, { error: "invalid source" });

    const lead = await store.upsertLead({
      email, source,
      first_name: str(body.first_name, 100),
      room_interest: str(body.room_interest, 200),
      step: str(body.step, 20),
      completed: body.completed === true,
    });

    // Best effort: the lead is already saved, and the scheduled job retries anything unsynced.
    if (lead.synced_version < lead.version) {
      try {
        await mailchimp.syncLead(lead);
        await store.markSynced(lead.email, lead.version);
      } catch (err) {
        console.error("Mailchimp sync failed; will retry:", (err as Error).message);
      }
    }
    console.log(`lead received source=${lead.source} status=${lead.status}`);
    return json(200, { ok: true, status: lead.status });
  };
}
