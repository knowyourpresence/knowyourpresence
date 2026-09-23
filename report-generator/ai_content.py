# ai_content.py
# Fallback content generator for business types that don't fit the 5 static
# buckets in business_content.py. Calls Claude to write toolkit content
# (auto-replies, GBP posts, calendar, hashtags) tailored to whatever the
# business actually is - covers industries we never anticipated, at the
# cost of a small per-report API fee and a few seconds of latency.
#
# Requires ANTHROPIC_API_KEY in the environment.

import os
import json
import urllib.request
import urllib.error

ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
MODEL = "claude-sonnet-4-5"

PROMPT_TEMPLATE = """You are writing marketing toolkit content for a small business called "{biz}", whose owner describes their business as: "{description}"{city_clause}

Write content in the exact JSON shape below - no markdown, no commentary, just the JSON object. Keep the tone warm and professional, appropriate for this specific type of business. Use {{biz}} literally (with curly braces) as a placeholder everywhere the business name should appear, since it gets filled in separately.

{{
  "auto_reply": {{
    "whatsapp": "a WhatsApp away-message, 1-2 sentences",
    "instagram": "an Instagram DM quick-reply, 1-2 sentences",
    "facebook": "a Facebook Messenger instant-reply, 1-2 sentences"
  }},
  "gbp_posts": ["5 short Google Business Profile update posts, each 1-2 sentences, using {{biz}} where relevant"],
  "calendar": [["Week 1", "Mon", "a specific, concrete post idea for this business type"], ["Week 1", "Wed", "..."], ["Week 1", "Fri", "..."], ["Week 2", "Mon", "..."], ["Week 2", "Wed", "..."], ["Week 2", "Fri", "..."], ["Week 3", "Mon", "..."], ["Week 3", "Wed", "..."], ["Week 3", "Fri", "..."], ["Week 4", "Mon", "..."], ["Week 4", "Wed", "..."], ["Week 4", "Fri", "..."]],
  "hashtag_base": ["8 lowercase hashtag words (no # symbol) relevant to this specific industry, not generic business terms"],
  "review_action": "a short phrase completing 'Thank you for ___ {{biz}}' - e.g. 'visiting', 'your appointment at', 'working with' - pick whichever fits this business type"
}}

Respond with ONLY the JSON object, nothing else."""


def _call_claude(prompt, api_key, timeout=30):
    body = json.dumps({
        "model": MODEL,
        "max_tokens": 1500,
        "messages": [{"role": "user", "content": prompt}],
    }).encode("utf-8")

    req = urllib.request.Request(
        ANTHROPIC_API_URL,
        data=body,
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return data["content"][0]["text"]


def generate_ai_content(biz, description, city=""):
    """
    Generates a content dict matching business_content.py's CONTENT[type] shape,
    tailored to an arbitrary business description via Claude.

    Raises RuntimeError if ANTHROPIC_API_KEY isn't set or the API call fails -
    callers should catch this and fall back to the generic 'service' template
    rather than letting report generation fail entirely.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY not set - cannot generate AI fallback content.")

    city_clause = f", located in {city}" if city else ""
    prompt = PROMPT_TEMPLATE.format(biz=biz, description=description or "a local business", city_clause=city_clause)

    try:
        raw_text = _call_claude(prompt, api_key)
    except (urllib.error.URLError, TimeoutError) as e:
        raise RuntimeError(f"AI content generation failed (network/timeout): {e}")

    # Strip potential markdown code fences if the model added them anyway
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("```")[1]
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]
        cleaned = cleaned.strip()

    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"AI returned content that wasn't valid JSON: {e}")

    required_keys = {"auto_reply", "gbp_posts", "calendar", "hashtag_base", "review_action"}
    if not required_keys.issubset(parsed.keys()):
        raise RuntimeError(f"AI response missing required keys: {required_keys - parsed.keys()}")

    # calendar entries need to be tuples to match the static template format
    parsed["calendar"] = [tuple(row) for row in parsed["calendar"]]
    return parsed
