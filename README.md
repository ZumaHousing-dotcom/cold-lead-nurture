# Zuma Cold Lead Nurture

Emails people who started the Zuma inquiry form but never finished it, and confirms the ones who did.

```
Form page 1 (email entered) ─► Netlify Function lead-capture ─► Python app POST /webhook/lead ─► SQLite ─► Mailchimp (contact + tags + merge fields)
Form completed (success screen) ─► same function, completed=true ─► tag form-completed
Scheduler (every 15 min) ─► started > 60 min ago, not completed ─► Claude writes 1 line ─► NUDGELINE + tag form-abandoned ─► Mailchimp Journey emails
```

## What's in the repo

| Path | Purpose |
|---|---|
| `app/` | FastAPI app (`main.py`), SQLite (`db.py`), Mailchimp client, Claude nudge, scheduler jobs, rate limiter |
| `tests/` | pytest suite (Mailchimp + Claude mocked) |
| `netlify/functions/` | `lead-capture.js`, `submission-created.js` |
| `netlify/lib/`, `netlify/tests/` | shared helper + Node tests (kept out of `functions/` so they aren't deployed) |
| `lead-capture-snippet.html` | front-end snippet for the Netlify form page |
| `mailchimp/email-copy.md`, `email-template.html` | email sequences, subject lines, preview text, branded HTML shell |
| `render.yaml`, `.env.example` | deployment + config |

## How it fits the current form (https://tour.zumahousing.com)

I inspected the live form: it is a 2-step page on Netlify with `firstName`/`email` on step 1 and `roomPreference` on step 2. Two things matter:

1. **It is not a Netlify Form.** It posts completions to an n8n webhook (`WEBHOOK_ZUMA` in `config.js`), so Netlify's `submission-created` event **never fires** for it. The snippet therefore also reports completion itself (it wraps `showSuccess()` in `form.js`). `submission-created.js` is included as requested and works if you ever move to Netlify Forms.
   More reliable alternative: have the n8n workflow that receives the submission add an HTTP Request node calling `POST {PYTHON_APP_URL}/webhook/lead` with the `X-Webhook-Secret` header and `{email, first_name, room_interest: room_preference, completed: true}`. That is server-to-server, so it can't be blocked by ad blockers or closed tabs. If you do this, the snippet's completion hook is just a harmless duplicate.
2. **The form is shared with another brand** (`company=scsh`). The snippet only acts when `company` is `zuma`.

ROOM merge field: page 1 has no room question, so at step 1 it uses the link's `listing_name` (if present); on completion it sends the chosen `roomPreference`.

## Run locally

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env        # fill in values
uvicorn app.main:create_app --factory --reload
```

Tests:
```bash
python -m pytest -q
node --test netlify/tests/functions.test.js
```

Curl test:
```bash
curl -i -X POST http://localhost:8000/webhook/lead \
  -H "Content-Type: application/json" -H "X-Webhook-Secret: $WEBHOOK_SECRET" \
  -d '{"email":"test@example.com","first_name":"Sam","room_interest":"Private Room","step":1}'
```
Expect `{"ok":true,"status":"started"}`. A wrong secret returns 401. To trigger the abandon job without waiting, set `ABANDON_AFTER_MIN=0` and `SCHEDULER_INTERVAL_MIN=1`.

## Environment variables

| Var | Where | Notes |
|---|---|---|
| `MAILCHIMP_API_KEY` | Python | includes datacenter suffix, e.g. `...-us21` |
| `MAILCHIMP_LIST_ID` | Python | Audience ID |
| `MAILCHIMP_STATUS_IF_NEW` | Python | `subscribed` (default) or `pending` (double opt-in) |
| `WEBHOOK_SECRET` | Python **and** Netlify | long random string; app refuses to start without it |
| `ANTHROPIC_API_KEY` | Python | without it the safe fallback line is used |
| `CLAUDE_MODEL` | Python | default `claude-sonnet-5-5` |
| `ABANDON_AFTER_MIN` | Python | default 60 |
| `SCHEDULER_INTERVAL_MIN` / `RATE_LIMIT_PER_MIN` | Python | defaults 15 / 60 |
| `DB_PATH` | Python | default `./data/leads.db`; `/var/data/leads.db` on Render |
| `PYTHON_APP_URL` | Netlify | e.g. `https://zuma-cold-lead-nurture.onrender.com` |
| `FORM_NAME` | Netlify (optional) | only forward this Netlify Form from `submission-created` |

## One-time Mailchimp setup

1. **Merge fields** (Audience → Settings → Audience fields and *|MERGE|* tags), all type *Text*: `ROOM`, `STEP`, `SOURCE`, `NUDGELINE`. (`FNAME` exists by default; set its default merge value to "there".) NUDGELINE needs a max length of at least 240 if you set one.
2. **Journey A, abandoned:** Customer Journeys → Create → starting point **Tag added** = `form-abandoned`. Emails: A1 immediately, A2 +24h, A3 +72h, A4 +7 days (copy in `mailchimp/email-copy.md`). Add exit criteria so the journey ends when the tag `form-completed` is added. (In Mailchimp: *Exit* / "Contacts leave the journey when… Tag added: form-completed".) Turn on "Allow contacts to enter again" = off.
3. **Journey B, confirmation:** starting point **Tag added** = `form-completed`, one email (B1).
4. Verify your sender domain (SPF/DKIM) so these land in inboxes.
5. Tags are created automatically the first time the app applies them. Test with your own address first.

Notes: existing unsubscribed/cleaned contacts stay that way (the app only sets status for *new* contacts). Mailchimp journeys only email contacts that are subscribed.

## Deploy

**Python app on Render** (an always-on instance is required: the scheduler runs in-process, and the free tier sleeps and has no disk):
1. Push this repo to GitHub, then in Render choose *New → Blueprint* and select it (`render.yaml` configures the service, health check and a 1 GB disk at `/var/data`).
2. Fill the `sync: false` secrets (`MAILCHIMP_API_KEY`, `MAILCHIMP_LIST_ID`, `ANTHROPIC_API_KEY`). Copy the generated `WEBHOOK_SECRET`.
3. Keep it at **one instance** (the in-process scheduler and rate limiter assume that).
4. Check `https://<service>.onrender.com/health`.

**Netlify (the form site that serves tour.zumahousing.com):**
1. Copy `netlify/functions/` and `netlify/lib/` into that site's repo and merge `netlify.toml`.
2. Site settings → Environment variables: `PYTHON_APP_URL`, `WEBHOOK_SECRET`.
3. Paste `lead-capture-snippet.html` into the form page **right after** `<script src="form.js"></script>`. Redeploy.
4. Open the form, type an email, tab out: you should see a row in the app's DB / contact in Mailchimp with tag `form-started`.

**Consent:** add the opt-in line from `mailchimp/email-copy.md` next to the email field.

## Adding a second lead source later (e.g. AppFolio)

`POST /webhook/lead` already takes an optional `source` (default `netlify_form`; any `[a-z0-9_]{1,40}`). Anything that can call an HTTP endpoint (Zapier, n8n, an AppFolio email-parser) can post `{"email": ..., "first_name": ..., "source": "appfolio", "completed": false}` with the `X-Webhook-Secret` header. The source is stored in SQLite and written to the Mailchimp `SOURCE` field, so you can segment or branch journeys by source. Completion logic is source-independent. Give each external system its own secret if you need to revoke one independently (small change in `main.py`: a mapping of secret → allowed source).

## Production notes

- **Storage:** SQLite on a persistent disk is fine for this volume. If you scale beyond one instance, move to Postgres and run the scheduler in exactly one process.
- **Retries:** if Mailchimp is down, the lead is still saved; each scheduler run retries unsynced leads, and failed abandon tagging is retried next run (the generated line is stored and reused).
- **Logging:** standard Python logging to stdout (Render captures it). Emails are not logged. Add `--log-level info` to uvicorn.
- **Rate limiting:** in-memory, per client IP, `RATE_LIMIT_PER_MIN` (default 60). Netlify functions share IPs, so keep it generous; for multi-instance use Redis or an edge limiter.
- **Secrets:** only in env vars; `.env` is git-ignored. Rotate `WEBHOOK_SECRET` on both sides together.
- **AI line safety:** one sentence, ≤25 words, rejected (fallback used) if it has emojis, `$`/`%`, or numbers not from the lead's own room text.
- **Privacy:** the DB stores email, first name, room interest. Delete rows on request.
