#!/usr/bin/env node
// Drift check: fails if the form page no longer has the hooks lead-capture-snippet.html relies on.
// Run in the form repo's CI:   node check-form-hooks.mjs path/to/index.html [path/to/form.js]
// Dependency-free (regex based) so it works in any CI. For a real browser test see snippet-smoke.js.
import { readFileSync, existsSync } from "node:fs";

const [htmlPath, jsPath] = process.argv.slice(2);
if (!htmlPath) { console.error("usage: check-form-hooks.mjs <form.html> [form.js]"); process.exit(2); }

const html = readFileSync(htmlPath, "utf8");
const js = jsPath && existsSync(jsPath) ? readFileSync(jsPath, "utf8") : "";
const problems = [];
const check = (ok, msg) => { if (!ok) problems.push(msg); };

check(/id=["']email["']|type=["']email["']|name=["']email["']/.test(html), "no email input (#email, type=email or name=email)");
check((html.match(/class=["'][^"']*\bstep\b[^"']*["']/g) || []).length >= 2, "fewer than 2 .step containers");
check(/id=["']successScreen["']|class=["'][^"']*\bsuccess-screen\b/.test(html), "no success screen (#successScreen / .success-screen)");
check(/\/\.netlify\/functions\/lead-capture/.test(html), "lead-capture snippet is not on the page (endpoint string missing)");

if (js) {
  check(/classList\.(toggle|add)\(\s*['"]active['"]/.test(js), "form.js no longer sets the 'active' class on steps");
  check(/successScreen[\s\S]{0,200}classList\.add\(\s*['"]show['"]/.test(js), "form.js no longer adds the 'show' class to the success screen");
}

if (problems.length) {
  console.error("Lead-capture hooks BROKEN. Update lead-capture-snippet.html (CFG block) or restore the markup:");
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log("Lead-capture hooks OK");
