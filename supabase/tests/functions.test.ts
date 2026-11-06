// Run: deno test supabase/tests/functions.test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";
import { createMailchimp, subscriberHash } from "../functions/_shared/mailchimp.ts";
import { runAbandonJob, syncPending } from "../functions/_shared/jobs.ts";
import { cleanLine, FALLBACK_LINE, generateNudge } from "../functions/_shared/nudge.ts";
import { createLimiter, createWebhookHandler } from "../functions/_shared/webhook.ts";
import type { Lead, Mailchimp, Store } from "../functions/_shared/types.ts";

const SECRET = "test-secret";

const lead = (o: Partial<Lead> = {}): Lead => ({
  email: "a@b.co", first_name: "Sam", room_interest: null, step: "1", source: "netlify_form",
  status: "started", abandoned_at: null, nudge_line: null, version: 1, synced_version: 0, ...o,
});

/** In-memory Store. upsertLead mimics the SQL function (which is tested for real in leads.test.sql). */
class FakeStore implements Store {
  rows = new Map<string, Lead>();
  candidates: Lead[] = [];
  upserts: Parameters<Store["upsertLead"]>[0][] = [];
  upsertLead(a: Parameters<Store["upsertLead"]>[0]) {
    this.upserts.push(a);
    const cur = this.rows.get(a.email);
    const next = lead({ email: a.email, source: cur?.source ?? a.source, first_name: a.first_name || cur?.first_name || null,
      status: a.completed || cur?.status === "completed" ? "completed" : "started", version: (cur?.version ?? 0) + 1,
      synced_version: cur?.synced_version ?? 0 });
    this.rows.set(a.email, next);
    return Promise.resolve(next);
  }
  markSynced(email: string, version: number) {
    const r = this.rows.get(email); if (r) r.synced_version = version; return Promise.resolve();
  }
  unsynced() { return Promise.resolve([...this.rows.values()].filter((r) => r.synced_version < r.version)); }
  abandonedCandidates() { return Promise.resolve(this.candidates); }
  saved: Record<string, string> = {};
  saveNudgeLine(email: string, line: string) { this.saved[email] = line; return Promise.resolve(); }
  abandoned: string[] = [];
  markAbandoned(email: string) { this.abandoned.push(email); return Promise.resolve(); }
}

class FakeMailchimp implements Mailchimp {
  synced: [string, string, string][] = [];
  tagged: [string, string][] = [];
  fail = false;
  syncLead(l: Lead) { if (this.fail) return Promise.reject(new Error("down")); this.synced.push([l.email, l.status, l.source]); return Promise.resolve(); }
  tagAbandoned(email: string, line: string) { if (this.fail) return Promise.reject(new Error("down")); this.tagged.push([email, line]); return Promise.resolve(); }
}

function setup(limit = 1000) {
  const store = new FakeStore(), mc = new FakeMailchimp();
  const handler = createWebhookHandler({ secret: SECRET, store, mailchimp: mc, allow: createLimiter(limit) });
  const post = (body: unknown, secret: string | null = SECRET) =>
    handler(new Request("https://x.test/functions/v1/webhook", {
      method: "POST", body: JSON.stringify(body),
      headers: { "content-type": "application/json", ...(secret === null ? {} : { "x-webhook-secret": secret }) },
    }));
  return { store, mc, handler, post };
}

// ---------- webhook ----------
Deno.test("valid lead is stored and synced; email lowercased", async () => {
  const { store, mc, post } = setup();
  const r = await post({ email: "Sam@Example.com", first_name: "Sam", room_interest: "Private", step: 1 });
  assertEquals(r.status, 200);
  assertEquals(await r.json(), { ok: true, status: "started" });
  assertEquals(store.upserts[0], { email: "sam@example.com", source: "netlify_form", first_name: "Sam", room_interest: "Private", step: "1", completed: false });
  assertEquals(mc.synced, [["sam@example.com", "started", "netlify_form"]]);
});

Deno.test("bad or missing secret is rejected and nothing is stored", async () => {
  const { store, mc, post } = setup();
  assertEquals((await post({ email: "a@b.co" }, "nope")).status, 401);
  assertEquals((await post({ email: "a@b.co" }, null)).status, 401);
  assertEquals(store.upserts.length + mc.synced.length, 0);
});

Deno.test("completed lead is not downgraded and is synced as completed", async () => {
  const { mc, post } = setup();
  await post({ email: "a@b.co", completed: true });
  const r = await post({ email: "a@b.co", completed: false, step: 1 });
  assertEquals((await r.json()).status, "completed");
  assert(mc.synced.every(([, status]) => status === "completed"));
});

Deno.test("source defaults to netlify_form; explicit source kept; bad source rejected", async () => {
  const { store, post } = setup();
  await post({ email: "a@b.co" });
  await post({ email: "c@d.co", source: "appfolio" });
  assertEquals(store.upserts.map((u) => u.source), ["netlify_form", "appfolio"]);
  assertEquals((await post({ email: "e@f.co", source: "Bad Source!" })).status, 422);
});

Deno.test("invalid email / non-boolean completed", async () => {
  const { store, post } = setup();
  assertEquals((await post({ email: "not-an-email" })).status, 422);
  await post({ email: "a@b.co", completed: "true" }); // only a real boolean true completes
  assertEquals(store.upserts[0].completed, false);
});

Deno.test("Mailchimp failure keeps the lead (200) and leaves it for retry", async () => {
  const { store, mc, post } = setup();
  mc.fail = true;
  assertEquals((await post({ email: "a@b.co" })).status, 200);
  assertEquals((await store.unsynced()).length, 1);
  mc.fail = false;
  assertEquals(await syncPending(store, mc), 1);
  assertEquals((await store.unsynced()).length, 0);
});

Deno.test("rate limit and health", async () => {
  const { handler, post } = setup(2);
  assertEquals([await post({ email: "a@b.co" }), await post({ email: "a@b.co" }), await post({ email: "a@b.co" })].map((r) => r.status), [200, 200, 429]);
  assertEquals((await handler(new Request("https://x.test/functions/v1/webhook/health"))).status, 200);
});

// ---------- abandon job ----------
Deno.test("job tags candidates and saves the line", async () => {
  const store = new FakeStore(), mc = new FakeMailchimp();
  store.candidates = [lead({ email: "old@x.co" })];
  const n = await runAbandonJob(store, mc, () => Promise.resolve("Fake warm line."), 60);
  assertEquals([n, mc.tagged, store.abandoned, store.saved], [1, [["old@x.co", "Fake warm line."]], ["old@x.co"], { "old@x.co": "Fake warm line." }]);
});

Deno.test("job: Mailchimp failure -> not marked abandoned; saved line reused on retry", async () => {
  const store = new FakeStore(), mc = new FakeMailchimp();
  let calls = 0;
  const nudge = () => { calls++; return Promise.resolve("Line."); };
  store.candidates = [lead({ email: "old@x.co" })];
  mc.fail = true;
  assertEquals(await runAbandonJob(store, mc, nudge, 60), 0);
  assertEquals(store.abandoned, []);
  mc.fail = false;
  store.candidates = [lead({ email: "old@x.co", nudge_line: store.saved["old@x.co"] })]; // DB now holds the saved line
  assertEquals(await runAbandonJob(store, mc, nudge, 60), 1);
  assertEquals(calls, 1); // Claude not called again
});

// ---------- nudge ----------
const anthropicFetch = (text: string, ok = true) =>
  (() => Promise.resolve(ok ? new Response(JSON.stringify({ content: [{ type: "text", text }] })) : new Response("err", { status: 500 }))) as typeof fetch;

Deno.test("nudge: good line used; API failure / missing key -> fallback", async () => {
  const l = lead({ room_interest: "Private Room" });
  assert((await generateNudge(l, "k", "m", anthropicFetch("Finding your perfect room is almost done, so come finish up."))).startsWith("Finding your perfect"));
  assertEquals(await generateNudge(l, "k", "m", anthropicFetch("", false)), FALLBACK_LINE);
  assertEquals(await generateNudge(l, "k", "m", (() => Promise.reject(new Error("net"))) as typeof fetch), FALLBACK_LINE);
  assertEquals(await generateNudge(l, "", "m"), FALLBACK_LINE);
});

Deno.test("nudge: rules enforced", () => {
  assertEquals(cleanLine("Rooms from $900 are waiting for you."), null);
  assertEquals(cleanLine("Come back and finish up \u{1F60A}"), null);
  assertEquals(cleanLine("Move in on 15 March, come finish"), null);
  assertEquals(cleanLine("word ".repeat(30)), null);
  assertEquals(cleanLine('"Your room is waiting for you."'), "Your room is waiting for you.");
  assertEquals(cleanLine(FALLBACK_LINE), FALLBACK_LINE);
});

// ---------- Mailchimp client ----------
function mockMc(status = "pending") {
  const calls: { method: string; path: string; body: Record<string, unknown> }[] = [];
  const f = ((url: string, init: RequestInit) => {
    calls.push({ method: init.method!, path: new URL(url).pathname, body: JSON.parse(init.body as string) });
    return Promise.resolve(new Response("{}"));
  }) as unknown as typeof fetch;
  return { calls, mc: createMailchimp("key-us17", "LIST", status, f) };
}

Deno.test("mailchimp: started sync", async () => {
  const { calls, mc } = mockMc();
  await mc.syncLead(lead({ email: "Sam@X.co" }));
  const h = subscriberHash("sam@x.co");
  assertEquals(h, "5ff4ac5c93f8da873864e7af72d5b3eb");
  assertEquals([calls[0].method, calls[0].path], ["PUT", `/3.0/lists/LIST/members/${h}`]);
  assertEquals(calls[0].body.status_if_new, "pending");
  assertEquals(calls[0].body.merge_fields, { FNAME: "Sam", STEP: "1", SOURCE: "netlify_form" }); // empty ROOM omitted
  assertEquals(calls[1].body, { tags: [{ name: "form-started", status: "active" }] });
});

Deno.test("mailchimp: completed swaps tags; abandoned caps NUDGELINE at 240", async () => {
  const a = mockMc();
  await a.mc.syncLead(lead({ status: "completed" }));
  assertEquals(a.calls[1].body.tags, [{ name: "form-completed", status: "active" }, { name: "form-started", status: "inactive" }, { name: "form-abandoned", status: "inactive" }]);
  const b = mockMc();
  await b.mc.tagAbandoned("a@b.co", "x".repeat(500));
  assertEquals(((b.calls[0].body.merge_fields as Record<string, string>).NUDGELINE).length, 240);
  assertEquals(b.calls[1].body, { tags: [{ name: "form-abandoned", status: "active" }] });
});
