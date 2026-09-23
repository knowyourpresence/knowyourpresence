# business_content.py
# Content templates that vary by business type - this is what makes the
# report's toolkit (auto-replies, posts, calendar, hashtags, review sequence)
# genuinely different for a salon vs. a clinic vs. a restaurant, instead of
# reusing the same cafe-flavored content for every business.
#
# Each template string uses {biz} as a placeholder for the business name,
# filled in at report-generation time.

BUSINESS_TYPES = {
    "restaurant": "Restaurant / Cafe",
    "retail": "Retail Store",
    "salon": "Salon / Spa",
    "clinic": "Clinic / Healthcare",
    "service": "Service Business",
}

CONTENT = {
    "restaurant": {
        "auto_reply": {
            "whatsapp": "Hey there! Thanks for messaging {biz}. We're away right now but we'll reply as soon as we're back - usually within a few hours. Talk soon!",
            "instagram": "Hi! Thanks for reaching out to {biz}. We read every DM and will get back to you soon. In the meantime, check our latest posts for updates!",
            "facebook": "Thanks for messaging {biz}! We typically reply within a day. We appreciate you reaching out and can't wait to help.",
        },
        "gbp_posts": [
            "New week, new reasons to visit {biz}! Come see what we've got waiting for you.",
            "Loving the support, {biz} family! Thank you for every visit, review, and recommendation.",
            "Reminder: we're open and ready for you today. Drop by {biz} whenever suits you!",
            "Something new is happening at {biz} - stop in this week to check it out.",
            "Have a question about {biz}? Send us a message - we love hearing from you!",
        ],
        "calendar": [
            ("Week 1", "Mon", "Behind-the-scenes: show your team prepping for the day"),
            ("Week 1", "Wed", "Feature your best-selling dish with a close-up photo"),
            ("Week 1", "Fri", "Repost a customer photo (with permission) and thank them"),
            ("Week 2", "Mon", "Share a quick tip - a pairing suggestion or how a dish is made"),
            ("Week 2", "Wed", "Introduce a team member - name, role, fun fact"),
            ("Week 2", "Fri", "Weekend hours + a friendly \"see you soon\" message"),
            ("Week 3", "Mon", "Behind-the-scenes prep or cooking process video"),
            ("Week 3", "Wed", "Ask a question in your caption to boost comments"),
            ("Week 3", "Fri", "Highlight a review - screenshot + thank you"),
            ("Week 4", "Mon", "Announce anything new (dish, hours, offer)"),
            ("Week 4", "Wed", "Customer story or testimonial feature"),
            ("Week 4", "Fri", "Recap of the month + tease what's coming next"),
        ],
        "hashtag_base": ["cafe", "cafelife", "cafelover", "cafegram", "foodie", "foodstagram", "restaurantlife", "dining"],
        "review_action": "visiting",
    },
    "retail": {
        "auto_reply": {
            "whatsapp": "Hi! Thanks for messaging {biz}. We're away right now but we'll get back to you soon - usually within a few hours. Talk soon!",
            "instagram": "Hi! Thanks for reaching out to {biz}. We read every DM and will reply soon. Check out our latest arrivals while you wait!",
            "facebook": "Thanks for messaging {biz}! We typically reply within a day. We're excited to help you find what you're looking for.",
        },
        "gbp_posts": [
            "New arrivals just landed at {biz}! Come check out what's new this week.",
            "Thank you for shopping with {biz} - your support means everything to our small business.",
            "Reminder: we're open today! Stop by {biz} for something special.",
            "Restocked and ready - your favorites are back in stock at {biz}.",
            "Questions about sizing, availability, or anything else? Message {biz} anytime!",
        ],
        "calendar": [
            ("Week 1", "Mon", "New arrival spotlight - photo + price"),
            ("Week 1", "Wed", "Styling tip or how to use/wear a featured product"),
            ("Week 1", "Fri", "Repost a customer photo using your product"),
            ("Week 2", "Mon", "Behind-the-scenes: unboxing new stock"),
            ("Week 2", "Wed", "Introduce a staff member - name, role, favorite item"),
            ("Week 2", "Fri", "Weekend hours + what's trending in-store"),
            ("Week 3", "Mon", "Customer FAQ answered (sizing, returns, materials)"),
            ("Week 3", "Wed", "Ask a question - \"which color would you pick?\""),
            ("Week 3", "Fri", "Highlight a 5-star review - screenshot + thank you"),
            ("Week 4", "Mon", "Announce a new collection, sale, or restock"),
            ("Week 4", "Wed", "Customer testimonial or before/after feature"),
            ("Week 4", "Fri", "Month recap + a sneak peek of what's coming"),
        ],
        "hashtag_base": ["shoplocal", "smallbusiness", "retailtherapy", "newarrivals", "shopping", "boutique", "instashop", "shopsmall"],
        "review_action": "shopping with",
    },
    "salon": {
        "auto_reply": {
            "whatsapp": "Hi! Thanks for messaging {biz}. We're with a client right now but will reply as soon as we're free - usually within a few hours!",
            "instagram": "Hi! Thanks for reaching out to {biz}. We read every DM and will get back to you soon - check our latest transformations while you wait!",
            "facebook": "Thanks for messaging {biz}! We typically reply within a day. Can't wait to help you look and feel your best.",
        },
        "gbp_posts": [
            "Booking now for this week at {biz} - message us to grab your slot!",
            "Thank you to every client who trusted {biz} this month - you make what we do worthwhile.",
            "Reminder: we're open today! Book your appointment at {biz} whenever suits you.",
            "New service alert at {biz} - ask us about it on your next visit.",
            "Have a question about a treatment? Message {biz} - we're happy to help you decide.",
        ],
        "calendar": [
            ("Week 1", "Mon", "Before/after transformation photo (with permission)"),
            ("Week 1", "Wed", "Feature a signature service with a close-up shot"),
            ("Week 1", "Fri", "Repost a client's photo showing off their look"),
            ("Week 2", "Mon", "Quick tip: at-home care between appointments"),
            ("Week 2", "Wed", "Introduce a stylist/therapist - name, specialty, fun fact"),
            ("Week 2", "Fri", "Weekend booking reminder + availability"),
            ("Week 3", "Mon", "Behind-the-scenes: a treatment or styling process video"),
            ("Week 3", "Wed", "Ask a question - \"what look are you going for next?\""),
            ("Week 3", "Fri", "Highlight a client review - screenshot + thank you"),
            ("Week 4", "Mon", "Announce a new service, product line, or season special"),
            ("Week 4", "Wed", "Client testimonial or long-term transformation feature"),
            ("Week 4", "Fri", "Month recap + tease what's coming next"),
        ],
        "hashtag_base": ["salonlife", "haircare", "beauty", "spa", "transformation", "selfcare", "glowup", "salonlove"],
        "review_action": "your visit to",
    },
    "clinic": {
        "auto_reply": {
            "whatsapp": "Thank you for contacting {biz}. Our team is currently with a patient but will respond within a few hours during clinic hours.",
            "instagram": "Thank you for your message to {biz}. We aim to respond within one business day.",
            "facebook": "Thank you for reaching out to {biz}. A member of our team will respond to your inquiry shortly during business hours.",
        },
        "gbp_posts": [
            "Now accepting new patients at {biz} - book your appointment today.",
            "Thank you to every patient who trusted {biz} with their care this month.",
            "Reminder: {biz} is open today. Reach out to schedule your visit.",
            "New service now available at {biz} - ask our team for details.",
            "Have a health question? Message {biz} and our team will guide you.",
        ],
        "calendar": [
            ("Week 1", "Mon", "A simple health tip relevant to your specialty"),
            ("Week 1", "Wed", "Introduce a doctor/practitioner - name, specialty, experience"),
            ("Week 1", "Fri", "Clinic facility photo - clean, welcoming, professional"),
            ("Week 2", "Mon", "Answer a commonly asked patient question"),
            ("Week 2", "Wed", "Highlight a service or treatment you offer"),
            ("Week 2", "Fri", "Weekend/holiday hours reminder"),
            ("Week 3", "Mon", "A myth vs. fact post relevant to your field"),
            ("Week 3", "Wed", "Behind-the-scenes: your team or a piece of equipment"),
            ("Week 3", "Fri", "Highlight a patient review (with consent) - thank you"),
            ("Week 4", "Mon", "Announce a new service, doctor, or extended hours"),
            ("Week 4", "Wed", "Patient education: preventive care reminder"),
            ("Week 4", "Fri", "Month recap + what's coming next at the clinic"),
        ],
        "hashtag_base": ["healthcare", "wellness", "patientcare", "clinic", "health", "medicalcare", "familyhealth", "healthtips"],
        "review_action": "your visit to",
    },
    "service": {
        "auto_reply": {
            "whatsapp": "Thank you for contacting {biz}. We're currently on a job but will respond within a few hours. Thanks for your patience!",
            "instagram": "Thank you for your message to {biz}. We aim to respond within one business day.",
            "facebook": "Thank you for reaching out to {biz}. A team member will respond to your inquiry shortly during business hours.",
        },
        "gbp_posts": [
            "Booking jobs for this week at {biz} - message us to schedule.",
            "Thank you to every client who trusted {biz} this month - we appreciate you.",
            "Reminder: {biz} is taking bookings today. Reach out anytime.",
            "New service now offered by {biz} - ask us for details.",
            "Have a question about a job or quote? Message {biz} - happy to help.",
        ],
        "calendar": [
            ("Week 1", "Mon", "Before/after photo from a recent job (with permission)"),
            ("Week 1", "Wed", "Quick tip related to your trade or service"),
            ("Week 1", "Fri", "Repost a client's thank-you message or photo"),
            ("Week 2", "Mon", "Behind-the-scenes: a job in progress"),
            ("Week 2", "Wed", "Introduce a team member - name, role, experience"),
            ("Week 2", "Fri", "Availability reminder for the week ahead"),
            ("Week 3", "Mon", "Answer a commonly asked customer question"),
            ("Week 3", "Wed", "Ask a question - \"what's your biggest [industry] concern?\""),
            ("Week 3", "Fri", "Highlight a client review - screenshot + thank you"),
            ("Week 4", "Mon", "Announce a new service area, offer, or capability"),
            ("Week 4", "Wed", "Customer testimonial or case study feature"),
            ("Week 4", "Fri", "Month recap + what's coming next"),
        ],
        "hashtag_base": ["localbusiness", "smallbusiness", "servicewithasmile", "trustedservice", "professional", "qualitywork", "reliableservice", "getitdone"],
        "review_action": "working with",
    },
}


def get_content(business_type, business_name=None, description=None, city=None):
    """
    Returns the content template dict for a business type.

    - If business_type matches one of the 5 static buckets, returns that
      instantly, for free, with reviewed content.
    - If business_type is "other" (or anything unrecognized) AND a
      description was provided, tries generating tailored content via AI
      (see ai_content.py). Falls back to the generic "service" bucket if
      the AI call fails for any reason (no API key, network error, bad
      response) - a report should never fail to generate just because the
      AI fallback had a bad day.
    """
    if business_type in CONTENT:
        return CONTENT[business_type]

    if description:
        try:
            from ai_content import generate_ai_content
            return generate_ai_content(business_name or "this business", description, city or "")
        except Exception as e:
            print(f"AI content fallback failed, using generic template instead: {e}")

    return CONTENT["service"]


def get_type_label(business_type):
    if business_type == "other":
        return "Business"
    return BUSINESS_TYPES.get(business_type, "Business")
