# Add lead capture to the Zuma form (tour.zumahousing.com)

**For:** the developer who owns `Zuma-AI-2026/zuma-pq-form`  **Estimated time:** ~30 minutes plus testing
**Nothing in `form.js` changes, and the existing n8n webhook is untouched.**

## What this does
When someone types their email on step 1 (or reaches step 2) but never finishes, we want to email them a short follow-up sequence; people who do finish are simply marked as done so they don't get those emails. A small browser snippet sends the lead to a Netlify function, which forwards it (with a secret the browser never sees) to our Supabase backend. The backend is already deployed and healthy.

```
browser snippet --> /.netlify/functions/lead-capture --> Supabase "webhook" --> Mailchimp
```

## 1. Add the files (from the zip, keep the paths)
| File (in the zip's `files/` folder) | Where it goes in the form repo |
|---|---|
| `netlify/functions/lead-capture.js` | same path |
| `netlify/lib/forward.js` | same path (kept outside `functions/` on purpose so it isn't deployed as an endpoint) |
| `netlify.toml.ADD` | **merge** its lines into the site's existing `netlify.toml` (don't overwrite existing settings; create the file if there isn't one) |
| `lead-capture-snippet.html` | not a file to deploy: copy its `<script>` block into the page (step 3) |
| `scripts/check-form-hooks.mjs` | optional, for CI (step 6) |

The functions have no npm dependencies and use Node 20's built-in `fetch`. `submission-created.js` is **not needed**: this form isn't a Netlify Form (it posts to n8n), so that event never fires.

## 2. Make sure your deploy pipeline ships the functions  (important)
This site is deployed through the Netlify API by your own pipeline, not by Netlify's Git build, and its current deploys contain **no functions**. Functions are only deployed if the pipeline includes them. For example, with the Netlify CLI:
```bash
netlify deploy --prod --dir=. --functions=netlify/functions
```
(or the equivalent in your CI/API call). Please confirm in the deploy summary that "1 function deployed" appears.

## 3. Add the snippet to the form page
Paste the entire `<script>...</script>` block from `lead-capture-snippet.html` into the form page (`index.html`), **just before `</body>`**. Order relative to `form.js` doesn't matter. Don't edit `form.js`.

It watches the page (the `active` class on `.step`, the `show` class on `#successScreen`, the `#email` field) rather than calling any `form.js` function, so renaming functions can't break it. If you ever change that markup, update the `CFG` block at the top of the snippet.

## 4. Netlify environment variables (site `brilliant-gnome-d8f671`)
Site configuration, Environment variables. Scopes: **Functions** and **Runtime**.

| Variable | Value |
|---|---|
| `LEAD_WEBHOOK_URL` | `https://zvutafpwvmriobxyrhnt.supabase.co/functions/v1/webhook` (**already set**) |
| `WEBHOOK_SECRET` | the shared secret. Get it from Jasper **through a secure channel** (password manager or similar; never chat or email). Mark it as a **secret** variable. |

## 5. Test on a branch deploy or deploy preview FIRST, not production
1. Open the preview URL, add `?listing_name=Test%20Room` to it, open DevTools (Network and Console).
2. Type a test email you control (e.g. `you+test@yourdomain.com`) and tab out. Expect one `POST /.netlify/functions/lead-capture` returning **200**.
3. In the console run `window.__zumaLeadCapture`. Expect `{ ok: true, missing: [], sent: 1 }`.
4. Click **Next** (step 2), then complete the form. Expect two more calls: step `2`, then `completed`. Repeating the same action should not send duplicates.
5. Direct function checks:
   - `curl -i -X POST <preview>/.netlify/functions/lead-capture -d '{"email":"nope"}'` returns **400**
   - `curl -i <preview>/.netlify/functions/lead-capture` returns **405**
6. Tell Jasper the test email. They'll confirm the lead arrived in Supabase and Mailchimp.

Other brand: the form is shared with `company=scsh`. The snippet ignores that brand, so check that no call is made when `company` is `scsh`.

## 6. Optional: guard against future breakage (CI)
Add to CI after the build:
```bash
node scripts/check-form-hooks.mjs index.html form.js
```
It fails if the email field, step containers, success screen, snippet, or the `active`/`show` class logic disappear. `scripts/snippet-smoke.js` is a Playwright browser test of the same behaviour (`node scripts/snippet-smoke.js index.html`).

## 7. Consent line (copy change on page 1, next to the email field)
> ☐ **Yes, email me about my Zuma inquiry and housing updates.** I can unsubscribe any time.

(Wording and whether the box is required are for Zuma to confirm with their legal contact.)

## Rollback
Delete the `<script>` block from the page. Capture stops immediately; the function and env vars are harmless when idle.

## Questions
Ask Jasper.
