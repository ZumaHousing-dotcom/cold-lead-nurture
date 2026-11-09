// Browser smoke test for lead-capture-snippet.html.
//   node scripts/snippet-smoke.js path/to/form-with-snippet.html
// Needs `playwright` (npx playwright install chromium). All network calls are stubbed.
const { chromium } = require("playwright");
const path = require("path");
const assert = require("assert");
const http = require("http");
const fs = require("fs");

// Serve the page over http (fetch() of a relative path does not work from file://).
function serve(dir) {
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const f = path.join(dir, decodeURIComponent(new URL(req.url, "http://x").pathname));
      if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" });
      res.end(fs.readFileSync(f));
    }).listen(0, () => resolve(srv));
  });
}

(async () => {
  const file = path.resolve(process.argv[2] || "");
  const srv = await serve(path.dirname(file));
  const base = "http://localhost:" + srv.address().port + "/" + path.basename(file);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const calls = [];
  await page.route("**/*", (r) => {
    const u = r.request().url();
    if (u.includes("/.netlify/functions/lead-capture")) {
      calls.push(JSON.parse(r.request().postData()));
      return r.fulfill({ status: 200, body: "{}" });
    }
    if (u.startsWith("http://localhost")) return r.continue();
    return r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.goto(base + "?listing_name=Hollywood%20Room");

  await page.fill("#firstName", "Sam");
  await page.fill("#email", "Sam@Example.com");
  await page.keyboard.press("Tab");                         // 1) email entered
  // 2) step advance, simulated the way the page does it: toggling .active on the step containers
  await page.evaluate(() => document.querySelectorAll(".step").forEach((s, i) => s.classList.toggle("active", i === 1)));
  await page.waitForTimeout(150);
  // 3) success screen shows (twice, to prove de-duplication)
  await page.evaluate(() => document.getElementById("successScreen").classList.add("show"));
  await page.waitForTimeout(150);
  await page.evaluate(() => { const s = document.getElementById("successScreen"); s.classList.remove("show"); s.classList.add("show"); });
  await page.waitForTimeout(150);

  const steps = calls.map((c) => [c.step, c.completed]);
  assert.deepStrictEqual(steps, [["1", false], ["2", false], ["completed", true]], "calls: " + JSON.stringify(calls));
  assert.strictEqual(calls[0].email, "sam@example.com");
  assert.strictEqual(calls[0].room_interest, "Hollywood Room");
  assert.deepStrictEqual(await page.evaluate(() => window.__zumaLeadCapture.ok), true);

  // brand guard: the other brand must not be captured
  const calls2 = calls.length;
  await page.evaluate(() => {
    document.getElementById("company").value = "scsh";
    document.querySelectorAll(".step").forEach((st, i) => st.classList.toggle("active", i === 0)); // back to step 1
    document.getElementById("successScreen").classList.remove("show");
  });
  await page.fill("#email", "other@example.com");
  await page.keyboard.press("Tab");
  await page.waitForTimeout(150);
  assert.strictEqual(calls.length, calls2, "scsh brand must not be captured");

  console.log("snippet smoke test passed:", JSON.stringify(steps));
  await browser.close();
  srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
