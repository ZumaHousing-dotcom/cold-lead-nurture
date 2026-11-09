# Go-live checklist

Tick in order. **Owner** says who has to do it.

## Already done
- [x] Supabase project "Cold Leads Nurture": table, `webhook` and `abandon-job` functions deployed, `/health` OK (done)
- [x] Edge Function secrets set in Supabase, including `WEBHOOK_SECRET`
- [x] `LEAD_WEBHOOK_URL` set on the Netlify site `brilliant-gnome-d8f671`
- [x] Code, tests, emails, hand-off package built

## To do
| # | Step | Owner | How |
|---|---|---|---|
| 1 | Merge PR #1 | Jasper | GitHub > Pull requests > #1 > Merge |
| 2 | Schedule the 15-minute job | Jasper | Run the SQL from `supabase/cron.sql` once (SQL editor). Verify: `select * from cron.job;` |
| 3 | Mailchimp merge fields `ROOM`, `STEP`, `SOURCE`, `NUDGELINE` (Text); `FNAME` default "there" | Jasper | README, "One-time Mailchimp setup" |
| 4 | Run the end-to-end test with a test email | Jasper | `scripts/e2e-test.sh` (see its header). All lines must PASS |
| 5 | Check the test lead in Supabase (`leads`) and Mailchimp (tags `form-completed`) | Jasper | `supabase/ops.sql` query 6 |
| 6 | Build Journey A (abandoned, 4 emails) and Journey B (confirmation) | Jasper | HTML in `mailchimp/emails/`; copy in `mailchimp/email-copy.md`; trigger = tag added; Journey A exits on `form-completed` |
| 7 | Add functions + snippet + `WEBHOOK_SECRET` to the form repo, on a preview deploy first | Savi | `docs/DEVELOPER-HANDOFF.md` |
| 8 | Add the consent line next to the email field | Savi / Jasper | wording in `docs/DEVELOPER-HANDOFF.md` section 7 |
| 9 | Test on the preview, then production, with your own email | Jasper + Savi | handoff section 5 |
| 10 | Turn both journeys ON | Jasper | Mailchimp > Customer Journeys |

## After launch (first week)
- Daily: run `supabase/ops.sql` queries **4** and **5**. Query 4 should be 0 (otherwise the cron job isn't running) and query 5 empty.
- Check the Mailchimp journey reports for bounces/unsubscribes.
- Rotate `WEBHOOK_SECRET` if it was ever shared in chat or email (update Supabase secret, Vault, Netlify together).
