# Zuma Cold Lead Nurture

Emails people who started the Zuma inquiry form but never finished it, and confirms the ones who did.
Runs entirely on **Supabase** (Edge Functions + Postgres + pg_cron), **Netlify** (the form page + one proxy function) and **Mailchimp** (contacts and emails). Code lives in **GitHub**, which deploys it.

```
Form page 1 (email entered)        ─► Netlify Function lead-capture ─► Supabase Edge Function `webhook` ─► Postgres `leads` ─► Mailchimp (contact + tags + merge fields)
Form success screen (completed)    ─► same path, completed=true                                                            ─► tag form-completed
pg_cron every 15 min ─► Edge Function `abandon-job` ─► leads started >60 min ago, not completed ─► Claude writes 1 line ─► NUDGELINE + tag form-abandoned ─► Mailchimp Journey emails
```

Why a Netlify function in the middle? The webhook secret must never reach the browser, so the browser calls a same-origin Netlify function, which adds the secret server-side.

## Repo layout

| Path | Purpose |
|---|---|
| `supabase/migrations/` | `leads` table + SQL functions (`upsert_lead` enforces "completed never goes back to started") |
| `supabase/functions/webhook/` | `POST /webhook` (lead intake), `GET /webhook/health` |
| `supabase/functions/abandon-job/` | the scheduled abandon job |
| `supabase/functions/_shared/` | Mailchimp client, Claude nudge, job logic, validation |
| `supabase/cron.sql` | one-time pg_cron schedule (run by hand, needs your secrets) |
| `supabase/tests/` | Deno tests + SQL tests |
| `netlify/functions/` | `lead-capture.js`, `submission-created.js` |
| `lead-capture-snippet.html` | snippet for the Netlify-hosted form page |
| `mailchimp/` | email copy + branded HTML shell |
| `.github/workflows/` | `ci.yml` (tests), `deploy-supabase.yml` (deploy on merge to `main`) |

## How it fits the current form (https://tour.zumahousing.com)

I inspected the live form: a 2-step page on Netlify with `firstName`/`email` on step 1 and `roomPreference` on step 2.

1. **It is not a Netlify Form.** It posts completions to an n8n webhook, so Netlify's `submission-created` event never fires for it. The snippet therefore also reports completion itself (it detects the success screen appearing; see "Keeping the snippet working"). `submission-created.js` is included and works if you ever move to Netlify Forms.
   More reliable alternative: have the n8n workflow that receives the submission call the webhook directly (HTTP Request node, `POST {LEAD_WEBHOOK_URL}`, header `X-Webhook-Secret`, body `{"email": ..., "first_name": ..., "room_interest": <room_preference>, "completed": true}`). It is server-to-server, so ad blockers and closed tabs can't lose it.
2. **The form is shared with another brand** (`company=scsh`). The snippet only acts when `company` is `zuma`.
3. ROOM: page 1 has no room question, so step 1 uses the link's `listing_name` (if any); on completion it sends the chosen `roomPreference`.

## Tests

```bash
deno test supabase/tests/functions.test.ts                                   # webhook, abandon job, nudge, Mailchimp client (all mocked)
deno check supabase/functions/webhook/index.ts supabase/functions/abandon-job/index.ts
./scripts/test-sql.sh                                                         # SQL logic against a throwaway local Postgres (needs postgres binaries)
node --test netlify/tests/functions.test.js                                   # Netlify functions
```

Covered: valid lead, bad secret, completed lead not downgraded (SQL-level), default source, the abandonment query (SQL-level), Mailchimp/Claude failures and retries.

## Environment variables

**Supabase Edge Function secrets** (`supabase secrets set --env-file .env`, or Dashboard → Edge Functions → Secrets). `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically.

| Var | Notes |
|---|---|
| `MAILCHIMP_API_KEY` | includes datacenter suffix, e.g. `...-us17` |
| `MAILCHIMP_LIST_ID` | Audience ID |
| `MAILCHIMP_STATUS_IF_NEW` | `subscribed` (default) or `pending` (double opt-in) |
| `WEBHOOK_SECRET` | long random string (`openssl rand -hex 32`); required, the functions refuse to start without it |
| `ANTHROPIC_API_KEY` | without it the safe fallback line is used |
| `CLAUDE_MODEL` | default `claude-sonnet-5-5` |
| `ABANDON_AFTER_MIN` | default 60 |
| `RATE_LIMIT_PER_MIN` | default 60 (per client IP, per function instance) |

**Netlify environment variables** (form site): `LEAD_WEBHOOK_URL` (`https://<project-ref>.supabase.co/functions/v1/webhook`), `WEBHOOK_SECRET` (same value), optional `FORM_NAME`.

**GitHub Actions secrets** (for deploys): `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`.

## One-time Mailchimp setup

1. **Merge fields** (Audience → Settings → Audience fields and *|MERGE|* tags), all type *Text*, tags exactly: `ROOM`, `STEP`, `SOURCE`, `NUDGELINE`. Set `FNAME` default to "there".
2. **Journey A, abandoned:** Automations → Customer Journeys → starting point **Tag added** = `form-abandoned`. Emails: A1 immediately, A2 +24h, A3 +72h, A4 +7 days (`mailchimp/email-copy.md`). Exit when tag `form-completed` is added. No re-entry.
3. **Journey B, confirmation:** starting point **Tag added** = `form-completed`, one email (B1).
4. Verify your sender domain (SPF/DKIM).
5. Tags only appear in Mailchimp after the app has applied them once, so run the test below before building the journeys (or type the tag names in).

Existing unsubscribed/cleaned contacts stay that way (the app only sets status for *new* contacts).

## Deploy

**Supabase** (use a new project, or your existing one: the `leads` table has RLS on with no policies, so only the service role can touch it):
1. Install the CLI (`npm i -g supabase` or see supabase.com/docs/guides/cli), then:
   ```bash
   supabase login
   supabase link --project-ref YOUR-PROJECT-REF
   supabase db push                                   # creates the table + functions
   cp .env.example .env   # fill in the Supabase section
   supabase secrets set --env-file .env
   supabase functions deploy webhook --no-verify-jwt
   supabase functions deploy abandon-job --no-verify-jwt
   ```
2. Check `https://YOUR-PROJECT-REF.supabase.co/functions/v1/webhook/health` returns `{"status":"ok"}`.
3. Open `supabase/cron.sql`, replace the two placeholders (project URL, webhook secret) and run it once in the SQL editor. This stores the secrets in Vault and schedules the 15-minute job.

**GitHub** (optional automatic deploys): add the three Actions secrets above; after that every merge to `main` that touches `supabase/` runs `db push` and redeploys both functions. CI runs the tests on every push.

**Netlify** (the site that serves tour.zumahousing.com):
1. Copy `netlify/functions/` and `netlify/lib/` into that site's repo and merge `netlify.toml`.
2. Set `LEAD_WEBHOOK_URL` and `WEBHOOK_SECRET` in Site settings → Environment variables.
3. Paste `lead-capture-snippet.html` anywhere before `</body>` on the form page (order relative to `form.js` no longer matters); redeploy. Do this on a branch/deploy preview first.
4. Add the consent line from `mailchimp/email-copy.md` next to the email field.

## Test it end to end

```bash
curl -i -X POST "$LEAD_WEBHOOK_URL" \
  -H "Content-Type: application/json" -H "X-Webhook-Secret: $WEBHOOK_SECRET" \
  -d '{"email":"you@example.com","first_name":"Sam","room_interest":"Private Room","step":1}'
```
Expect `{"ok":true,"status":"started"}`, a row in Table Editor → `leads`, and the contact in Mailchimp with tag `form-started`. A wrong secret returns 401. To trigger the job without waiting, set `ABANDON_AFTER_MIN=0` temporarily and invoke it:
```bash
curl -X POST "https://YOUR-PROJECT-REF.supabase.co/functions/v1/abandon-job" -H "X-Webhook-Secret: $WEBHOOK_SECRET"
```
Then send `{"..., "completed": true}` for the same email: `form-completed` is added, `form-started`/`form-abandoned` go inactive, and Journey A exits.
Cron history: `select * from cron.job_run_details order by start_time desc limit 10;`

## Keeping the snippet working when the form changes

`lead-capture-snippet.html` (v2) does **not** call or wrap any `form.js` function, so renaming or reworking `nextStep()` / `showSuccess()` cannot break it. It watches the page instead:

| Signal | How it is detected |
|---|---|
| Email entered | `focusout`/`change` on the email field (`#email`, `input[type=email]`, `input[name=email]`) |
| Step advanced | which `.step` container has the `active` class (falls back to the `#currentStep` label) |
| Completed | `#successScreen` / `.success-screen` gets the `show` class |

What can still break it is the page markup itself (e.g. dropping the `active`/`show` classes or the email field). Two guards catch that:
- **Runtime self-check:** if the page no longer matches, the snippet logs `[zuma-lead-capture] ... missing: ...` to the browser console and sets `window.__zumaLeadCapture.ok = false`. Selectors live in one `CFG` block at the top; add the new selector there.
- **CI drift check** (copy `scripts/check-form-hooks.mjs` into the form repo): `node check-form-hooks.mjs index.html form.js` fails the build if the email field, step containers, success screen, snippet, or the `active`/`show` class logic disappear.
- **Browser smoke test:** `node scripts/snippet-smoke.js path/to/index.html` (needs Playwright) loads the page, simulates the three signals and asserts the calls, the de-duplication and the brand guard.

Code can't safely rewrite itself, so this is detection plus a one-line fix, not auto-repair.

## Adding a second lead source later (e.g. AppFolio)

The webhook already takes an optional `source` (default `netlify_form`; any `[a-z0-9_]{1,40}`). Anything that can call an HTTP endpoint (Zapier, n8n, an email parser) can post `{"email": ..., "first_name": ..., "source": "appfolio", "completed": false}` with the `X-Webhook-Secret` header. The first source seen for an email is kept in Postgres and written to Mailchimp's `SOURCE` field, so you can segment or branch journeys by it. Completion logic is source-independent.

## Production notes

- **Storage:** Postgres on Supabase (backups per your plan). RLS is on; only the service role writes.
- **Retries:** if Mailchimp is down the lead is still saved; every abandon-job run first retries unsynced leads, and failed abandon tagging is retried next run (the generated line is stored and reused, so Claude isn't called twice).
- **Logging:** Dashboard → Edge Functions → Logs. Emails are not logged.
- **Rate limiting:** in-memory per Edge Function instance, so it's a basic brake rather than a hard cap. For a hard cap add an edge/WAF rule or a counter table.
- **Secrets:** only in Supabase secrets, Netlify env vars and GitHub secrets; `.env` is git-ignored. Rotate `WEBHOOK_SECRET` in all three places (and in Vault) together.
- **AI line safety:** one sentence, ≤25 words; rejected (fallback used) if it has emojis, `$`/`%`, or numbers not from the lead's own room text.
- **Privacy:** the table stores email, first name, room interest. Delete rows on request.
