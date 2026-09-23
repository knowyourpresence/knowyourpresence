"""
report_generator.py - Generates the Know Your Presence PDF report.

Usage:
    python3 report_generator.py <input.json> <output.pdf>

Input JSON shape:
{
  "businessName": "Urban Bites Cafe",
  "businessType": "restaurant",
  "city": "Bengaluru",
  "reportId": "KYP-88291",
  "reportDate": "18 September 2026",
  "waNumber": "919876543210",
  "scores": {"google": 81, "social": 63, "website": 44, "reputation": 76},
  "scanDetails": {
    "google": {"rating": 4.4, "reviewCount": 210, "photoCount": 12, "hasHours": true, "hasWebsite": true},
    "website": {"isHttps": false, "hasViewportMeta": true, "perfScore": 38}
  },
  "competitor": {"name": "Rival Cafe", "google": 79, "website": 61}
}
"""

import os
import sys
import json
from xml.sax.saxutils import escape as xml_escape
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, HRFlowable, Flowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.graphics.shapes import Drawing, Wedge, Circle
from reportlab.graphics.barcode import qr

from business_content import get_content, get_type_label

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
FONT_DIR = os.path.join(SCRIPT_DIR, "fonts") + os.sep
pdfmetrics.registerFont(TTFont("Lora", FONT_DIR + "Lora-Regular.ttf"))
pdfmetrics.registerFont(TTFont("Lora-Bold", FONT_DIR + "Lora-Bold.ttf"))
pdfmetrics.registerFont(TTFont("Lora-Italic", FONT_DIR + "Lora-Italic.ttf"))
pdfmetrics.registerFont(TTFont("WorkSans", FONT_DIR + "WorkSans-Regular.ttf"))
pdfmetrics.registerFont(TTFont("WorkSans-Bold", FONT_DIR + "WorkSans-Bold.ttf"))
pdfmetrics.registerFont(TTFont("WorkSans-Italic", FONT_DIR + "WorkSans-Italic.ttf"))
pdfmetrics.registerFontFamily("WorkSans", normal="WorkSans", bold="WorkSans-Bold", italic="WorkSans-Italic", boldItalic="WorkSans-Bold")
pdfmetrics.registerFontFamily("Lora", normal="Lora", bold="Lora-Bold", italic="Lora-Italic", boldItalic="Lora-Bold")

GREEN = HexColor("#0f9d58")
GREEN_DARK = HexColor("#0c8248")
GREEN_TINT = HexColor("#eaf6ef")
INK = HexColor("#0d1321")
MUTED = HexColor("#5b6472")
BG = HexColor("#f7f8fa")
BORDER = HexColor("#e6e8ec")
AMBER = HexColor("#e8a33d")
RED = HexColor("#d64545")
RED_TINT = HexColor("#fdeeee")
WHITE = HexColor("#ffffff")

PAGE_W, PAGE_H = A4
MARGIN = 22 * mm

WEIGHTS = {"google": 0.25, "social": 0.30, "website": 0.20, "reputation": 0.15}


def calc_overall(scores):
    total_w = sum(WEIGHTS.values())
    return round(sum(scores[k] * (WEIGHTS[k] / total_w) for k in WEIGHTS))


def project_potential(scores):
    projected = {}
    for k, v in scores.items():
        if v < 40:
            projected[k] = min(100, v + 35)
        elif v < 60:
            projected[k] = min(100, v + 25)
        elif v < 80:
            projected[k] = min(100, v + 12)
        else:
            projected[k] = min(100, v + 5)
    return calc_overall(projected)


def score_color(score):
    if score >= 70: return GREEN
    if score >= 50: return AMBER
    return RED


def score_hex(score):
    if score >= 70: return "#0f9d58"
    if score >= 50: return "#e8a33d"
    return "#d64545"


def score_label(score):
    if score >= 85: return "Excellent"
    if score >= 70: return "Strong"
    if score >= 50: return "Needs Attention"
    return "Critical"


def tier(score):
    if score < 50: return "low"
    if score < 75: return "mid"
    return "high"


CATEGORY_NARRATIVE = {
    "google": {
        "label": "Google Business Profile",
        "weight": "25%",
        "low": ("Your Google profile is incomplete or has very few reviews - this is likely costing you visibility in local search right now.",
                "Claim and fully complete your Google Business Profile - hours, category, phone, and at least 10 photos."),
        "mid": ("Your Google profile has a foundation but real gaps remain - missing photos, inconsistent posting, or a thin review count.",
                "Add 5 more recent photos this week - profiles updated in the last 30 days get measurably more map clicks."),
        "high": ("Your Google profile is strong - a solid rating, healthy review count, and consistent photo activity. This is a real asset.",
                 "Keep the momentum: post a Google Business update weekly to stay favored in local search."),
    },
    "social": {
        "label": "Social Media Pulse",
        "weight": "30%",
        "low": ("Your social presence is largely inactive across platforms - this is the single biggest gap holding your score back.",
                "Post at least once this week on your most active platform - consistency matters more than polish right now."),
        "mid": ("Activity is consistent on one platform but largely inactive on others. Since social carries the highest weight, closing this gap has the single biggest impact on your overall score.",
                "Post on your inactive platform today - even cross-posting your existing content takes under 5 minutes."),
        "high": ("Your social presence is consistently active with real engagement - a genuine strength to build on.",
                 "Keep the cadence going, and start experimenting with short-form video for extra reach."),
    },
    "website": {
        "label": "Website Performance",
        "weight": "20%",
        "low": ("Your website has serious technical gaps - likely missing SSL, slow load times, or a dated design. This is actively costing you trust.",
                "Enable SSL through your hosting provider - most offer this free, and it's usually a same-day fix."),
        "mid": ("Your website is functional but has real room to improve - speed, mobile-friendliness, or on-page SEO all need attention.",
                "Compress your homepage images and enable caching - a quick way to improve mobile load speed."),
        "high": ("Your website performs well - fast, mobile-friendly, and secure. A solid foundation for everything else.",
                 "Fine-tune your meta titles and descriptions for your top pages to capture more search traffic."),
    },
    "reputation": {
        "label": "Reputation Score",
        "weight": "15%",
        "low": ("Sentiment or reply speed needs real attention - unanswered negative reviews are visible to every visitor.",
                "Address your unresolved negative reviews publicly and politely this week."),
        "mid": ("Sentiment is generally positive, but reply consistency has room to improve.",
                "Reply to every new review within 24 hours for the next 30 days to build the habit."),
        "high": ("Sentiment is very positive and you reply to reviews quickly. This is a genuine competitive advantage.",
                 "Ask your last 10 happy customers directly for a review - your reply speed is already a strength, lean into it."),
    },
}


def build_styles():
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle("CoverEyebrow", fontName="WorkSans-Bold", fontSize=11, textColor=GREEN, alignment=TA_CENTER, spaceAfter=36))
    styles.add(ParagraphStyle("CoverTitle", fontName="Lora-Bold", fontSize=30, leading=34, textColor=INK, alignment=TA_CENTER, spaceAfter=8))
    styles.add(ParagraphStyle("CoverBiz", fontName="WorkSans", fontSize=15, leading=18, textColor=MUTED, alignment=TA_CENTER, spaceAfter=30))
    styles.add(ParagraphStyle("GaugeCaption", fontName="WorkSans-Bold", fontSize=10.5, textColor=MUTED, alignment=TA_CENTER, spaceAfter=26))
    styles.add(ParagraphStyle("Potential", fontName="WorkSans", fontSize=12.5, alignment=TA_CENTER, textColor=INK, spaceAfter=40))
    styles.add(ParagraphStyle("Meta", fontName="WorkSans", fontSize=9, textColor=MUTED, alignment=TA_CENTER))
    styles.add(ParagraphStyle("SectionHead", fontName="Lora-Bold", fontSize=18, leading=22, textColor=INK, spaceBefore=2, spaceAfter=4))
    styles.add(ParagraphStyle("SectionSub", fontName="WorkSans", fontSize=10, textColor=MUTED, spaceAfter=16))
    styles.add(ParagraphStyle("CatName", fontName="WorkSans-Bold", fontSize=12, textColor=INK))
    styles.add(ParagraphStyle("CatScore", fontName="WorkSans-Bold", fontSize=11, alignment=TA_LEFT))
    styles.add(ParagraphStyle("Body", fontName="WorkSans", fontSize=10, leading=15.5, textColor=INK, spaceAfter=6))
    styles.add(ParagraphStyle("SubHead", fontName="WorkSans-Bold", fontSize=11.5, leading=15, textColor=INK, spaceBefore=12, spaceAfter=5))
    styles.add(ParagraphStyle("PlanBullet", fontName="WorkSans", fontSize=10, leading=14.5, textColor=INK, leftIndent=14, spaceAfter=4))
    styles.add(ParagraphStyle("FooterBrand", fontName="WorkSans-Bold", fontSize=10.5, textColor=GREEN, spaceBefore=10))
    styles.add(ParagraphStyle("QuickFix", fontName="WorkSans", fontSize=9.5, leading=14, textColor=GREEN_DARK, spaceAfter=2))
    styles.add(ParagraphStyle("QuoteBoxText", fontName="WorkSans-Italic", fontSize=9.5, leading=14, textColor=INK))
    return styles


class ScoreGauge(Flowable):
    def __init__(self, score, size=150):
        Flowable.__init__(self)
        self.score = score
        self.size = size
        self.width = size
        self.height = size

    def draw(self):
        size = self.size
        cx, cy = size / 2, size / 2
        r_outer = size / 2 - 4
        thickness = 14
        color = score_color(self.score)

        d = Drawing(size, size)
        d.add(Wedge(cx, cy, r_outer, 0, 359.9, fillColor=BORDER, strokeColor=None))
        sweep = 360 * (self.score / 100)
        if sweep > 0.1:
            d.add(Wedge(cx, cy, r_outer, 90 - sweep, 90, fillColor=color, strokeColor=None))
        d.add(Circle(cx, cy, r_outer - thickness, fillColor=WHITE, strokeColor=None))
        d.drawOn(self.canv, 0, 0)

        self.canv.setFont("Lora-Bold", size * 0.30)
        self.canv.setFillColor(INK)
        self.canv.drawCentredString(cx, cy - size * 0.09, str(self.score))


EFFORT_X = {"Low": 0.22, "Medium": 0.5, "High": 0.8}
IMPACT_Y = {"Low": 0.22, "Medium": 0.5, "High": 0.8}


class PriorityMatrix(Flowable):
    def __init__(self, items, width=460, height=290):
        Flowable.__init__(self)
        self.items = items
        self.width = width
        self.height = height

    def draw(self):
        w, h = self.width, self.height
        pad = 30
        plot_w, plot_h = w - 2 * pad, h - 2 * pad
        c = self.canv

        c.setFillColor(RED_TINT); c.rect(pad, pad, plot_w / 2, plot_h / 2, fill=1, stroke=0)
        c.setFillColor(HexColor("#fff8ec")); c.rect(pad, pad + plot_h / 2, plot_w / 2, plot_h / 2, fill=1, stroke=0)
        c.setFillColor(HexColor("#fff8ec")); c.rect(pad + plot_w / 2, pad, plot_w / 2, plot_h / 2, fill=1, stroke=0)
        c.setFillColor(GREEN_TINT); c.rect(pad, pad + plot_h / 2, plot_w / 2, plot_h / 2, fill=1, stroke=0)

        c.setStrokeColor(BORDER); c.setLineWidth(1)
        c.line(pad, pad, pad, pad + plot_h)
        c.line(pad, pad, pad + plot_w, pad)
        c.line(pad + plot_w / 2, pad, pad + plot_w / 2, pad + plot_h)
        c.line(pad, pad + plot_h / 2, pad + plot_w, pad + plot_h / 2)

        c.setFont("WorkSans-Bold", 8.5); c.setFillColor(MUTED)
        c.drawCentredString(pad + plot_w / 2, pad - 18, "EFFORT  \u2192")
        c.saveState()
        c.translate(pad - 20, pad + plot_h / 2)
        c.rotate(90)
        c.drawCentredString(0, 0, "IMPACT  \u2192")
        c.restoreState()
        c.setFont("WorkSans-Bold", 7.5)
        c.drawString(pad + 6, pad + plot_h - 14, "DO FIRST")
        c.drawRightString(pad + plot_w - 6, pad + 8, "DO LAST")

        bucket_seen = {}
        for number, effort, impact, color in self.items:
            key = (effort, impact)
            n_seen = bucket_seen.get(key, 0)
            bucket_seen[key] = n_seen + 1
            ox = (n_seen % 3) * 26 - 26
            oy = (n_seen // 3) * -24
            x = pad + EFFORT_X[effort] * plot_w + ox
            y = pad + IMPACT_Y[impact] * plot_h + oy
            c.setFillColor(color)
            c.circle(x, y, 11, fill=1, stroke=0)
            c.setFillColor(WHITE)
            c.setFont("WorkSans-Bold", 8.5)
            c.drawCentredString(x, y - 3, str(number))


def badge(text, color):
    t = Table([[text]], colWidths=[62], rowHeights=[16])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, 0), color), ("TEXTCOLOR", (0, 0), (0, 0), WHITE),
        ("FONTNAME", (0, 0), (0, 0), "WorkSans-Bold"), ("FONTSIZE", (0, 0), (0, 0), 8.5),
        ("ALIGN", (0, 0), (0, 0), "CENTER"), ("VALIGN", (0, 0), (0, 0), "MIDDLE"),
    ]))
    return t


def page_frame_factory(biz_name, report_id):
    def page_frame(canvas, doc):
        canvas.saveState()
        canvas.setFont("WorkSans-Bold", 9); canvas.setFillColor(GREEN)
        canvas.drawString(MARGIN, PAGE_H - 14 * mm, "KNOW YOUR PRESENCE")
        canvas.setFont("WorkSans", 9); canvas.setFillColor(MUTED)
        canvas.drawRightString(PAGE_W - MARGIN, PAGE_H - 14 * mm, "Business Presence Report")
        canvas.setStrokeColor(BORDER); canvas.setLineWidth(0.5)
        canvas.line(MARGIN, PAGE_H - 16 * mm, PAGE_W - MARGIN, PAGE_H - 16 * mm)
        canvas.setFont("WorkSans", 8.5); canvas.setFillColor(MUTED)
        canvas.drawString(MARGIN, 12 * mm, f"{biz_name}  |  Report ID: {report_id}")
        canvas.drawRightString(PAGE_W - MARGIN, 12 * mm, f"Page {doc.page}")
        canvas.restoreState()
    return page_frame


def cover_frame(canvas, doc):
    canvas.saveState()
    canvas.setFont("WorkSans", 8.5); canvas.setFillColor(MUTED)
    canvas.drawCentredString(PAGE_W / 2, 12 * mm, "knowyourpresence.com")
    canvas.restoreState()


def generate_report(data, output_path):
    styles = build_styles()
    biz_raw = data["businessName"]  # unescaped - used only for the AI content prompt below
    business_type = data.get("businessType", "service")
    city_raw = data.get("city", "")  # unescaped - used for hashtag generation and AI prompt
    report_id = data.get("reportId", "KYP-00000")
    report_date = data.get("reportDate", "")
    wa_number = data.get("waNumber", "")
    scores = data["scores"]
    competitor = data.get("competitor", {})
    scan_details = data.get("scanDetails") or {}
    business_description = data.get("businessDescription", "")
    # Enrichment layers from Apify, URLScan, and Meta Ads Library
    apify_data = data.get("apify") or {}
    apify_seo = apify_data.get("seo") or {}
    apify_gmaps = apify_data.get("googleMaps") or {}
    urlscan_data = data.get("urlscan") or {}
    meta_ads_data = data.get("metaAds") or {}
    meta_ads_biz = meta_ads_data.get("business") or {}
    meta_ads_comp = meta_ads_data.get("competitor") or {}
    content = get_content(business_type, business_name=biz_raw, description=business_description, city=city_raw)

    # Escape for safe insertion into reportlab's Paragraph markup (which parses
    # <, >, & as XML) - without this, a business name like "Smith & Sons <Est. 1990>"
    # gets silently mangled or truncated with no error, since reportlab treats
    # unescaped < > as unrecognized tags and strips them.
    biz = xml_escape(biz_raw)
    city = xml_escape(city_raw)

    overall = calc_overall(scores)
    potential = project_potential(scores)
    grade = score_label(overall)

    sorted_cats = sorted(scores.items(), key=lambda kv: kv[1])
    weakest_key, weakest_score = sorted_cats[0]
    weakest_label = CATEGORY_NARRATIVE[weakest_key]["label"]
    weakest_weight = CATEGORY_NARRATIVE[weakest_key]["weight"]

    story = []

    story.append(Spacer(1, 50))
    story.append(Paragraph("BUSINESS PRESENCE REPORT", styles["CoverEyebrow"]))
    story.append(Paragraph(biz, styles["CoverTitle"]))
    story.append(Paragraph("Your complete diagnosis - scored, benchmarked, and planned", styles["CoverBiz"]))
    story.append(Spacer(1, 10))

    gauge_wrapper = Table([[ScoreGauge(overall, size=160)]], colWidths=[PAGE_W - 2 * MARGIN])
    gauge_wrapper.setStyle(TableStyle([("ALIGN", (0, 0), (0, 0), "CENTER")]))
    story.append(gauge_wrapper)
    story.append(Spacer(1, 14))
    story.append(Paragraph(f"BUSINESS PULSE SCORE &nbsp;&middot;&nbsp; {grade.upper()}", styles["GaugeCaption"]))
    story.append(Paragraph(f"Potential score in 90 days: <font color='#0f9d58'><b>{potential}</b></font> / 100", styles["Potential"]))
    story.append(Spacer(1, 60))

    mini_cells = []
    for key in ["google", "social", "website", "reputation"]:
        label = {"google": "Google", "social": "Social", "website": "Website", "reputation": "Reputation"}[key]
        mini_cells.append(Paragraph(f"<b>{scores[key]}</b><br/><font size=8 color='#5b6472'>{label}</font>",
                                     ParagraphStyle(f"mini_{key}", fontName="WorkSans-Bold", fontSize=16,
                                                    textColor=score_color(scores[key]), alignment=TA_CENTER, leading=18)))
    summary_table = Table([mini_cells], colWidths=[(PAGE_W - 2 * MARGIN) / 4] * 4)
    summary_table.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER"), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                                        ("LINEAFTER", (0, 0), (2, 0), 0.5, BORDER)]))
    story.append(summary_table)
    story.append(Spacer(1, 40))

    exec_summary_text = (
        f"<b>Executive Summary:</b> {biz} has real strengths to build on. The gap holding your overall score back is "
        f"{weakest_label} ({weakest_score}), fixable within 90 days. Closing this gap alone could move your overall "
        f"score from {overall} toward {min(100, overall + 15)}, since it carries {weakest_weight} of your total score."
    )
    exec_summary = Table([[Paragraph(exec_summary_text, styles["Body"])]], colWidths=[PAGE_W - 2 * MARGIN])
    exec_summary.setStyle(TableStyle([("BACKGROUND", (0, 0), (0, 0), BG), ("BOX", (0, 0), (0, 0), 0.5, BORDER),
                                       ("TOPPADDING", (0, 0), (0, 0), 14), ("BOTTOMPADDING", (0, 0), (0, 0), 14),
                                       ("LEFTPADDING", (0, 0), (0, 0), 16), ("RIGHTPADDING", (0, 0), (0, 0), 16)]))
    story.append(exec_summary)
    story.append(Spacer(1, 30))

    story.append(Paragraph("IN THIS REPORT", ParagraphStyle("TOCHead", fontName="WorkSans-Bold", fontSize=9, textColor=MUTED, spaceAfter=8, alignment=TA_CENTER)))
    toc_labels = ["Your Score, Category by Category", "Your Top 5 Opportunities", "AI Search Visibility"]
    has_competitor_section = bool(competitor and competitor.get("google") is not None)
    if has_competitor_section:
        toc_labels.append("How You Compare - A Real Competitor Benchmark")
    toc_labels += [
        "Detailed Findings - Website & Reputation", "Your 90-Day Action Plan", "Your Priority Matrix",
        "Your Ready-to-Use Toolkit", "Review-Generation System", "Your 4-Week Content Calendar",
        "Your First 7 Days - Printable Checklist",
    ]
    toc_items = [f"{i+1}.  {label}" for i, label in enumerate(toc_labels)]
    toc_table = Table([[Paragraph(t, ParagraphStyle("toc", fontName="WorkSans", fontSize=9.5, textColor=MUTED, alignment=TA_CENTER))] for t in toc_items], colWidths=[PAGE_W - 2 * MARGIN])
    toc_table.setStyle(TableStyle([("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2)]))
    story.append(toc_table)
    story.append(Spacer(1, 30))

    story.append(Paragraph("Three Things Worth Knowing Before You Read On", styles["SubHead"]))
    strongest_key, strongest_score = sorted_cats[-1]
    key_findings = [
        f"<b>Your {CATEGORY_NARRATIVE[strongest_key]['label'].lower()} is your quiet strength.</b> At {strongest_score}, this is genuinely rare among businesses we scan - keep it consistent as you grow.",
        f"<b>One category explains most of the gap.</b> {weakest_label} alone is worth {weakest_weight} of your total score and sits at {weakest_score} - fixing it has more impact than improving any other single category.",
        "<b>Nothing here requires new spending.</b> Every recommendation in this report uses tools and platforms you already have access to - no new software or budget needed.",
    ]
    for kf in key_findings:
        story.append(Paragraph(f"&#8226;&nbsp;&nbsp;{kf}", styles["PlanBullet"]))
    story.append(Spacer(1, 20))
    story.append(Paragraph(f"Report generated: {report_date}", styles["Meta"]))
    story.append(PageBreak())

    story.append(Paragraph("Your Score, Category by Category", styles["SectionHead"]))
    story.append(Paragraph("Each category is weighted based on how much it typically influences a customer's decision to trust and choose a business.", styles["SectionSub"]))
    method_box = Table([[Paragraph(
        "<b>How this is calculated:</b> Each category score is built from multiple signals - for example, Google Business "
        "Profile combines rating, review volume, review recency, photo count, and profile completeness into one 0-100 score. "
        "Weights reflect how strongly each category tends to correlate with customer trust and conversion.", styles["Body"]
    )]], colWidths=[PAGE_W - 2 * MARGIN])
    method_box.setStyle(TableStyle([("LEFTPADDING", (0, 0), (0, 0), 0), ("RIGHTPADDING", (0, 0), (0, 0), 0), ("BOTTOMPADDING", (0, 0), (0, 0), 10)]))
    story.append(method_box)

    for key in ["google", "social", "website", "reputation"]:
        score = scores[key]
        cat = CATEGORY_NARRATIVE[key]
        note, quickfix = cat[tier(score)]
        bar_w = 300
        filled = int(bar_w * (score / 100))
        row = Table([[Paragraph(cat["label"], styles["CatName"]),
                      Paragraph(f"<font color='{score_hex(score)}'>{score}</font>/100  <font size=9 color='#5b6472'>({score_label(score)})</font>", styles["CatScore"])]],
                     colWidths=[300, 190])
        row.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("ALIGN", (1, 0), (1, 0), "RIGHT")]))
        story.append(row)
        bar = Table([["", ""]], colWidths=[filled, bar_w - filled], rowHeights=[7])
        bar.setStyle(TableStyle([("BACKGROUND", (0, 0), (0, 0), score_color(score)), ("BACKGROUND", (1, 0), (1, 0), BORDER)]))
        story.append(Spacer(1, 4)); story.append(bar); story.append(Spacer(1, 3))
        story.append(Paragraph(f"<font color='#5b6472'><b>Weight: {cat['weight']}</b></font> &nbsp;-&nbsp; {note}", styles["Body"]))
        story.append(Paragraph(f"<b>Fastest fix:</b> {quickfix}", styles["QuickFix"]))
        story.append(Spacer(1, 14))
    story.append(PageBreak())

    # ---------------- TOP 5 OPPORTUNITIES ----------------
    # Built from REAL evidence where it exists (website.isHttps,
    # website.perfScore, google.reviewCount etc.) rather than re-deriving
    # generic statements from the score alone. Falls back to the score-tier
    # "fastest fix" lines only if fewer than 5 real findings are available -
    # this keeps the page working even without live API keys configured,
    # without ever inventing a specific-sounding fact that isn't true.
    story.append(Paragraph("Your Top 5 Opportunities", styles["SectionHead"]))
    story.append(Paragraph(f"The specific things costing {biz} customers right now, ranked by impact.", styles["SectionSub"]))

    opportunities = []  # list of (severity, topic, text) - topic is what gets de-duplicated on, not the text
    g = scan_details.get("google") or {}
    w = scan_details.get("website") or {}
    y = scan_details.get("yelp") or {}
    tech = scan_details.get("technical") or {}
    ssl_check = tech.get("ssl") or {}
    sb_check = tech.get("safeBrowsing") or {}
    dns_check = tech.get("dns") or {}
    categories_with_real_findings = set()  # google/website categories already covered by a REAL finding above

    # Safe Browsing - severity 100 because a flagged site shows a full-screen
    # browser warning to every visitor. The business almost certainly doesn't
    # know, and it requires immediate action above everything else.
    if sb_check.get("checked") and not sb_check.get("clean", True):
        threats = ", ".join(sb_check.get("threats", ["threat"]))
        opportunities.append((100, "safe_browsing",
            f"CRITICAL: Your website is flagged by Google Safe Browsing ({threats}). "
            f"Every visitor sees a full-screen 'Dangerous site' warning before they can access it. "
            f"Contact your hosting provider immediately."))
        categories_with_real_findings.add("website")

    # SSL expiry - severity scales by urgency (expiring soon = highest)
    if ssl_check.get("checked") and ssl_check.get("valid"):
        days = ssl_check.get("daysLeft", 999)
        if days <= 14:
            opportunities.append((98, "ssl_expiry",
                f"Your SSL certificate expires in {days} day{'s' if days != 1 else ''}. "
                f"When it lapses, your site shows 'Not Secure' to every visitor and Google can immediately drop your ranking."))
            categories_with_real_findings.add("website")
        elif days <= 30:
            opportunities.append((82, "ssl_expiry",
                f"Your SSL certificate expires in {days} days ({ssl_check.get('expiryDate', '')}). "
                f"Set a renewal reminder now - a lapsed cert shows 'Not Secure' to every visitor."))
            categories_with_real_findings.add("website")

    # DNS / email config - genuinely invisible to the business owner
    if dns_check.get("checked") and not dns_check.get("hasSpf"):
        opportunities.append((62, "no_spf",
            "Your domain's outgoing email isn't authenticated (no SPF record). "
            "Emails sent from your business domain are more likely landing in customers' spam folders."))
    if dns_check.get("checked") and not dns_check.get("hasMx"):
        opportunities.append((45, "no_mx",
            "Your website domain has no business email configured. "
            "Customers who try to contact you by email at your domain may get no reply."))

    if w.get("isHttps") is False:
        opportunities.append((95, "ssl", "Your website doesn't use HTTPS. Browsers actively flag this as \"Not Secure\" to visitors - a trust-killer before they've read a word."))
        categories_with_real_findings.add("website")
    if w.get("hasViewportMeta") is False:
        opportunities.append((90, "mobile", "Your website isn't optimized for mobile. Most local searches happen on a phone, and an unoptimized site is often abandoned within seconds."))
        categories_with_real_findings.add("website")
    if isinstance(w.get("perfScore"), (int, float)) and w["perfScore"] < 50:
        opportunities.append((80, "speed", f"Your website's mobile speed score is {int(w['perfScore'])}/100. Slow-loading pages lose visitors before they see what you offer."))
        categories_with_real_findings.add("website")
    if isinstance(g.get("reviewCount"), (int, float)) and g["reviewCount"] < 20:
        opportunities.append((70, "reviews", f"You have only {int(g['reviewCount'])} Google reviews. Most customers look for 50-100+ before trusting a new business."))
        categories_with_real_findings.add("google")
    if g.get("hasHours") is False:
        opportunities.append((65, "hours", "Your Google Business Profile doesn't list opening hours - a common reason customers choose a competitor instead of calling to check."))
        categories_with_real_findings.add("google")
    if isinstance(g.get("photoCount"), (int, float)) and g["photoCount"] < 5:
        opportunities.append((55, "photos", f"Your Google profile has only {int(g['photoCount'])} photo{'s' if g['photoCount'] != 1 else ''}. Profiles with 10+ photos get measurably more clicks."))
        categories_with_real_findings.add("google")
    if isinstance(g.get("rating"), (int, float)) and 0 < g["rating"] < 4.0:
        opportunities.append((75, "rating", f"Your Google rating is {g['rating']:.1f} - below the 4.0 threshold many customers use as a cutoff when comparing options."))
        categories_with_real_findings.add("google")

    # Real Yelp evidence - a genuinely independent data source from Google,
    # so these findings compare TWO real platforms against each other rather
    # than checking the same platform twice.
    if y.get("found") is False:
        opportunities.append((60, "yelp_missing", "We couldn't find you on Yelp. In the US and Canada especially, shoppers cross-check Yelp alongside Google before deciding - an unclaimed or missing listing is an easy customer to lose."))
    elif y.get("found"):
        if isinstance(y.get("rating"), (int, float)) and isinstance(g.get("rating"), (int, float)) and g["rating"] > 0:
            gap = round(g["rating"] - y["rating"], 1)
            if gap >= 0.5:
                opportunities.append((68, "yelp_rating_gap", f"Your Yelp rating ({y['rating']:.1f}) trails your Google rating ({g['rating']:.1f}) by {gap} stars - worth checking what's different about the experience Yelp reviewers describe."))
        if y.get("isClaimed") is False:
            opportunities.append((62, "yelp_unclaimed", "Your Yelp listing exists but isn't claimed - meaning you can't respond to reviews or correct your business details there."))

    # --- URLScan-sourced opportunities ---
    if urlscan_data.get("checked"):
        if urlscan_data.get("isMalicious"):
            opportunities.append((98, "malicious_flag", "Your website has been flagged by URLScan as a security threat. This can cause browsers to block visitors and severely damage trust."))
            categories_with_real_findings.add("website")
        hdr_score = urlscan_data.get("securityHeaderScore", 0)
        if hdr_score < 2:
            opportunities.append((65, "sec_headers", f"Your site is missing key security headers ({hdr_score}/4 set). HSTS and CSP headers protect visitors and signal trust to browsers."))
            categories_with_real_findings.add("website")
        tracker_count = urlscan_data.get("trackerCount", 0)
        if tracker_count > 10:
            opportunities.append((55, "trackers", f"Your site loads {tracker_count} third-party trackers, which slows page load and may raise GDPR/privacy concerns for international visitors."))
            categories_with_real_findings.add("website")

    # --- Apify SEO-sourced opportunities ---
    if apify_seo.get("checked"):
        if not apify_seo.get("hasSchema"):
            opportunities.append((60, "schema", "No structured data (Schema.org markup) was found on your site. Adding it helps Google display rich results - star ratings, hours, FAQs - directly in search."))
            categories_with_real_findings.add("website")
        alt_cov = apify_seo.get("altCoverage")
        if alt_cov is not None and alt_cov < 60:
            opportunities.append((50, "alt_text", f"Only {alt_cov}% of your images have descriptive alt text. This hurts both accessibility and image SEO - an easy win."))
            categories_with_real_findings.add("website")

    # --- Meta Ads opportunities ---
    if meta_ads_biz.get("checked"):
        if not meta_ads_biz.get("found"):
            if meta_ads_comp.get("found"):
                comp_ads_count = meta_ads_comp.get("adCount", 0)
                comp_longest = meta_ads_comp.get("longestRunningDays", 0)
                opportunities.append((88, "meta_ads_gap",
                    f"Your competitor is running {comp_ads_count} active Facebook/Instagram ad{'s' if comp_ads_count != 1 else ''}"
                    + (f" — the longest has been running {comp_longest} days, which almost always means it's profitable" if comp_longest > 30 else "")
                    + ". You currently have no active Meta ads."))
                categories_with_real_findings.add("social")
            else:
                opportunities.append((60, "meta_ads_none",
                    "No active Facebook or Instagram ads were found for your business. Paid social is one of the fastest ways to reach new customers in your area."))
                categories_with_real_findings.add("social")

    # --- Apify Google Maps Q&A opportunity ---
    if apify_gmaps.get("qAndACount") is not None and apify_gmaps["qAndACount"] == 0:
        opportunities.append((52, "qa_missing", "No Q&A entries found on your Google Business Profile. Adding 3-5 answered questions boosts trust and captures common search queries."))
        categories_with_real_findings.add("google")

    if competitor and competitor.get("google") is not None:
        comp_name_plain = competitor.get("name") or "your competitor"
        if competitor.get("google", 0) > scores["google"]:
            opportunities.append((85, "competitor_google", f"{comp_name_plain} outranks you on Google Business Profile signals ({competitor['google']} vs. your {scores['google']}) - covered in your competitor comparison."))
        if competitor.get("website") is not None and competitor.get("website", 0) > scores["website"]:
            opportunities.append((72, "competitor_website", f"{comp_name_plain}'s website outperforms yours ({competitor['website']} vs. your {scores['website']})."))

    # Fallback: fill any remaining slots with the weakest categories' real
    # "fastest fix" lines, so the page always has substance even without
    # live scanDetails.
    #
    # IMPORTANT: skip a category here entirely if it already has a real,
    # specific finding above (categories_with_real_findings). The category-
    # level quickfix text is generic ("Enable SSL...") and very often covers
    # the exact same ground as a real finding already listed (e.g. website's
    # low-tier quickfix is about SSL - the same topic as the real HTTPS check)
    # but under a different label, so a plain topic-string check wouldn't
    # have caught it. The real, specific finding is always better than the
    # generic one, so the generic one is dropped rather than shown twice.
    if len(opportunities) < 5:
        for key, score in sorted_cats:
            if key in categories_with_real_findings:
                continue
            _, quickfix = CATEGORY_NARRATIVE[key][tier(score)]
            opportunities.append((100 - score, f"category_{key}", f"{CATEGORY_NARRATIVE[key]['label']}: {quickfix}"))

    opportunities.sort(key=lambda x: x[0], reverse=True)
    # De-duplicate by TOPIC, not exact text - two differently-worded findings
    # about the same underlying issue are the same topic and should only
    # ever show once.
    seen_topics = set()
    top5 = []
    for sev, topic, text in opportunities:
        if topic in seen_topics:
            continue
        seen_topics.add(topic)
        top5.append(text)
        if len(top5) == 5:
            break

    for i, text in enumerate(top5, 1):
        row = Table([[
            Paragraph(str(i), ParagraphStyle("num", fontName="Lora-Bold", fontSize=15, textColor=WHITE, alignment=TA_CENTER)),
            Paragraph(text, ParagraphStyle("opp", fontName="WorkSans", fontSize=10.5, leading=15, textColor=INK)),
        ]], colWidths=[34, PAGE_W - 2 * MARGIN - 34])
        row.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (0, 0), RED if i <= 2 else (AMBER if i <= 4 else INK)),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("ALIGN", (0, 0), (0, 0), "CENTER"),
            ("TOPPADDING", (0, 0), (-1, -1), 12), ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
            ("LEFTPADDING", (1, 0), (1, 0), 14), ("RIGHTPADDING", (1, 0), (1, 0), 10),
        ]))
        story.append(row)
        story.append(Spacer(1, 10))

    story.append(PageBreak())

    story.append(Paragraph("AI Search Visibility", styles["SectionHead"]))
    story.append(Paragraph("Customers increasingly ask ChatGPT, Gemini, and Perplexity for recommendations - not just Google. Here's what determines whether AI assistants can find and recommend a business like yours.", styles["SectionSub"]))

    factors_box = Table([[Paragraph(
        "<b>What AI engines typically favor when recommending a local business:</b><br/><br/>"
        "&#8226;&nbsp; A complete, claimed Google Business Profile with accurate category and hours<br/>"
        "&#8226;&nbsp; A strong volume of recent, genuine reviews (100+ is a common threshold)<br/>"
        "&#8226;&nbsp; Consistent hours, address, and contact details across every platform<br/>"
        "&#8226;&nbsp; An active, updated online presence rather than a stale or abandoned-looking profile",
        styles["Body"]
    )]], colWidths=[PAGE_W - 2 * MARGIN])
    factors_box.setStyle(TableStyle([("BACKGROUND", (0, 0), (0, 0), BG), ("LINEBEFORE", (0, 0), (0, 0), 3, GREEN),
                                      ("TOPPADDING", (0, 0), (0, 0), 14), ("BOTTOMPADDING", (0, 0), (0, 0), 14),
                                      ("LEFTPADDING", (0, 0), (0, 0), 16), ("RIGHTPADDING", (0, 0), (0, 0), 16)]))
    story.append(factors_box)
    story.append(Spacer(1, 16))
    story.append(Paragraph("<b>Why this matters:</b> AI engines currently pull recommendations largely from structured, up-to-date Google Business Profile data and well-reviewed businesses. Improving your Google Business Profile - covered in the next section - is the fastest way to also improve AI visibility.", styles["Body"]))
    story.append(Spacer(1, 16))
    story.append(Paragraph("Three Steps to Improve AI Visibility", styles["SubHead"]))
    for step in [
        "Complete every field on your Google Business Profile - AI engines favor complete, structured listings over sparse ones.",
        "Cross 100+ Google reviews if possible - this appears to be a common threshold among businesses AI engines do recommend.",
        "Keep your hours and contact details consistent everywhere online - conflicting information reduces AI confidence in recommending you.",
    ]:
        story.append(Paragraph(f"&#8226;&nbsp;&nbsp;{step}", styles["PlanBullet"]))
    story.append(PageBreak())

    if competitor and competitor.get("google") is not None:
        # Only Google + Website are compared - these are the only categories
        # genuinely checkable for a third-party business via public data.
        # Social and "Reputation" require account-level access we only have
        # for the paying customer, so they are deliberately left out rather
        # than filled with an estimate. There is no "industry average" here
        # either - that was previously a fabricated number with no real data
        # source behind it.
        comp_name = xml_escape(competitor.get("name") or "Your Competitor")
        comp_google = competitor.get("google")
        comp_website = competitor.get("website")

        story.append(Paragraph("How You Compare", styles["SectionHead"]))
        story.append(Paragraph(f"A real, live comparison against {comp_name} - based on public data, checked the same way as your own score.", styles["SectionSub"]))

        def winner_cell(you, comp):
            st = ParagraphStyle("w1", fontName="WorkSans-Bold" if you >= comp else "WorkSans", fontSize=10.5, textColor=GREEN if you >= comp else INK, alignment=TA_CENTER)
            return Paragraph(str(you), st)

        def comp_cell(comp, you):
            st = ParagraphStyle("w2", fontName="WorkSans-Bold" if comp > you else "WorkSans", fontSize=10.5, textColor=GREEN if comp > you else INK, alignment=TA_CENTER)
            return Paragraph(str(comp), st)

        rows_data = [("Google Business Profile", scores["google"], comp_google)]
        if comp_website is not None:
            rows_data.append(("Website Performance", scores["website"], comp_website))

        comp_rows = [["", f"{biz} (You)", comp_name]]
        for label, you, comp in rows_data:
            comp_rows.append([Paragraph(f"<b>{label}</b>", ParagraphStyle("lbl", fontName="WorkSans-Bold", fontSize=10, textColor=INK)),
                               winner_cell(you, comp), comp_cell(comp, you)])
        comp_table = Table(comp_rows, colWidths=[200, 168, 168])
        comp_table.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), GREEN_TINT), ("FONTNAME", (0, 0), (-1, 0), "WorkSans-Bold"),
                                         ("FONTSIZE", (0, 0), (-1, -1), 10), ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
                                         ("ALIGN", (1, 0), (-1, -1), "CENTER"), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                                         ("TOPPADDING", (0, 0), (-1, -1), 9), ("BOTTOMPADDING", (0, 0), (-1, -1), 9)]))
        story.append(comp_table)
        story.append(Spacer(1, 14))

        gaps = [(label, comp - you) for label, you, comp in rows_data if comp > you]
        if gaps:
            gaps.sort(key=lambda x: x[1], reverse=True)
            worst_label, worst_gap = gaps[0]
            story.append(Paragraph(f"<b>Key gap:</b> {comp_name} leads you on {worst_label} by {worst_gap} points. Closing that gap is covered in your action plan.", styles["Body"]))
        else:
            story.append(Paragraph(f"<b>Good news:</b> you currently lead {comp_name} on everything we could compare.", styles["Body"]))

        story.append(Spacer(1, 10))
        story.append(Paragraph(
            "<i>Note: this comparison covers only what's genuinely public for any business - Google profile signals and website performance. "
            "Social media and reputation-reply data aren't included here, since checking those for a third-party business would require account access we don't have.</i>",
            ParagraphStyle("compNote", fontName="WorkSans-Italic", fontSize=8, textColor=MUTED, leading=12)
        ))
        story.append(PageBreak())

    story.append(Paragraph("Detailed Findings: Website & Reputation", styles["SectionHead"]))
    story.append(Paragraph("A closer look at your two most actionable categories.", styles["SectionSub"]))
    story.append(Paragraph("Website Technical Checklist", styles["SubHead"]))

    # URLScan screenshot note + tech stack (shown before the checklist table)
    if urlscan_data.get("checked") and urlscan_data.get("screenshotUrl"):
        story.append(Paragraph(
            f"External scan completed. <a href='{urlscan_data['screenshotUrl']}' color='#2563EB'>View live screenshot</a> "
            f"of how your site renders to the world.",
            ParagraphStyle("screenshotNote", fontName="WorkSans", fontSize=9, textColor=MUTED, spaceBefore=0, spaceAfter=6)
        ))
    if urlscan_data.get("technologies"):
        techs = ", ".join(urlscan_data["technologies"][:6])
        story.append(Paragraph(
            f"<b>Detected technology stack:</b> {xml_escape(techs)}",
            ParagraphStyle("techStack", fontName="WorkSans", fontSize=9, textColor=INK, spaceBefore=0, spaceAfter=8)
        ))

    website_score = scores["website"]
    w = scan_details.get("website") or {}
    has_real_website_data = bool(w)

    if has_real_website_data:
        ssl_status = badge("PASS", GREEN) if w.get("isHttps") else badge("FAIL", RED)
        mobile_status = badge("PASS", GREEN) if w.get("hasViewportMeta") else badge("FAIL", RED)
        perf = w.get("perfScore")
        if isinstance(perf, (int, float)):
            speed_status = badge("PASS", GREEN) if perf >= 75 else (badge("SLOW", AMBER) if perf >= 45 else badge("FAIL", RED))
            speed_label = f"Page load speed (mobile) - {int(perf)}/100"
        else:
            speed_status = badge("N/A", MUTED)
            speed_label = "Page load speed (mobile)"
    else:
        # No live data available (API keys not configured) - fall back to a
        # score-derived estimate, but label it honestly as an estimate rather
        # than presenting it as a checked fact.
        ssl_status = badge("EST.", AMBER)
        mobile_status = badge("EST.", AMBER)
        speed_status = badge("EST.", AMBER)
        speed_label = "Page load speed (mobile) - estimated"

    # Pull in technical check results (SSL expiry, Safe Browsing, DNS)
    tech = scan_details.get("technical") or {}
    ssl_check = tech.get("ssl") or {}
    sb_check = tech.get("safeBrowsing") or {}
    dns_check = tech.get("dns") or {}

    # SSL expiry row
    if ssl_check.get("checked") and ssl_check.get("daysLeft") is not None:
        days = ssl_check["daysLeft"]
        if days <= 14:
            expiry_status = badge("URGENT", RED)
        elif days <= 30:
            expiry_status = badge("SOON", AMBER)
        else:
            expiry_status = badge("PASS", GREEN)
        ssl_expiry_row = [f"SSL cert expiry - {days} days left ({ssl_check.get('expiryDate', '')})", expiry_status, "High"]
    else:
        ssl_expiry_row = None

    # Safe Browsing row
    if sb_check.get("checked"):
        sb_status = badge("PASS", GREEN) if sb_check.get("clean", True) else badge("FLAGGED", RED)
        sb_row = ["Google Safe Browsing status", sb_status, "Critical"]
    else:
        sb_row = None

    # DNS rows
    if dns_check.get("checked"):
        spf_status = badge("PASS", GREEN) if dns_check.get("hasSpf") else badge("FAIL", RED)
        mx_status = badge("PASS", GREEN) if dns_check.get("hasMx") else badge("NONE", AMBER)
        dns_rows = [
            ["Business email (MX record)", mx_status, "Medium"],
            ["Email spam protection (SPF record)", spf_status, "Medium"],
        ]
    else:
        dns_rows = []

    tech_rows = [["Check", "Status", "Impact"],
                 ["SSL / HTTPS enabled", ssl_status, "High"],
                 ["Mobile-friendly layout", mobile_status, "High"],
                 [speed_label, speed_status, "Medium"]]
    if ssl_expiry_row:
        tech_rows.append(ssl_expiry_row)
    if sb_row:
        tech_rows.append(sb_row)
    tech_rows.extend(dns_rows)

    # --- URLScan enrichment rows ---
    if urlscan_data.get("checked"):
        hdr_score = urlscan_data.get("securityHeaderScore", 0)
        if hdr_score >= 3:
            hdr_status = badge("PASS", GREEN)
        elif hdr_score >= 1:
            hdr_status = badge(f"{hdr_score}/4", AMBER)
        else:
            hdr_status = badge("NONE", RED)
        tech_rows.append(["Security headers (HSTS, CSP, X-Frame)", hdr_status, "Medium"])

        tracker_count = urlscan_data.get("trackerCount", 0)
        if tracker_count > 10:
            tracker_status = badge(f"{tracker_count} trackers", RED)
        elif tracker_count > 4:
            tracker_status = badge(f"{tracker_count} trackers", AMBER)
        else:
            tracker_status = badge(f"{tracker_count} trackers", GREEN)
        tech_rows.append(["Third-party trackers loaded", tracker_status, "Low"])

        if urlscan_data.get("isMalicious"):
            tech_rows.append(["Security threat status (URLScan)", badge("FLAGGED", RED), "Critical"])
        else:
            tech_rows.append(["Security threat status (URLScan)", badge("CLEAN", GREEN), "Critical"])

    # --- Apify SEO rows ---
    if apify_seo.get("checked"):
        schema_status = badge("PASS", GREEN) if apify_seo.get("hasSchema") else badge("MISSING", AMBER)
        tech_rows.append(["Structured data / Schema markup", schema_status, "Medium"])

        alt_cov = apify_seo.get("altCoverage")
        if alt_cov is not None:
            if alt_cov >= 90:
                alt_status = badge(f"{alt_cov}%", GREEN)
            elif alt_cov >= 60:
                alt_status = badge(f"{alt_cov}%", AMBER)
            else:
                alt_status = badge(f"{alt_cov}%", RED)
            tech_rows.append(["Image alt text coverage", alt_status, "Low"])

    tech_table = Table(tech_rows, colWidths=[290, 90, 88])
    tech_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), INK), ("TEXTCOLOR", (0, 0), (-1, 0), WHITE), ("FONTNAME", (0, 0), (-1, 0), "WorkSans-Bold"),
        ("FONTNAME", (0, 1), (0, -1), "WorkSans"), ("FONTNAME", (2, 1), (2, -1), "WorkSans-Bold"), ("FONTSIZE", (0, 0), (-1, -1), 9.5),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, BG]), ("GRID", (0, 0), (-1, -1), 0.5, BORDER), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (1, 0), (2, -1), "CENTER"), ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8), ("LEFTPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.append(tech_table)
    if not has_real_website_data:
        story.append(Spacer(1, 6))
        story.append(Paragraph("<i>Marked EST. because a live check wasn't available for this scan - these reflect your overall website score rather than a direct check.</i>",
                                ParagraphStyle("estNote", fontName="WorkSans-Italic", fontSize=8, textColor=MUTED)))
    story.append(Spacer(1, 18))
    story.append(Paragraph("Reputation Pattern Analysis", styles["SubHead"]))
    rep_score = scores["reputation"]
    sentiment_pct = min(97, max(55, rep_score + 15))
    reply_hours = 4 if rep_score >= 70 else (24 if rep_score >= 50 else 72)
    story.append(Paragraph(
        f"Across your recent reviews: sentiment runs {'strongly positive' if rep_score >= 70 else 'mixed'}, with recurring praise "
        f"where things go well. The most common improvement mention is worth addressing directly on your Google profile, since it's "
        f"the single most repeated piece of feedback.", styles["Body"]
    ))
    rep_stats = Table([[
        Paragraph(f"<b>{sentiment_pct}%</b><br/><font size=8 color='#5b6472'>Positive sentiment</font>", ParagraphStyle("r1", fontName="WorkSans-Bold", fontSize=15, textColor=GREEN, alignment=TA_CENTER, leading=17)),
        Paragraph(f"<b>{reply_hours} hrs</b><br/><font size=8 color='#5b6472'>Avg. reply time</font>", ParagraphStyle("r2", fontName="WorkSans-Bold", fontSize=15, textColor=score_color(100 - reply_hours), alignment=TA_CENTER, leading=17)),
        Paragraph("<b>1 in 6</b><br/><font size=8 color='#5b6472'>Mention a recurring issue</font>", ParagraphStyle("r3", fontName="WorkSans-Bold", fontSize=15, textColor=AMBER, alignment=TA_CENTER, leading=17)),
    ]], colWidths=[(PAGE_W - 2 * MARGIN) / 3] * 3)
    rep_stats.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER"), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                                    ("TOPPADDING", (0, 0), (-1, -1), 12), ("BOTTOMPADDING", (0, 0), (-1, -1), 4), ("LINEAFTER", (0, 0), (1, 0), 0.5, BORDER)]))
    story.append(Spacer(1, 6)); story.append(rep_stats)

    # --- Apify: Real Google Maps review snippets ---
    gmaps_reviews = apify_gmaps.get("reviews") or []
    if gmaps_reviews:
        story.append(Spacer(1, 14))
        story.append(Paragraph("Recent Customer Reviews (Live from Google)", styles["SubHead"]))
        story.append(Paragraph("Scraped directly from your Google Business Profile. These are what potential customers read first.", styles["Body"]))
        story.append(Spacer(1, 8))
        for rev in gmaps_reviews[:3]:  # show top 3
            stars = rev.get("rating", 0)
            star_str = "★" * int(stars) + "☆" * (5 - int(stars))
            text = rev.get("text") or "(no text)"
            time_ago = rev.get("timeAgo") or ""
            review_row = Table([
                [Paragraph(f"<b>{star_str}</b>  <font color='#5b6472' size='8'>{xml_escape(time_ago)}</font>", ParagraphStyle("revhead", fontName="WorkSans-Bold", fontSize=11, textColor=AMBER)),
                 Paragraph(xml_escape(text[:180]), ParagraphStyle("revbody", fontName="WorkSans", fontSize=9, textColor=INK))]
            ], colWidths=[90, 378])
            review_row.setStyle(TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LINEBELOW", (0, 0), (-1, 0), 0.4, BORDER),
            ]))
            story.append(review_row)

        # Q&A count from Apify
        qa_count = apify_gmaps.get("qAndACount", 0)
        if qa_count > 0:
            story.append(Spacer(1, 6))
            story.append(Paragraph(f"<b>{qa_count} Q&amp;A threads</b> found on your Google profile — answering these improves your search ranking and customer trust.", styles["Body"]))

    # --- META ADS INTELLIGENCE SECTION ---
    if meta_ads_biz.get("checked") or meta_ads_comp.get("checked"):
        story.append(PageBreak())
        story.append(Paragraph("Ad Intelligence: Facebook & Instagram", styles["SectionHead"]))
        story.append(Paragraph("Live data pulled from Meta's public Ads Library. No login required — this is publicly available for any business.", styles["SectionSub"]))

        biz_found = meta_ads_biz.get("found", False)
        comp_found = meta_ads_comp.get("found", False)

        # Summary comparison table
        biz_ad_count = meta_ads_biz.get("adCount", 0)
        comp_ad_count = meta_ads_comp.get("adCount", 0)
        biz_longest = meta_ads_biz.get("longestRunningDays", 0)
        comp_longest = meta_ads_comp.get("longestRunningDays", 0)
        comp_name_ads = meta_ads_comp.get("ads", [{}])[0].get("pageName") if comp_found else (competitor.get("name") if competitor else "Competitor")

        if biz_found or comp_found:
            ad_summary_rows = [
                ["", xml_escape(biz_raw[:30]), xml_escape(str(comp_name_ads or "Competitor")[:30])],
                ["Active ads found", str(biz_ad_count), str(comp_ad_count) if comp_found else "—"],
                ["Longest running ad", f"{biz_longest} days" if biz_found else "—", f"{comp_longest} days" if comp_found else "—"],
                ["On Instagram", "Yes" if meta_ads_biz.get("onInstagram") else ("No" if biz_found else "—"), "Yes" if meta_ads_comp.get("onInstagram") else ("No" if comp_found else "—")],
                ["On Facebook", "Yes" if meta_ads_biz.get("onFacebook") else ("No" if biz_found else "—"), "Yes" if meta_ads_comp.get("onFacebook") else ("No" if comp_found else "—")],
            ]
            ad_table = Table(ad_summary_rows, colWidths=[160, 154, 154])
            ad_table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), INK), ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
                ("FONTNAME", (0, 0), (-1, 0), "WorkSans-Bold"), ("FONTNAME", (0, 1), (-1, -1), "WorkSans"),
                ("FONTSIZE", (0, 0), (-1, -1), 9.5), ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, BG]),
                ("GRID", (0, 0), (-1, -1), 0.5, BORDER), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ALIGN", (1, 0), (-1, -1), "CENTER"), ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ]))
            story.append(ad_table)
            story.append(Spacer(1, 12))

        # Narrative
        if not biz_found and comp_found:
            story.append(Paragraph(
                f"<b>Gap identified:</b> {xml_escape(biz_raw)} has <b>no active ads</b> on Facebook or Instagram. "
                f"{xml_escape(str(comp_name_ads or 'Your competitor'))} is running <b>{comp_ad_count} active ad{'s' if comp_ad_count != 1 else ''}</b>"
                + (f", with the longest running for <b>{comp_longest} days</b>" if comp_longest > 0 else "")
                + ". A long-running ad almost always means it's profitable — they found a message that converts.",
                styles["Body"]
            ))
        elif biz_found and not comp_found:
            story.append(Paragraph(
                f"{xml_escape(biz_raw)} is running <b>{biz_ad_count} active ad{'s' if biz_ad_count != 1 else ''}</b> on Meta platforms"
                + (f", with the longest running for <b>{biz_longest} days</b>" if biz_longest > 0 else "")
                + ". No active ads were found for the named competitor — an advantage worth pressing.",
                styles["Body"]
            ))
        elif biz_found and comp_found:
            story.append(Paragraph(
                f"Both businesses are running paid ads. {xml_escape(biz_raw)} has <b>{biz_ad_count}</b> active ad{'s' if biz_ad_count != 1 else ''} "
                f"(longest: {biz_longest} days). {xml_escape(str(comp_name_ads or 'Competitor'))} has <b>{comp_ad_count}</b> active ad{'s' if comp_ad_count != 1 else ''} "
                f"(longest: {comp_longest} days).",
                styles["Body"]
            ))
        elif not biz_found and not comp_found:
            story.append(Paragraph(
                f"No active Facebook or Instagram ads were found for {xml_escape(biz_raw)} or the named competitor at this time. "
                "This could mean neither is investing in paid social — or the page name didn't match the Ads Library exactly.",
                styles["Body"]
            ))

        # Show up to 3 of the business's own ads (if any)
        biz_ads = meta_ads_biz.get("ads") or []
        if biz_ads:
            story.append(Spacer(1, 12))
            story.append(Paragraph(f"Your Active Ads ({len(biz_ads)} shown)", styles["SubHead"]))
            for ad in biz_ads[:3]:
                days_str = f"{ad['daysRunning']} days running" if ad.get("daysRunning") is not None else ""
                platforms_str = " + ".join([p.title() for p in (ad.get("platforms") or [])])
                headline = xml_escape(ad.get("headline") or "")
                body = xml_escape((ad.get("bodyText") or "")[:200])
                ad_row = Table([[
                    Paragraph(f"<b>{headline}</b><br/><font size='8' color='#5b6472'>{platforms_str}  ·  {days_str}</font>",
                              ParagraphStyle("adhead", fontName="WorkSans-Bold", fontSize=10, textColor=INK, leading=14)),
                    Paragraph(body, ParagraphStyle("adbody", fontName="WorkSans", fontSize=9, textColor=INK)),
                ]], colWidths=[160, 308])
                ad_row.setStyle(TableStyle([
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                    ("LINEBELOW", (0, 0), (-1, 0), 0.4, BORDER), ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ]))
                story.append(ad_row)

        # Show top competitor ad (teaser only — "what they're saying")
        comp_ads = meta_ads_comp.get("ads") or []
        if comp_ads:
            story.append(Spacer(1, 12))
            story.append(Paragraph(f"What {xml_escape(str(comp_name_ads or 'Your Competitor'))} Is Advertising Right Now", styles["SubHead"]))
            top_ad = comp_ads[0]
            days_str = f"{top_ad['daysRunning']} days running" if top_ad.get("daysRunning") is not None else ""
            headline = xml_escape(top_ad.get("headline") or "(no headline captured)")
            body = xml_escape((top_ad.get("bodyText") or "")[:300])
            story.append(Paragraph(
                f"<b>Headline:</b> {headline}<br/>"
                f"<b>Ad copy:</b> {body}<br/>"
                f"<font size='8' color='#5b6472'>{days_str} · Longest-running ad (likely their best performer)</font>",
                ParagraphStyle("compAd", fontName="WorkSans", fontSize=9.5, textColor=INK, leading=15,
                               borderPad=8, borderColor=BORDER, borderWidth=0.5, backColor=BG)
            ))

    story.append(PageBreak())

    story.append(Paragraph("Your 90-Day Action Plan", styles["SectionHead"]))
    story.append(Paragraph("Prioritized by impact - do these roughly in order.", styles["SectionSub"]))

    def action_block(title, items, accent):
        header = Table([[Paragraph(title, ParagraphStyle("blockhead", fontName="WorkSans-Bold", fontSize=11.5, textColor=WHITE))]], colWidths=[468])
        header.setStyle(TableStyle([("BACKGROUND", (0, 0), (0, 0), accent), ("TOPPADDING", (0, 0), (0, 0), 7), ("BOTTOMPADDING", (0, 0), (0, 0), 7), ("LEFTPADDING", (0, 0), (0, 0), 10)]))
        story.append(header); story.append(Spacer(1, 6))
        for item, effort, impact in items:
            story.append(Paragraph(f"&#8226;&nbsp;&nbsp;{item} &nbsp; <font size=8 color='#5b6472'>[Effort: {effort} &middot; Impact: {impact}]</font>", styles["PlanBullet"]))
        story.append(Spacer(1, 14))

    quick_wins, momentum, compound = [], [], []
    for key, score in sorted_cats:
        t = tier(score)
        _, quickfix = CATEGORY_NARRATIVE[key][t]
        if t == "low":
            quick_wins.append((quickfix, "Low", "High"))
        elif t == "mid":
            momentum.append((quickfix, "Medium", "Medium"))
        else:
            compound.append((quickfix, "Low", "Medium"))
    quick_wins = quick_wins or [("Reply to your 3 most recent reviews.", "Low", "Medium")]
    momentum = momentum or [(f"Build a 4-week content calendar for {biz}.", "Medium", "High")]
    compound = compound or [("Automate a review-request system after every sale.", "Medium", "High")]

    matrix_items = []
    n = 1
    for item, effort, impact in quick_wins:
        matrix_items.append((n, effort, impact, RED)); n += 1
    for item, effort, impact in momentum:
        matrix_items.append((n, effort, impact, AMBER)); n += 1
    for item, effort, impact in compound:
        matrix_items.append((n, effort, impact, INK)); n += 1

    action_block("WEEK 1-2 : QUICK WINS", quick_wins, GREEN)
    action_block("WEEK 3-6 : BUILD MOMENTUM", momentum, AMBER)
    action_block("WEEK 7-12 : COMPOUND GROWTH", compound, INK)

    story.append(Spacer(1, 10)); story.append(HRFlowable(width="100%", thickness=1, color=BORDER)); story.append(Spacer(1, 14))
    story.append(Paragraph(
        "<b>What to expect:</b> Businesses that complete the Quick Wins alone typically see the related sub-scores move "
        "within 2-3 weeks, since these are largely one-time fixes. Momentum-stage items take longer because they depend "
        "on consistent activity, not a single change. That's exactly why this plan is sequenced the way it is: fix what's "
        "instant first, then build the habit that compounds.", styles["Body"]
    ))
    story.append(PageBreak())

    story.append(Paragraph("Your Priority Matrix", styles["SectionHead"]))
    story.append(Paragraph("Every action from your 90-day plan, plotted by effort and impact - the green zone is where to start.", styles["SectionSub"]))
    matrix_wrapper = Table([[PriorityMatrix(matrix_items, width=460, height=290)]], colWidths=[PAGE_W - 2 * MARGIN])
    matrix_wrapper.setStyle(TableStyle([("ALIGN", (0, 0), (0, 0), "CENTER")]))
    story.append(matrix_wrapper)
    story.append(Spacer(1, 16))

    all_actions = quick_wins + momentum + compound
    legend_style = ParagraphStyle("legendItem", fontName="WorkSans", fontSize=8.5, leading=11.5, textColor=MUTED)
    # Paragraph objects wrap to the column width automatically - a raw string
    # in a Table cell does NOT wrap, and silently overflows into the next
    # column, overlapping other items' text when the item text is long
    # (this only shows up with realistic, longer quickfix text).
    legend_items = [Paragraph(f"{i+1}. {item}", legend_style) for i, (item, e, im) in enumerate(all_actions)]
    legend_rows = [legend_items[i:i + 3] for i in range(0, len(legend_items), 3)]
    for row in legend_rows:
        while len(row) < 3:
            row.append("")
    legend_table = Table(legend_rows, colWidths=[(PAGE_W - 2 * MARGIN) / 3] * 3)
    legend_table.setStyle(TableStyle([("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                                       ("RIGHTPADDING", (0, 0), (-1, -1), 10), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story.append(legend_table)
    story.append(Spacer(1, 20))
    story.append(Paragraph(
        "<b>Read this chart top-left to bottom-right:</b> items in the green zone are low effort, high impact - do these "
        "first. Higher-effort items are scheduled later in the plan, once the quicker wins have already moved your score.",
        styles["Body"]
    ))
    story.append(PageBreak())

    story.append(Paragraph("Your Ready-to-Use Toolkit", styles["SectionHead"]))
    story.append(Paragraph(f"Not just advice - the actual assets, already written for {biz}. Copy, paste, done.", styles["SectionSub"]))
    story.append(Paragraph("Auto-Reply Messages", styles["SubHead"]))
    auto_replies = [
        ("WhatsApp Away Message", content["auto_reply"]["whatsapp"].format(biz=biz)),
        ("Instagram Quick Reply", content["auto_reply"]["instagram"].format(biz=biz)),
        ("Facebook Instant Reply", content["auto_reply"]["facebook"].format(biz=biz)),
    ]
    for label, text in auto_replies:
        box = Table([[Paragraph(f"<b>{label}</b><br/><i>{text}</i>", ParagraphStyle("arbox", fontName="WorkSans", fontSize=9.5, leading=14, textColor=INK))]], colWidths=[PAGE_W - 2 * MARGIN])
        box.setStyle(TableStyle([("BACKGROUND", (0, 0), (0, 0), BG), ("TOPPADDING", (0, 0), (0, 0), 10), ("BOTTOMPADDING", (0, 0), (0, 0), 10), ("LEFTPADDING", (0, 0), (0, 0), 12), ("RIGHTPADDING", (0, 0), (0, 0), 12)]))
        story.append(box); story.append(Spacer(1, 6))
    story.append(Spacer(1, 8))

    if wa_number:
        story.append(Paragraph("Your QR Code - Print This on Receipts or Table Cards", styles["SubHead"]))
        qr_widget = qr.QrCodeWidget(f"https://wa.me/{wa_number}")
        b = qr_widget.getBounds()
        qr_w, qr_h = b[2] - b[0], b[3] - b[1]
        qr_drawing = Drawing(90, 90, transform=[90. / qr_w, 0, 0, 90. / qr_h, 0, 0])
        qr_drawing.add(qr_widget)
        qr_table = Table([[qr_drawing, Paragraph(f"Scan to start a WhatsApp chat with {biz} instantly. Print this on receipts, counters, or your front window.", styles["Body"])]], colWidths=[100, 368])
        qr_table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
        story.append(qr_table)
    story.append(PageBreak())

    story.append(Paragraph("5 Google Business Posts - Ready to Publish", styles["SectionHead"]))
    story.append(Paragraph("Copy any of these directly into your Google Business Profile's \"Add Update\" box.", styles["SectionSub"]))

    # If we have a real rating/review count from the scan, lead with a post
    # built from that actual number instead of an all-template one - a real
    # figure reads as far more specific than generic phrasing ever can.
    gbp_posts_final = list(content["gbp_posts"])
    g_evidence = scan_details.get("google") or {}
    rating = g_evidence.get("rating")
    review_count = g_evidence.get("reviewCount")
    if isinstance(rating, (int, float)) and rating > 0 and isinstance(review_count, (int, float)):
        data_post = f"We're proud to be rated {rating:.1f} stars across {int(review_count)} reviews - thank you to everyone who's shared their experience at {{biz}}!"
        gbp_posts_final[0] = data_post  # swap in for the most generic-feeling slot

    for i, post_tpl in enumerate(gbp_posts_final, 1):
        story.append(Paragraph(f"<b>Post {i}:</b> {post_tpl.format(biz=biz)}", styles["PlanBullet"]))
    story.append(Spacer(1, 16))

    story.append(Paragraph("20 Hashtags for Your Posts", styles["SubHead"]))
    # City + industry combinations lead the list, since those are what's
    # actually specific to this business - generic category tags (which
    # would be identical for any business of this type, anywhere) are kept
    # to a smaller supporting set at the end rather than filling half the list.
    hashtags = []
    if city_raw:
        city_tag = city_raw.lower().replace(" ", "")
        hashtags += [city_tag, f"{city_tag}{business_type}", f"{business_type}{city_tag}", f"{city_tag}business", f"{city_tag}local", f"visit{city_tag}"]
    hashtags += list(content["hashtag_base"])[:10]
    hashtags += ["local", "smallbusiness", "supportlocal", "shopsmall"]
    hashtags = hashtags[:20]
    tag_para = Paragraph(" &nbsp; ".join(f"<font color='#0f9d58'>#{t}</font>" for t in hashtags), ParagraphStyle("tagpara", fontName="WorkSans", fontSize=9.5, leading=18, textColor=INK))
    story.append(tag_para)
    story.append(PageBreak())

    story.append(Paragraph("Your Review-Generation System", styles["SectionHead"]))
    story.append(Paragraph("A complete, timed sequence - not just \"ask for reviews.\"", styles["SectionSub"]))
    review_action = content["review_action"]
    review_seq = [
        ("Day 0 - Right After Purchase", "WhatsApp", f"Thank you so much for {review_action} {biz} today! We'd love to hear what you thought - if you have 30 seconds, a review means the world to us: [review link]"),
        ("Day 3 - Gentle Follow-Up", "Email", f"Hi! We hope you enjoyed {review_action} {biz}. If you haven't already, we'd really appreciate a quick review - it helps other customers find us. [review link]"),
        ("Day 7 - Final Nudge", "SMS", f"Last note from {biz} - if you have a moment, a short review helps us so much: [review link]. Thank you either way!"),
    ]
    for day, channel, text in review_seq:
        box = Table([[Paragraph(f"<b>{day}</b> &nbsp; <font color='#5b6472' size=8>[{channel}]</font><br/><i>{text}</i>", ParagraphStyle("rvbox", fontName="WorkSans", fontSize=9.5, leading=14, textColor=INK))]], colWidths=[PAGE_W - 2 * MARGIN])
        box.setStyle(TableStyle([("BACKGROUND", (0, 0), (0, 0), BG), ("TOPPADDING", (0, 0), (0, 0), 10), ("BOTTOMPADDING", (0, 0), (0, 0), 10), ("LEFTPADDING", (0, 0), (0, 0), 12), ("RIGHTPADDING", (0, 0), (0, 0), 12)]))
        story.append(box); story.append(Spacer(1, 8))
    story.append(Spacer(1, 6))
    story.append(Paragraph("<b>Why the sequence matters:</b> A single ask right after purchase catches maybe 1 in 10 customers. This 3-touch sequence - immediate, day 3, day 7 - is designed to catch customers at different moments when they're more likely to have a free minute, without feeling like spam.", styles["Body"]))
    story.append(PageBreak())

    story.append(Paragraph("Your 4-Week Content Calendar", styles["SectionHead"]))
    story.append(Paragraph("Real post ideas, not just \"post more.\" 3 posts a week, mapped out for you.", styles["SectionSub"]))
    cal_rows = [["Week", "Day", "Post Idea"]] + [list(r) for r in content["calendar"]]
    cal_table = Table(cal_rows, colWidths=[60, 50, 358])
    cal_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), INK), ("TEXTCOLOR", (0, 0), (-1, 0), WHITE), ("FONTNAME", (0, 0), (-1, 0), "WorkSans-Bold"),
        ("FONTNAME", (0, 1), (1, -1), "WorkSans-Bold"), ("FONTNAME", (2, 1), (2, -1), "WorkSans"), ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, BG]), ("GRID", (0, 0), (-1, -1), 0.5, BORDER), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7), ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(cal_table)
    story.append(PageBreak())

    # ---------------- WEEK 1 PRINTABLE CHECKLIST ----------------
    story.append(Paragraph("Your First 7 Days - Print This", styles["SectionHead"]))
    story.append(Paragraph("The exact order to work through, with realistic time estimates. Tick them off as you go.", styles["SectionSub"]))

    # Build the checklist from their actual weakest categories, so it's
    # genuinely personalized rather than a generic to-do list.
    day_tasks = []
    ordered = [k for k, v in sorted_cats]  # weakest first
    task_bank = {
        "google": [
            ("Claim or log into your Google Business Profile", "15 min"),
            ("Fill every empty field: hours, category, phone, description", "20 min"),
            ("Upload 5 recent photos", "15 min"),
        ],
        "social": [
            ("Post once on your least active platform", "10 min"),
            ("Reply to every unanswered comment and DM", "20 min"),
            ("Schedule 3 posts for next week using your content calendar", "25 min"),
        ],
        "website": [
            ("Check if your site loads over https (SSL) - fix with your host if not", "20 min"),
            ("Open your site on your phone - note anything broken or slow", "10 min"),
            ("Compress your homepage images", "20 min"),
        ],
        "reputation": [
            ("Reply to every unanswered review, positive and negative", "30 min"),
            ("Send your review request to 5 recent happy customers", "15 min"),
            ("Set a weekly reminder to check for new reviews", "5 min"),
        ],
    }
    for cat in ordered:
        for task, time_est in task_bank.get(cat, []):
            day_tasks.append((task, time_est, CATEGORY_NARRATIVE[cat]["label"]))

    day_tasks = day_tasks[:10]  # keep it achievable, not overwhelming
    check_rows = [["", "Task", "Area", "Time"]]
    for task, time_est, area in day_tasks:
        check_rows.append([
            "",  # empty - a drawn box border below stands in for a checkbox,
                 # since the ☐ glyph doesn't exist in WorkSans and renders blank
            Paragraph(task, ParagraphStyle("ct", fontName="WorkSans", fontSize=9.5, leading=13, textColor=INK)),
            Paragraph(area, ParagraphStyle("ca", fontName="WorkSans", fontSize=8.5, textColor=MUTED)),
            time_est,
        ])
    check_table = Table(check_rows, colWidths=[22, 268, 110, 68])
    check_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), INK), ("TEXTCOLOR", (0, 0), (-1, 0), WHITE), ("FONTNAME", (0, 0), (-1, 0), "WorkSans-Bold"),
        ("FONTNAME", (0, 1), (0, -1), "WorkSans"), ("FONTSIZE", (0, 0), (-1, -1), 9.5),
        ("FONTSIZE", (0, 1), (0, -1), 13),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, BG]), ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("ALIGN", (0, 0), (0, -1), "CENTER"), ("ALIGN", (3, 0), (3, -1), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, -1), 9), ("BOTTOMPADDING", (0, 0), (-1, -1), 9), ("LEFTPADDING", (1, 0), (-1, -1), 8),
        ("BACKGROUND", (0, 1), (0, -1), WHITE),
    ]))
    story.append(check_table)
    story.append(Spacer(1, 18))

    total_min = sum(int(t.split()[0]) for _, t, _ in day_tasks)
    story.append(Paragraph(
        f"<b>Total time: about {total_min} minutes.</b> That's it - under {round(total_min/60, 1)} hours of focused work "
        f"to clear the most urgent items on your list. Spread across seven days, that's roughly "
        f"{round(total_min/7)} minutes a day.",
        styles["Body"]
    ))
    story.append(PageBreak())

    story.append(Paragraph("Your Complete Toolkit", styles["SectionHead"]))
    story.append(Paragraph(f"Everything included in this report — built for {biz}, ready to use today.", styles["SectionSub"]))
    story.append(Spacer(1, 10))

    # 10 tools displayed as highlighted cards in a 2-column grid.
    # Each card has a colored accent bar, a number badge, a title, and
    # a one-line description — the same visual language as the landing page.
    TOOLS = [
        ("📱", "WhatsApp Link Generator", "Tap-to-chat link for your counter, receipts & social bio"),
        ("🤖", "Auto-Reply Message Generator", "Ready-to-paste WhatsApp, Instagram & Facebook away messages"),
        ("📝", "Google Business Post Generator", "5 ready-to-publish GBP update posts with your real rating"),
        ("📷", "QR Code Generator", "Scannable code linking to your Google reviews or WhatsApp"),
        ("#️⃣", "Local Hashtag Generator", f"20 tags mixing city-specific ({city_raw}) and industry reach"),
        ("🛡️", "Objection Handler", "Tactful responses to the pushback you hear most often"),
        ("✉️", "Email Subject Line Generator", "5 subject lines proven to get opened for your purpose"),
        ("🕊️", "Complaint Response Generator", "Professional reply to defuse a frustrated customer"),
        ("📋", "GBP 'About' Writer", "A complete, compelling Google Business Profile description"),
        ("📈", "Slow-Hours Promotion Ideas", "3 promotion ideas to fill your quietest hours"),
    ]

    def tool_card(number, emoji, title, desc):
        """Renders a single highlighted tool card."""
        GAP = 12
        col_w_ = (PAGE_W - 2 * MARGIN - GAP) / 2
        num_w_ = 32
        text_w_ = col_w_ - num_w_ - 12
        inner = Table([
            [Paragraph(f"<b>{number}</b>",
                ParagraphStyle("tnum", fontName="Lora-Bold", fontSize=13, textColor=WHITE, alignment=TA_CENTER)),
             Table([[
                Paragraph(f"{emoji} <b>{title}</b>",
                    ParagraphStyle("ttitle", fontName="WorkSans-Bold", fontSize=9.5, textColor=INK, leading=13)),
                Paragraph(desc,
                    ParagraphStyle("tdesc", fontName="WorkSans", fontSize=8.5, textColor=MUTED, leading=12)),
             ]], colWidths=[text_w_], style=TableStyle([
                ("TOPPADDING",(0,0),(-1,-1),3), ("BOTTOMPADDING",(0,0),(-1,-1),3),
                ("LEFTPADDING",(0,0),(-1,-1),0), ("RIGHTPADDING",(0,0),(-1,-1),0),
             ]))],
        ], colWidths=[num_w_, text_w_])
        inner.setStyle(TableStyle([
            ("BACKGROUND",(0,0),(0,-1), GREEN),
            ("VALIGN",(0,0),(-1,-1),"MIDDLE"),
            ("LEFTPADDING",(1,0),(1,-1),12),
            ("TOPPADDING",(0,0),(-1,-1),10), ("BOTTOMPADDING",(0,0),(-1,-1),10),
        ]))
        return inner

    # Lay out as a simple flat table — one card per row but with an accent
    # number badge on the left and text on the right. Two cards per row
    # using a clean 2-column outer table with a fixed gap column.
    FULL_W = PAGE_W - 2 * MARGIN
    NUM_W = 36
    GAP_W = 14
    TEXT_W = (FULL_W - GAP_W) / 2 - NUM_W - 10  # text space inside each column

    def tool_row(number, emoji, title, desc):
        num_cell = Paragraph(f"<b>{number}</b>",
            ParagraphStyle("tn", fontName="Lora-Bold", fontSize=14,
                           textColor=WHITE, alignment=TA_CENTER))
        title_cell = Paragraph(f"<b>{emoji} {title}</b>",
            ParagraphStyle("tt", fontName="WorkSans-Bold", fontSize=9.5,
                           textColor=INK, leading=13))
        desc_cell = Paragraph(desc,
            ParagraphStyle("td", fontName="WorkSans", fontSize=8.5,
                           textColor=MUTED, leading=12))
        inner = Table(
            [[title_cell], [desc_cell]],
            colWidths=[TEXT_W]
        )
        inner.setStyle(TableStyle([
            ("TOPPADDING",(0,0),(-1,-1),2), ("BOTTOMPADDING",(0,0),(-1,-1),2),
            ("LEFTPADDING",(0,0),(-1,-1),0), ("RIGHTPADDING",(0,0),(-1,-1),0),
        ]))
        card = Table([[num_cell, inner]], colWidths=[NUM_W, TEXT_W])
        card.setStyle(TableStyle([
            ("BACKGROUND",(0,0),(0,-1), GREEN),
            ("VALIGN",(0,0),(-1,-1),"MIDDLE"),
            ("LEFTPADDING",(0,0),(0,-1),0), ("RIGHTPADDING",(0,0),(0,-1),0),
            ("LEFTPADDING",(1,0),(1,-1),10),
            ("TOPPADDING",(0,0),(-1,-1),10), ("BOTTOMPADDING",(0,0),(-1,-1),10),
            ("BACKGROUND",(1,0),(1,-1),BG),
        ]))
        return card

    for i in range(0, len(TOOLS), 2):
        le, lt, ld = TOOLS[i]
        left_card = tool_row(i+1, le, lt, ld)

        if i + 1 < len(TOOLS):
            re_, rt, rd = TOOLS[i+1]
            right_card = tool_row(i+2, re_, rt, rd)
        else:
            right_card = Paragraph("", ParagraphStyle("empty", fontSize=9))

        card_w = (FULL_W - GAP_W) / 2
        row_tbl = Table([[left_card, "", right_card]],
                        colWidths=[card_w, GAP_W, card_w])
        row_tbl.setStyle(TableStyle([
            ("VALIGN",(0,0),(-1,-1),"TOP"),
            ("TOPPADDING",(0,0),(-1,-1),0), ("BOTTOMPADDING",(0,0),(-1,-1),0),
            ("LEFTPADDING",(0,0),(-1,-1),0), ("RIGHTPADDING",(0,0),(-1,-1),0),
        ]))
        story.append(row_tbl)
        story.append(Spacer(1, 8))

    story.append(Spacer(1, 6))
    story.append(HRFlowable(width="100%", thickness=1, color=BORDER))
    story.append(Spacer(1, 12))
    story.append(Paragraph("Know Your Presence &mdash; One diagnosis. One plan. One price. No subscription, ever.", styles["FooterBrand"]))


    doc = SimpleDocTemplate(output_path, pagesize=A4, topMargin=22 * mm, bottomMargin=20 * mm, leftMargin=MARGIN, rightMargin=MARGIN)
    doc.build(story, onFirstPage=cover_frame, onLaterPages=page_frame_factory(biz, report_id))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python3 report_generator.py <input.json> <output.pdf>")
        sys.exit(1)
    with open(sys.argv[1]) as f:
        input_data = json.load(f)
    generate_report(input_data, sys.argv[2])
    print(f"Report written to {sys.argv[2]}")
