#!/usr/bin/env python3
"""Builds the five Zuma emails as paste-ready Mailchimp HTML into mailchimp/emails/.

    python3 mailchimp/build_emails.py

The copy lives here (single source of truth for the HTML); mailchimp/email-copy.md is the readable version.
Merge tags: *|FNAME|* (set its default to "there" in Mailchimp), *|NUDGELINE|* (AI line, abandoned emails only).
"""
import html, os

FORM_URL = "https://tour.zumahousing.com/"
PURPLE, LILAC, INK, MUTED = "#77508f", "#f4eff7", "#2d2433", "#6b5a78"

def utm(campaign):
    return f"{FORM_URL}?utm_source=mailchimp&utm_medium=email&utm_campaign={campaign}"

EMAILS = [
    dict(file="A1-abandoned-immediately", campaign="abandoned-1",
         subject="Your Zuma room search is on pause ⏸️",
         preview="Pick up right where you left off. It takes about 2 minutes.",
         greeting="Hey *|FNAME|*! \U0001F44B", nudge=True,
         paras=["You were so close to wrapping up your Zuma inquiry. No stress, it only takes a couple of minutes to finish.",
                "Quick reminder of what you get: a <strong>fully furnished room</strong> in LA, with <strong>utilities and Wi-Fi included</strong>. No couch hunting, and no “who’s setting up the internet?” group chat."],
         cta="Finish my inquiry",
         after=["Questions? Just hit reply, a real human on the Zuma team will get back to you."],
         sign="Talk soon,"),
    dict(file="A2-abandoned-24h", campaign="abandoned-2",
         subject="Still thinking it over, *|FNAME|*?",
         preview="Totally fair. Here’s what makes Zuma easy.",
         greeting="Hey *|FNAME|*,", nudge=False,
         paras=["Moving is a lot. We get it. So here’s the short version of why people pick Zuma:"],
         bullets=["\U0001F6CB️ <strong>Furnished:</strong> walk in with your suitcase, not a U-Haul",
                  "\U0001F4A1 <strong>Utilities + Wi-Fi included:</strong> one less thing to split and chase",
                  "\U0001F4CD <strong>Real LA locations</strong>, made for students, interns and young professionals"],
         paras2=["Your inquiry is still waiting. Finish it whenever you’re ready and we’ll take it from there."],
         cta="Pick up where I left off",
         after=["Not the right time? No worries at all, we’ll be here."], sign=""),
    dict(file="A3-abandoned-72h", campaign="abandoned-3",
         subject="Need a hand finishing up?",
         preview="Reply to this email and we’ll help, no form required.",
         greeting="Hey *|FNAME|*,", nudge=False,
         paras=["Sometimes a form is just… a lot. If something was confusing, or you have a question about rooms, neighborhoods or how Zuma works, we’re happy to help.",
                "You can:"],
         bullets=["<strong>Finish the form</strong> (about 2 minutes), using the button below",
                  "<strong>Just reply to this email</strong> with your questions and a human will answer"],
         cta="Finish my inquiry",
         after=["Either way, we’ve got you."], sign=""),
    dict(file="A4-abandoned-7d", campaign="abandoned-4",
         subject="Last call from us (we promise) \U0001F49C",
         preview="We’ll stop nudging, but the door stays open.",
         greeting="Hey *|FNAME|*,", nudge=False,
         paras=["This is our last nudge, we don’t want to be that friend who over-texts. \U0001F605",
                "If finding a furnished room in LA is still on your list, your inquiry is one click from done:"],
         cta="Finish my inquiry",
         after=["And if the timing’s just not right, no hard feelings. Come back any time, we’ll be here with the Wi-Fi already on.",
                "Wishing you an amazing LA chapter,"], sign=""),
    dict(file="B1-completed-confirmation", campaign="completed-1",
         subject="You’re in, *|FNAME|*! Here’s what happens next \U0001F389",
         preview="We got your inquiry. A Zuma human will be in touch soon.",
         greeting="Hey *|FNAME|*! \U0001F389", nudge=False,
         paras=["Thanks for sending over your inquiry, we’ve got it!", "<strong>What happens next</strong>"],
         bullets=["1. Our team reviews your details and what you’re looking for",
                  "2. We’ll reach out by email (or text if you opted in) to talk through next steps",
                  "3. You can reply to this email any time with questions"],
         paras2=["In the meantime, remember: every Zuma room is <strong>furnished</strong>, with <strong>utilities and Wi-Fi included</strong>. Less stuff to buy, more time to explore LA."],
         cta=None, after=["Can’t wait to help you find your place."], sign="\U0001F49C"),
]

def p(text, extra=""):
    return f'<p style="margin:0 0 16px;{extra}">{text}</p>'

def render(e):
    body = [f'<p style="margin:0 0 16px;font-size:20px;font-weight:700;color:{INK};">{e["greeting"]}</p>']
    if e.get("nudge"):
        body.append(p("*|NUDGELINE|*"))
    body += [p(t) for t in e["paras"]]
    if e.get("bullets"):
        body += ['<div style="margin:0 0 16px;">'] + [f'<p style="margin:0 0 8px;">{b}</p>' for b in e["bullets"]] + ["</div>"]
    body += [p(t) for t in e.get("paras2", [])]
    if e["cta"]:
        body.append(f'<p style="margin:8px 0 24px;"><a href="{utm(e["campaign"])}" style="display:inline-block;background:{PURPLE};'
                    f'color:#ffffff;text-decoration:none;font-weight:700;padding:14px 28px;border-radius:999px;">{e["cta"]}</a></p>')
    body += [p(t) for t in e["after"]]
    sign = e["sign"].strip()
    lead = f"{sign}<br>" if sign and sign != "\U0001F49C" else ""
    body.append(f'<p style="margin:0;">{lead}The Zuma Team \U0001F49C</p>')
    subject = e["subject"]
    return f"""<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>{html.escape(subject, quote=False)}</title>
<!-- SUBJECT:  {subject}
     PREVIEW:  {e["preview"]} -->
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:{LILAC};font-family:'Montserrat',Arial,Helvetica,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">{e["preview"]}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{LILAC};"><tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;">
    <tr><td style="background:{PURPLE};padding:24px 32px;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:.5px;">Zuma Housing</td></tr>
    <tr><td style="padding:32px;color:{INK};font-size:16px;line-height:1.6;">
      {chr(10).join("      " + b if i else b for i, b in enumerate(body))}
    </td></tr>
    <tr><td style="background:{LILAC};padding:20px 32px;color:{MUTED};font-size:12px;line-height:1.5;">*|LIST:ADDRESS|*<br><a href="*|UNSUB|*" style="color:{PURPLE};">Unsubscribe</a></td></tr>
  </table>
</td></tr></table>
</body></html>
"""

if __name__ == "__main__":
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "emails")
    os.makedirs(out, exist_ok=True)
    for e in EMAILS:
        path = os.path.join(out, e["file"] + ".html")
        with open(path, "w", encoding="utf-8") as f:
            f.write(render(e))
        print("wrote", os.path.relpath(path))
