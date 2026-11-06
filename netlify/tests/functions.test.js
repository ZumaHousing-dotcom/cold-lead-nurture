// Run: node --test netlify/tests/functions.test.js
const test = require("node:test");
const assert = require("node:assert");

process.env.LEAD_WEBHOOK_URL = "https://ref.supabase.co/functions/v1/webhook";
process.env.WEBHOOK_SECRET = "s3cret";
const leadCapture = require("../functions/lead-capture").handler;
const submission = require("../functions/submission-created").handler;

function mockFetch(status = 200) {
  const calls = [];
  global.fetch = async (url, opts) => { calls.push({ url, opts }); return { ok: status < 400, status }; };
  return calls;
}

test("lead-capture forwards with secret and netlify_form source", async () => {
  const calls = mockFetch();
  const r = await leadCapture({ httpMethod: "POST", body: JSON.stringify({ email: " Sam@X.co ", first_name: "Sam", step: 1 }) });
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(calls[0].url, "https://ref.supabase.co/functions/v1/webhook");
  assert.strictEqual(calls[0].opts.headers["X-Webhook-Secret"], "s3cret");
  const sent = JSON.parse(calls[0].opts.body);
  assert.deepStrictEqual([sent.email, sent.source, sent.completed], ["sam@x.co", "netlify_form", false]);
});

test("lead-capture rejects bad email, wrong method, never calls upstream", async () => {
  const calls = mockFetch();
  assert.strictEqual((await leadCapture({ httpMethod: "POST", body: '{"email":"nope"}' })).statusCode, 400);
  assert.strictEqual((await leadCapture({ httpMethod: "GET" })).statusCode, 405);
  assert.strictEqual(calls.length, 0);
});

test("lead-capture returns 502 when upstream fails", async () => {
  mockFetch(500);
  assert.strictEqual((await leadCapture({ httpMethod: "POST", body: '{"email":"a@b.co"}' })).statusCode, 502);
});

test("submission-created forwards completed=true", async () => {
  const calls = mockFetch();
  const body = JSON.stringify({ payload: { form_name: "inquiry", data: { email: "a@b.co", first_name: "Al" } } });
  assert.strictEqual((await submission({ body })).statusCode, 200);
  const sent = JSON.parse(calls[0].opts.body);
  assert.deepStrictEqual([sent.completed, sent.source], [true, "netlify_form"]);
});
