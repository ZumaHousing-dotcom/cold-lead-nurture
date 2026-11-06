# Zuma Housing: Mailchimp email copy

**Brand:** Zuma Housing, furnished rooms in Los Angeles, utilities + Wi-Fi included.
**Voice:** friendly, upbeat, Gen Z / young professional. Short sentences, light humour, no pressure.
**Look:** brand purple `#77508f`, Montserrat (Google Font link in the template, falls back to Arial/Helvetica in clients that block web fonts), white card on a soft lilac `#f4eff7` background, rounded purple button.
**Merge tags:** `*|FNAME|*` (set a fallback in Mailchimp: *|FNAME|* → "there"), `*|NUDGELINE|*` (AI-written line). Mailchimp adds the footer and `*|UNSUB|*` link automatically.
**CTA link:** replace `{{FORM_URL}}` with `https://tour.zumahousing.com/` (add UTM params, e.g. `?utm_source=mailchimp&utm_campaign=abandoned-1`).
**Rules we never break:** no prices, dates, discounts or availability claims in copy; the only "fact" claims are *furnished* and *utilities + Wi-Fi included*.

Base HTML shell: `mailchimp/email-template.html` (paste into Mailchimp's *Code your own* editor, swap the body block per email).

---

## Journey A: Abandoned form (trigger: tag `form-abandoned` added)

Exit condition: tag `form-completed` added to the contact (see README).

### A1. Immediately after tag
**Subject:** Your Zuma room search is on pause ⏸️
**Preview:** Pick up right where you left off. It takes about 2 minutes.

> Hey *|FNAME|*! 👋
>
> *|NUDGELINE|*
>
> You were so close to wrapping up your Zuma inquiry. No stress, your spot in the process is saved and it only takes a couple of minutes to finish.
>
> Quick reminder of what you get: a **fully furnished room** in LA, with **utilities and Wi-Fi included**. That means no couch hunting and no "who's setting up the internet?" group chat.
>
> **[ Finish my inquiry ]** → {{FORM_URL}}
>
> Questions? Just hit reply, a real human on the Zuma team will get back to you.
>
> Talk soon,
> The Zuma Team 💜

### A2. +24 hours
**Subject:** Still thinking it over, *|FNAME|*?
**Preview:** Totally fair. Here's what makes Zuma easy.

> Hey *|FNAME|*,
>
> Moving is a lot. We get it. So here's the short version of why people pick Zuma:
>
> 🛋️ **Furnished**: walk in with your suitcase, not a U-Haul
> 💡 **Utilities + Wi-Fi included**: one less thing to split and chase
> 📍 **Real LA locations**, made for students, interns and young professionals
>
> Your inquiry is still waiting. Finish it whenever you're ready and we'll take it from there.
>
> **[ Pick up where I left off ]** → {{FORM_URL}}
>
> Not the right time? No worries at all, we'll be here.
>
> The Zuma Team 💜

### A3. +72 hours
**Subject:** Need a hand finishing up?
**Preview:** Reply to this email and we'll help, no form required.

> Hey *|FNAME|*,
>
> Sometimes a form is just… a lot. If something was confusing, or you have a question about rooms, neighborhoods or how Zuma works, we're happy to help.
>
> You can:
> 1. **Finish the form** (2 minutes) → {{FORM_URL}}
> 2. **Just reply to this email** with your questions and a human will answer
>
> Either way, we've got you.
>
> The Zuma Team 💜

### A4. +7 days (last note)
**Subject:** Last call from us (we promise) 💜
**Preview:** We'll stop nudging, but the door stays open.

> Hey *|FNAME|*,
>
> This is our last nudge, we don't want to be that friend who over-texts. 😅
>
> If finding a furnished room in LA is still on your list, your inquiry is one click from done:
>
> **[ Finish my inquiry ]** → {{FORM_URL}}
>
> And if the timing's just not right, no hard feelings. Come back any time, we'll be here with the Wi-Fi already on.
>
> Wishing you an amazing LA chapter,
> The Zuma Team 💜

---

## Journey B: Completed form confirmation (trigger: tag `form-completed` added)

### B1. Immediately
**Subject:** You're in, *|FNAME|*! Here's what happens next 🎉
**Preview:** We got your inquiry. A Zuma human will be in touch soon.

> Hey *|FNAME|*! 🎉
>
> Thanks for sending over your inquiry, we've got it!
>
> **What happens next**
> 1. Our team reviews your details and what you're looking for
> 2. We'll reach out by email (or text if you opted in) to talk through next steps
> 3. You can reply to this email any time with questions
>
> In the meantime, remember: every Zuma room is **furnished**, with **utilities and Wi-Fi included**. Less stuff to buy, more time to explore LA.
>
> Can't wait to help you find your place. 💜
> The Zuma Team

---

## Suggested opt-in consent line (add under the email field on the form)

> ☐ **Yes, email me about my Zuma inquiry and housing updates.** I can unsubscribe any time. See our [Privacy Policy].

Notes:
- Show it on **page 1 next to the email field**, since that is where we capture the lead. If you can't add a checkbox, use the passive version: *"By entering your email you agree Zuma Housing may email you about your inquiry and housing updates. Unsubscribe any time."*
- For strict consent (and CAN-SPAM/CASL/GDPR-style audiences), only send the capture call when the checkbox is ticked, and set `MAILCHIMP_STATUS_IF_NEW=pending` for double opt-in. Ask your counsel which applies.
- The form already has a separate SMS consent checkbox; keep email and SMS consent separate.
