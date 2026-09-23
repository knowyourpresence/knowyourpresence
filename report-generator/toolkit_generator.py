"""
toolkit_generator.py

Generates a ZIP file of individual, ready-to-use toolkit files that are
emailed alongside the main PDF report. Each file is named clearly, uses
plain text or CSV so it opens in any app, and is pre-filled with the
customer's real business name, city, and scan data.

Contents of the ZIP:
  01_WhatsApp_Link.txt              - tap-to-chat link + instructions
  02_Auto_Reply_Messages.txt        - WhatsApp / Instagram / Facebook away messages
  03_Google_Business_Posts.txt      - 5 ready-to-publish GBP posts
  04_Hashtags.txt                   - 20 city + industry hashtags, one per line
  05_Review_Request_Sequence.txt    - 3-touch sequence (Day 0 / Day 3 / Day 7)
  06_Content_Calendar.csv           - 4-week content calendar, opens in Excel/Sheets
  07_Objection_Responses.txt        - tactful replies to common pushbacks
  08_GBP_About_Description.txt      - complete Google Business Profile description
  09_Email_Subject_Lines.txt        - 5 email subject lines for customer outreach
  10_Complaint_Response.txt         - professional complaint-defuse message
  README.txt                        - what's in the pack and how to use each file
"""

import os
import zipfile
import json
import sys
from datetime import datetime


def _wa_link(wa_number):
    """Returns a wa.me deep link or None if no number provided."""
    if not wa_number:
        return None
    digits = "".join(c for c in wa_number if c.isdigit())
    return f"https://wa.me/{digits}" if digits else None


def generate_toolkit_zip(data, zip_path):
    """
    Builds the toolkit ZIP from the same input JSON used for the PDF.

    :param data: dict - same structure as the PDF generator's input
    :param zip_path: str - full path to write the .zip file
    """
    biz = data.get("businessName", "Your Business")
    city = data.get("city", "")
    btype = data.get("businessType", "service")
    wa_number = data.get("waNumber", "")
    scan = data.get("scanDetails") or {}
    g = scan.get("google") or {}
    rating = g.get("rating")
    review_count = g.get("reviewCount")

    # Pull the same content templates the PDF uses
    # Import here rather than at module level so this file is usable
    # standalone without the full report-generator environment.
    from business_content import get_content
    content = get_content(btype, business_name=biz, description="", city=city)

    # Hashtags: city-specific first, then industry, then generic
    hashtags = []
    if city:
        ct = city.lower().replace(" ", "")
        hashtags += [ct, f"{ct}{btype}", f"{btype}{ct}", f"{ct}business",
                     f"{ct}local", f"visit{ct}"]
    hashtags += list(content.get("hashtag_base", []))[:10]
    hashtags += ["local", "smallbusiness", "supportlocal", "shopsmall"]
    hashtags = hashtags[:20]

    # GBP posts - swap Post 1 for a data-driven one if we have real numbers
    gbp_posts = list(content.get("gbp_posts", []))
    if isinstance(rating, (int, float)) and rating > 0 and isinstance(review_count, (int, float)):
        gbp_posts[0] = (
            f"We're proud to be rated {rating:.1f} stars across "
            f"{int(review_count)} reviews - thank you to everyone who's shared "
            f"their experience at {biz}!"
        )

    wa_link = _wa_link(wa_number)
    files = {}

    # ------------------------------------------------------------------
    # 01 - WhatsApp Link
    # ------------------------------------------------------------------
    if wa_link:
        files["01_WhatsApp_Link.txt"] = f"""\
YOUR WHATSAPP LINK
==================
Business: {biz}

Tap-to-chat link:
{wa_link}

HOW TO USE THIS
---------------
• Add it to your Instagram or Facebook bio ("Chat with us on WhatsApp")
• Print it as plain text on your counter card or receipt
• Use the QR code from your full report to make it scannable
• Share it in your email signature: "Quick question? WhatsApp us: {wa_link}"

This link opens a WhatsApp conversation directly with your number.
No need for the customer to save your contact first.
"""
    else:
        files["01_WhatsApp_Link.txt"] = f"""\
YOUR WHATSAPP LINK
==================
You didn't provide a WhatsApp number, so this file is a placeholder.

To generate your link:
1. Visit https://wa.me/<your number without spaces or +>
   e.g. if your number is +1 555 123 4567, the link is: https://wa.me/15551234567
2. Add it to your Instagram bio, Facebook profile, and email signature.
"""

    # ------------------------------------------------------------------
    # 02 - Auto-Reply Messages
    # ------------------------------------------------------------------
    auto = content.get("auto_reply", {})
    files["02_Auto_Reply_Messages.txt"] = f"""\
AUTO-REPLY MESSAGES FOR {biz.upper()}
{"=" * (len(biz) + 24)}

These are ready to paste. Swap in your actual name where it says [Your name].

────────────────────────────────────────
WHATSAPP AWAY MESSAGE
(Settings → Business Tools → Away Message)
────────────────────────────────────────
{auto.get("whatsapp", f"Hey! Thanks for messaging {biz}. We're away right now but will reply as soon as we're back - usually within a few hours.")}

────────────────────────────────────────
INSTAGRAM QUICK REPLY
(Professional Dashboard → Saved Replies)
────────────────────────────────────────
{auto.get("instagram", f"Hi! Thanks for reaching out to {biz}. We read every DM and will get back to you soon.")}

────────────────────────────────────────
FACEBOOK INSTANT REPLY
(Page Settings → Messaging → Instant Reply)
────────────────────────────────────────
{auto.get("facebook", f"Thanks for messaging {biz}! We typically reply within a day.")}

TIP: Set your away hours so WhatsApp only sends the auto-reply
when you're genuinely unavailable - not during open hours.
"""

    # ------------------------------------------------------------------
    # 03 - Google Business Posts
    # ------------------------------------------------------------------
    posts_text = "\n\n".join(
        f"POST {i+1}\n{'-' * 40}\n{post.format(biz=biz)}"
        for i, post in enumerate(gbp_posts)
    )
    files["03_Google_Business_Posts.txt"] = f"""\
5 GOOGLE BUSINESS POSTS FOR {biz.upper()}
{"=" * (len(biz) + 29)}

Copy any of these into your Google Business Profile → Add Update.
Aim to post at least once a week - fresh posts improve local ranking.

{posts_text}

TIP: Add a real photo with each post. Posts with photos get
significantly more engagement than text-only ones.
"""

    # ------------------------------------------------------------------
    # 04 - Hashtags
    # ------------------------------------------------------------------
    tag_list = "\n".join(f"#{tag}" for tag in hashtags)
    files["04_Hashtags.txt"] = f"""\
20 HASHTAGS FOR {biz.upper()}
{"=" * (len(biz) + 16)}
City: {city or "N/A"}
Industry: {btype.title()}

Copy the block below and paste into your Instagram or Facebook caption.

─── COPY FROM HERE ───────────────────────────────────────────────────
{" ".join(f"#{t}" for t in hashtags)}
─── TO HERE ──────────────────────────────────────────────────────────

Individual tags (one per line, for scheduling tools like Buffer/Later):
{tag_list}

TIP: Instagram caps hashtag benefit at around 10-15 per post. Use
the first 10 city-specific ones and pick 3-5 from the rest.
"""

    # ------------------------------------------------------------------
    # 05 - Review Request Sequence
    # ------------------------------------------------------------------
    review_link = f"[Your Google review link - find it in Google Business Profile → Get more reviews]"
    files["05_Review_Request_Sequence.txt"] = f"""\
3-TOUCH REVIEW REQUEST SEQUENCE FOR {biz.upper()}
{"=" * (len(biz) + 37)}

Send these in order. Most reviews come from the first or third message.

────────────────────────────────────────
DAY 0 - RIGHT AFTER THEIR VISIT (WhatsApp)
────────────────────────────────────────
"Hi [First name]! Thank you so much for visiting {biz} today.
If you have 30 seconds, an honest review means the world to us:
{review_link}
No pressure at all - thanks either way! 😊"

────────────────────────────────────────
DAY 3 - GENTLE FOLLOW-UP (Email)
────────────────────────────────────────
Subject: Did you enjoy your visit to {biz}?

"Hi [First name],

We hope you enjoyed your experience at {biz}.

If you haven't already, we'd really appreciate a quick review -
it helps other customers find us and helps us keep improving:
{review_link}

Thanks so much,
[Your name] at {biz}"

────────────────────────────────────────
DAY 7 - FINAL NUDGE (SMS)
────────────────────────────────────────
"Last note from {biz} - if you have a moment, a short review
helps us so much: {review_link}
Thank you either way! - [Your name]"

WHY THIS WORKS: A single ask catches maybe 1 in 10 customers.
A 3-touch sequence reaches people at different moments when
they actually have a free minute, without feeling like spam.
"""

    # ------------------------------------------------------------------
    # 06 - Content Calendar (CSV - opens in Excel/Sheets)
    # ------------------------------------------------------------------
    cal_rows = content.get("calendar", [])
    csv_lines = ["Week,Day,Post Idea"]
    for row in cal_rows:
        week, day, idea = row[0], row[1], row[2]
        safe_idea = f'"{idea}"' if "," in idea else idea
        csv_lines.append(f"{week},{day},{safe_idea}")
    files["06_Content_Calendar.csv"] = "\n".join(csv_lines)

    # ------------------------------------------------------------------
    # 07 - Objection Responses
    # ------------------------------------------------------------------
    files["07_Objection_Responses.txt"] = f"""\
OBJECTION RESPONSES FOR {biz.upper()}
{"=" * (len(biz) + 24)}

Ready-to-send replies to the most common pushbacks.
Edit the [brackets] to fit your situation.

────────────────────────────────────────
"YOUR PRICES ARE TOO HIGH"
────────────────────────────────────────
"Thanks for your feedback - I understand pricing is always a
consideration. At {biz}, what we charge reflects [the quality
of our ingredients / the expertise of our team / the time we put
into each order]. We do offer [mention any value-add: loyalty
program / bundle deal / etc.]. Happy to help you find the best
option for your budget."

────────────────────────────────────────
"I SAW A BETTER REVIEW ELSEWHERE"
────────────────────────────────────────
"Thank you for flagging that. We take every piece of feedback
seriously. If you had an experience that wasn't what you expected,
we'd love the chance to make it right - please reach out directly
at [your contact] and we'll sort it out."

────────────────────────────────────────
"DO YOU DO [THING YOU DON'T DO]?"
────────────────────────────────────────
"That's not something we currently offer, but what we do
specialise in is [your core offer]. That said, I'd recommend
[a genuine referral if you have one] for what you're looking for.
We'd love to help with [your service] when the time is right."

TIP: The goal of every objection response is to keep the
conversation open, not to win an argument.
"""

    # ------------------------------------------------------------------
    # 08 - GBP About Description
    # ------------------------------------------------------------------
    about = content.get("about_description", "")
    if not about:
        about = (
            f"{biz} is a locally owned {btype.replace('_', ' ')} "
            f"{'in ' + city if city else ''} committed to serving our community. "
            f"We take pride in [what makes you different]. "
            f"Visit us [hours/days] or contact us to learn more."
        )
    files["08_GBP_About_Description.txt"] = f"""\
GOOGLE BUSINESS PROFILE "ABOUT" DESCRIPTION
============================================
Business: {biz}

Copy the text below into:
Google Business Profile → Edit profile → Business description

─── COPY FROM HERE ───────────────────────────────────────────────────
{about.format(biz=biz, city=city)}
─── TO HERE ──────────────────────────────────────────────────────────

TIPS:
• Google limits descriptions to 750 characters - this is already
  within that limit.
• Don't include URLs or promotional offers (Google will reject it).
• Include your city naturally for local SEO benefit.
• Update it any time your business changes significantly.
"""

    # ------------------------------------------------------------------
    # 09 - Email Subject Lines
    # ------------------------------------------------------------------
    files["09_Email_Subject_Lines.txt"] = f"""\
EMAIL SUBJECT LINES FOR {biz.upper()}
{"=" * (len(biz) + 24)}

5 subject lines proven to get opened. Use for newsletters,
promotions, or customer re-engagement emails.

1. "We saved something for you, [First name]"
   (Works well for: special offers, loyalty rewards)

2. "Quick question about your last visit to {biz}"
   (Works well for: review requests, feedback)

3. "This week at {biz}{' in ' + city if city else ''} →"
   (Works well for: weekly updates, new menu items, events)

4. "[First name], you haven't visited in a while..."
   (Works well for: win-back campaigns after 30+ days of no visit)

5. "One thing we changed based on your feedback"
   (Works well for: showing customers you listen - very high open rate)

TIP: Always include the customer's first name in the subject
or opening line. Personalised emails get 26% higher open rates.
"""

    # ------------------------------------------------------------------
    # 10 - Complaint Response
    # ------------------------------------------------------------------
    files["10_Complaint_Response.txt"] = f"""\
COMPLAINT RESPONSE TEMPLATE FOR {biz.upper()}
{"=" * (len(biz) + 32)}

A professional, de-escalating response to a frustrated customer.
Edit the [brackets] before sending.

────────────────────────────────────────
FOR A NEGATIVE ONLINE REVIEW
(Google, Yelp, Facebook)
────────────────────────────────────────
"Hi [Name / 'there' if anonymous],

Thank you for taking the time to share your experience - I'm sorry
to hear it didn't meet your expectations.

[One sentence acknowledging the specific issue without being
defensive - e.g. 'Waiting 20 minutes is not the experience we
aim to deliver.']

We'd really like the chance to make this right. Please reach
out to us directly at [email or phone] and ask for [your name /
the manager] - we'll take care of you.

Thank you,
[Your name]
{biz}"

────────────────────────────────────────
FOR A DIRECT COMPLAINT (WhatsApp / Email)
────────────────────────────────────────
"Hi [Name],

Thank you for letting us know - I'm really sorry to hear about
your experience.

[Acknowledge the specific issue: 'That's not the standard we hold
ourselves to.']

I'd like to personally make sure this is resolved for you.
[Specific offer: 'I'd like to offer you X' or 'Can we arrange
for you to come back on us?']

Please reply here or call us at [number] and I'll handle it
personally.

[Your name]
{biz}"

IMPORTANT: Never get defensive in a public reply. Keep it
brief, acknowledge, take it offline. Observers are watching
how you handle it, not just the complaining customer.
"""

    # ------------------------------------------------------------------
    # README
    # ------------------------------------------------------------------
    files["README.txt"] = f"""\
KNOW YOUR PRESENCE — TOOLKIT PACK
===================================
Business: {biz}
City:     {city or "N/A"}
Report:   {data.get("reportId", "KYP")}
Date:     {data.get("reportDate", datetime.now().strftime("%d %B %Y"))}

WHAT'S IN THIS FOLDER
---------------------
01_WhatsApp_Link.txt          Your tap-to-chat link + where to use it
02_Auto_Reply_Messages.txt    Ready-to-paste away messages (WhatsApp, Instagram, Facebook)
03_Google_Business_Posts.txt  5 posts ready to copy into your GBP profile
04_Hashtags.txt               20 city + industry hashtags for social posts
05_Review_Request_Sequence.txt 3-touch sequence to turn happy customers into reviews
06_Content_Calendar.csv       4-week social content calendar (open in Excel / Google Sheets)
07_Objection_Responses.txt    Tactful replies to common customer pushbacks
08_GBP_About_Description.txt  Complete Google Business Profile description, ready to paste
09_Email_Subject_Lines.txt    5 subject lines proven to get opened
10_Complaint_Response.txt     Professional complaint-handling templates

HOW TO GET STARTED
------------------
1. Start with file 03 (GBP Posts) — takes 5 minutes and immediately
   improves your Google Business Profile visibility.
2. Set up file 02 (Auto-Reply Messages) on WhatsApp and Instagram —
   a one-time task that runs automatically forever.
3. Send file 05 (Review Requests) to your 5 most recent happy customers
   this week.

Everything in this pack is pre-filled with your business name and city.
Your full 15-page report covers the strategy behind each of these tools.

Questions? support@knowyourpresence.com
"""

    # Write the ZIP
    os.makedirs(os.path.dirname(zip_path), exist_ok=True)
    zip_name = f"KYP_Toolkit_{biz.replace(' ', '_')}"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for filename, content_str in files.items():
            zf.writestr(f"{zip_name}/{filename}", content_str)

    return zip_path, list(files.keys())


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python3 toolkit_generator.py <input.json> <output.zip>")
        sys.exit(1)
    with open(sys.argv[1]) as f:
        input_data = json.load(f)
    path, files = generate_toolkit_zip(input_data, sys.argv[2])
    print(f"Toolkit ZIP written to {path}")
    print(f"Contents: {len(files)} files")
    for fn in files:
        print(f"  {fn}")
