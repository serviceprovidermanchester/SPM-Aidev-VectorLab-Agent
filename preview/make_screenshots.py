#!/usr/bin/env python3
"""Renders a PNG of every console view of VectorLab at desktop 1440x900
into ../screenshots/. The drawings replicate the console's real design
system (web/styles.css): charcoal #111827 header, emerald #10B981 accent,
#F2F7F4 page background, monospace data type — with the showcase
workspace's seeded data (Manchester Business Help Centre) and its real
engine results from preview/shot-config.json."""
import json, os
from PIL import Image, ImageDraw, ImageFont
W, H = 1440, 900
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "screenshots")
os.makedirs(OUT, exist_ok=True)
CFG = json.loads(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "shot-config.json")).read())
def hx(h): h = h.lstrip("#"); return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
BRAND = hx(CFG["header"]); ACCENT = hx(CFG["accent"]); BG = hx(CFG["bg"])
WHITE = (255, 255, 255); INK = (28, 39, 51); MUTED = (95, 114, 104); LINE = (216, 229, 220)
EMERALD_INK = (5, 46, 34); GOOD = (4, 120, 87)
FD = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"; FB = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FM = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"; FMB = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"
def F(s, b=False, mono=False):
    return ImageFont.truetype((FMB if b else FM) if mono else (FB if b else FD), int(s))
def wrap(d, t, f, mw):
    ws, lines, cur = str(t).split(), [], ""
    for w in ws:
        tt = (cur + " " + w).strip()
        if d.textlength(tt, font=f) <= mw: cur = tt
        elif cur: lines.append(cur); cur = w
    if cur: lines.append(cur)
    return lines
NAV = ["Dashboard", "Collections", "Search Lab", "Clustering", "Inspector", "Methods"]
class Page:
    def __init__(self, title, active=""):
        self.img = Image.new("RGB", (W, H), BG); self.d = ImageDraw.Draw(self.img)
        d = self.d
        d.rectangle([0, 0, W, 64], fill=BRAND)
        d.text((28, 20), CFG["name"] + "_", font=F(20, True, mono=True), fill=WHITE)
        x = 268
        for n in NAV:
            col = ACCENT if n == active else (229, 231, 235)
            d.text((x, 25), n, font=F(12.5, n == active), fill=col); x += d.textlength(n, font=F(12.5)) + 18
        d.text((W - 28, 24), CFG["owner"] + " · " + CFG["business"], font=F(11.5), fill=WHITE, anchor="ra")
        d.rectangle([0, 64, W, 96], fill=ACCENT)
        d.text((W // 2, 72), CFG["name"] + " — " + CFG["tagline"].lower() + " · " + CFG["business"] + ", " + CFG["location"],
               font=F(12, True, mono=True), fill=EMERALD_INK, anchor="ma")
        self.y = 128
        d.text((40, self.y), title, font=F(27, True), fill=INK); self.y += 48
    def save(self, name): self.img.save(os.path.join(OUT, name)); print("wrote", name)
    def card(self, x, y, w, h, fill=WHITE):
        self.d.rounded_rectangle([x, y, x + w, y + h], 14, fill=fill, outline=LINE, width=1)
    def text(self, x, y, s, size=14, bold=False, color=INK, mono=False):
        self.d.text((x, y), str(s), font=F(size, bold, mono), fill=color)
    def para(self, x, y, s, size=13, color=MUTED, maxw=520, lh=19):
        for ln in wrap(self.d, s, F(size), maxw): self.d.text((x, y), ln, font=F(size), fill=color); y += lh
        return y
    def pill(self, x, y, label, accent=False):
        fill = (236, 253, 245) if accent else BG
        w = self.d.textlength(label, font=F(11, True, mono=True)) + 20
        self.d.rounded_rectangle([x, y, x + w, y + 24], 12, fill=fill, outline=LINE)
        self.d.text((x + 10, y + 5), label, font=F(11, True, mono=True), fill=GOOD if accent else BRAND); return x + w + 8
    def btn(self, x, y, label, accent=False, w=None):
        w = w or (self.d.textlength(label, font=F(13.5, True)) + 34)
        self.d.rounded_rectangle([x, y, x + w, y + 38], 10, fill=ACCENT if accent else BRAND)
        self.d.text((x + w / 2, y + 10), label, font=F(13.5, True), fill=EMERALD_INK if accent else WHITE, anchor="ma")
        return x + w + 10
    def field(self, x, y, label, value, w=560):
        self.text(x, y, label.upper(), 11, True, MUTED)
        self.d.rounded_rectangle([x, y + 20, x + w, y + 58], 9, outline=LINE)
        self.text(x + 12, y + 30, value, 13)
        return y + 74
    def table(self, x, y, cols, rows, widths, mono_cols=()):
        d = self.d; cx = x
        for h, wd in zip(cols, widths): d.text((cx, y), h.upper(), font=F(11, True), fill=MUTED); cx += wd
        y += 24; d.line([x, y, x + sum(widths), y], fill=BRAND, width=2); y += 10
        for row in rows:
            cx = x; lines = 1
            for ci, (v, wd) in enumerate(zip(row, widths)):
                f = F(12.5, mono=ci in mono_cols)
                ls = wrap(d, str(v), f, wd - 12); lines = max(lines, len(ls))
                for j, ln in enumerate(ls): d.text((cx, y + j * 17), ln, font=f, fill=INK)
                cx += wd
            y += 17 * lines + 13; d.line([x, y - 6, x + sum(widths), y - 6], fill=LINE, width=1)
        return y
    def gauge(self, x, y, w, frac):
        self.d.rounded_rectangle([x, y, x + w, y + 14], 7, fill=(220, 233, 225))
        self.d.rounded_rectangle([x, y, x + max(14, int(w * frac)), y + 14], 7, fill=ACCENT)

def dashboard():
    p = Page(CFG["business"], "Dashboard"); s = CFG["stats"]; lc = CFG["latestCluster"]
    p.card(40, p.y, 1360, 150, fill=BRAND)
    p.text(64, p.y + 16, CFG["business"], 23, True, WHITE)
    p.text(64, p.y + 52, "Content & Search Team · " + CFG["location"] + " — how similar is similar, measured exactly.", 13, False, (209, 213, 219))
    p.text(64, p.y + 82, lc["purity"], 34, True, ACCENT, mono=True)
    p.text(300, p.y + 96, "Latest cluster purity · run " + lc["ref"] + " · k=" + str(lc["k"]) +
           " · silhouette " + lc["silhouette"] + " · inertia " + lc["inertia"], 12.5, False, (209, 213, 219), mono=True)
    y = p.y + 174; x = 40
    for v, l in [(str(s["collections"]), "Collections"), (str(s["documents"]), "Documents"),
                 (str(s["searches"]), "Search runs"), (str(s["clusterRuns"]), "Cluster runs")]:
        p.card(x, y, 322, 104); p.text(x + 18, y + 14, v, 28, True, BRAND, mono=True); p.text(x + 18, y + 58, l, 13, False, MUTED); x += 340
    y += 128; ls = CFG["latestSearch"]
    p.text(40, y, "Latest search", 19, True); y += 36
    p.card(40, y, 1360, 62)
    p.pill(58, y + 19, "tfidf", accent=True)
    p.text(150, y + 20, ls["query"], 13.5, True)
    p.text(430, y + 20, str(ls["hits"]) + " scored matches · top hit: " + ls["topTitle"] + " at " + ls["topScore"], 12.5, False, MUTED, mono=True)
    y += 84; p.text(40, y, "Recent activity", 19, True); y += 38
    p.card(40, y, 1360, 190)
    p.table(64, y + 18, ["Run", "Type", "Detail"],
            [[ls["ref"], "search", '"' + ls["query"] + '" · ' + str(ls["hits"]) + " hits"],
             ["SRC-1F293C", "search", '"dental check-up appointment" · 5 hits'],
             [lc["ref"], "cluster", "k=" + str(lc["k"]) + " · silhouette " + lc["silhouette"] + " · purity " + lc["purity"]],
             ["CLU-86F4AC", "cluster", "k=4 · silhouette 0.042 · purity 0.94"]],
            [240, 140, 700], mono_cols=(0,))
    return p
def collections():
    p = Page("Collections", "Collections")
    p.card(40, p.y, 1360, 118)
    p.text(64, p.y + 16, "New collection", 16.5, True)
    y2 = p.field(64, p.y + 46, "Name", "e.g. Product Help Articles", 560)
    p.btn(660, p.y + 62, "Create collection", accent=True)
    y = p.y + 142
    for name, count, topics in CFG["collections"]:
        p.card(40, y, 1360, 96)
        p.text(64, y + 14, name, 17, True)
        p.pill(64, y + 52, count, accent=True)
        p.text(230, y + 56, topics, 12.5, False, MUTED)
        y += 112
    return p
def collection_detail():
    p = Page("Business Help Articles", "Collections")
    p.para(40, p.y, "Sixteen help articles across dental, food, fitness and property topics, written by the showcase content team.", 13.5, MUTED, 1150); p.y += 26
    p.card(40, p.y, 1360, 560)
    p.table(64, p.y + 18, ["Document", "Topic", "Tokens"],
            [list(r) for r in CFG["mainDocs"]], [640, 320, 120], mono_cols=(2,))
    return p
def document_detail():
    d = CFG["docDetail"]; p = Page(d["title"], "Collections")
    p.text(40, p.y - 14, "topic: " + d["topic"] + " · " + str(d["tokens"]) + " tokens · body text is what gets vectorised", 12.5, False, MUTED, mono=True)
    y = p.y + 14
    p.card(40, y, 656, 300)
    p.text(64, y + 14, "TF-IDF vector — " + str(d["dims"]) + " dimensions (top terms)", 15, True)
    p.table(64, y + 48, ["Term", "Weight"], [list(r) for r in d["tfidf"]], [300, 160], mono_cols=(1,))
    p.card(744, y, 656, 300)
    p.text(768, y + 14, "Hashed vector — 64 buckets (top buckets)", 15, True)
    p.table(768, y + 48, ["Bucket", "Tokens landing here", "Weight"], [list(r) for r in d["hashed"]], [90, 300, 110], mono_cols=(0, 2))
    y += 324
    p.card(40, y, 1360, 110)
    p.text(64, y + 14, "Why two views of the same text?", 15.5, True)
    p.para(64, y + 44, "TF-IDF keeps every term separate and weights rare terms highest, so its rankings can be explained term by term. The hashed vector folds every token into 64 buckets — compact, but distinct tokens share buckets (bucket 38 holds an, examination and and), which mixes their weights.", 12.5, MUTED, 1280, 18)
    return p
def search_lab():
    p = Page("Search Lab", "Search Lab")
    p.card(40, p.y, 1360, 268)
    p.text(64, p.y + 16, "Run a cosine search", 16.5, True)
    y = p.field(64, p.y + 48, "Collection", "Topic Check Set (9 docs)", 620)
    y = p.field(64, y, "Query text", "dentist implant", 620)
    p.field(716, p.y + 48, "Vectoriser", "TF-IDF", 300)
    p.btn(64, p.y + 216, "Search", accent=True)
    y = p.y + 292; p.text(40, y, "Search history", 20, True); y += 38
    p.card(40, y, 1360, 170)
    p.table(64, y + 18, ["Reference", "Query", "Method", "Hits"],
            [list(r) for r in CFG["searchHistory"]], [240, 480, 160, 120], mono_cols=(0, 3))
    return p
def search_results():
    s = CFG["fixtureSearch"]; p = Page("Search Results", "Search Lab")
    p.para(40, p.y, "tfidf · \"" + s["query"] + "\" over " + s["collection"] + " · run " + s["ref"] +
           " · 3 scored matches · 6 documents at cosine 0", 13, MUTED, 1200); p.y += 28
    y = p.y
    for title, topic, score, parts in s["hits"]:
        h = 62 + 30 * len(parts)
        p.card(40, y, 1360, h)
        p.text(64, y + 14, title, 15, True)
        p.pill(64 + p.d.textlength(title, font=F(15, True)) + 16, y + 14, topic, accent=True)
        p.text(1290, y + 14, score, 16, True, BRAND, mono=True)
        p.gauge(64, y + 44, 500, float(score))
        rows = [[t, qw, dw, c] for t, qw, dw, c in parts]
        p.table(700, y + 12, ["Shared term", "Query w", "Doc w", "Contributes"], rows, [170, 110, 110, 130], mono_cols=(1, 2, 3))
        y += h + 14
    p.text(40, y + 4, "The contributions sum to the score — that sum is the whole explanation.", 12.5, False, MUTED)
    return p
def clustering_lab():
    p = Page("Clustering Lab", "Clustering")
    p.card(40, p.y, 1360, 240)
    p.text(64, p.y + 16, "Run deterministic k-means", 16.5, True)
    p.para(64, p.y + 48, "Initial centroids are the first k documents of the collection, in stored order — no random seed, so the same collection and k always give the same run.", 13, MUTED, 1150)
    p.field(64, p.y + 96, "Collection", "Topic Check Set (9 docs)", 620)
    p.field(716, p.y + 96, "k (clusters)", "3", 200)
    p.btn(64, p.y + 182, "Run clustering", accent=True)
    y = p.y + 264; p.text(40, y, "Run history", 20, True); y += 38
    p.card(40, y, 1360, 170)
    p.table(64, y + 18, ["Reference", "Method", "k", "Inertia", "Silhouette", "Purity"],
            [list(r) for r in CFG["clusterHistory"]], [220, 140, 80, 160, 180, 140], mono_cols=(0, 2, 3, 4, 5))
    return p
def cluster_detail():
    c = CFG["fixtureCluster"]; p = Page("Cluster Run " + c["ref"], "Clustering")
    x = 40
    for v, l in [(c["inertia"], "Final inertia"), (c["silhouette"], "Silhouette score"), (c["purity"], "Purity vs topic labels"), (str(c["iterations"]), "Lloyd iterations")]:
        p.card(x, p.y, 322, 88); p.text(x + 18, p.y + 12, v, 26, True, BRAND, mono=True); p.text(x + 18, p.y + 52, l, 12.5, False, MUTED); x += 340
    y = p.y + 108
    p.card(40, y, 1360, 50)
    p.text(64, y + 16, "Inertia trace (must never rise):  " + c["trace"], 13, True, BRAND, mono=True)
    y += 64
    for title, terms, rows in c["clusters"]:
        p.card(40, y, 1360, 176)
        p.text(64, y + 10, title, 15, True)
        p.text(64, y + 34, "Top terms: " + terms, 12.5, False, MUTED, mono=True)
        p.table(64, y + 54, ["Document", "Topic", "Distance"], [list(r) for r in rows], [560, 240, 180], mono_cols=(2,))
        y += 180
    return p
def compare():
    c = CFG["compare"]; p = Page("Vector Inspector", "Inspector")
    p.card(40, p.y, 1360, 196)
    p.text(64, p.y + 16, "Compare two documents", 16.5, True)
    p.para(64, p.y + 48, "Vectors are only comparable inside one collection — each collection has its own vocabulary and idf table. Cross-collection comparisons are refused by the API.", 13, MUTED, 1150)
    p.field(64, p.y + 96, "Document A", c["a"], 400)
    p.field(500, p.y + 96, "Document B", c["b"], 400)
    p.btn(940, p.y + 116, "Compare", accent=True)
    y = p.y + 220
    p.card(40, y, 1360, 76, fill=(236, 253, 245))
    p.text(64, y + 16, "Cosine similarity: " + c["score"], 17, True, BRAND, mono=True)
    p.text(64, y + 46, "shared terms: " + c["shared"], 12.5, False, MUTED, mono=True)
    y += 100; p.text(40, y, "Saved comparisons", 19, True); y += 36
    p.card(40, y, 1360, 120)
    p.table(64, y + 18, ["Document A", "Document B", "Method", "Cosine", "Shared terms"],
            [list(r) for r in c["saved"]], [380, 380, 120, 110, 230], mono_cols=(3,))
    return p
def methods():
    p = Page("Methods & Help", "Methods")
    p.card(40, p.y, 1360, 330)
    p.text(64, p.y + 14, "Vocabulary explorer — Business Help Articles (TF-IDF, 312 terms over 16 documents)", 15.5, True)
    p.table(64, p.y + 48, ["Term", "Documents", "idf"], [list(r) for r in CFG["vocab"][:8]], [300, 160, 160], mono_cols=(1, 2))
    y = p.y + 354
    cards = [("How TF-IDF search works", "Each term's weight is its count in the document times idf = ln((1+N)/(1+df)) + 1. Vectors are L2-normalised, so cosine similarity is a dot product — and every score breaks down into per-term contributions that sum to the score itself. Rare terms (idf near 3.14 here) outweigh common ones (and, in all 16 documents, has idf exactly 1.0)."),
             ("How clustering works", "Deterministic k-means: the first k documents seed the centroids, Lloyd iterations alternate nearest-centroid assignment and mean updates, and the inertia trace never rises. Quality is a silhouette score (standard formula, Euclidean) plus purity against topic labels where documents carry them."),
             ("About the data", "All collections are seeded local data for a fictional Manchester content team. The vector mathematics is real and runs locally with no external API keys; in production the same interfaces sit in front of hosted embedding models and a vector database.")]
    for t, b in cards:
        p.card(40, y, 1240, 104); p.text(62, y + 12, t, 15, True); p.para(62, y + 40, b, 12, MUTED, 1180, 17); y += 116
    return p

dashboard().save("01-dashboard.png")
collections().save("02-collections.png")
collection_detail().save("03-collection-detail.png")
document_detail().save("04-document-detail.png")
search_lab().save("05-search-lab.png")
search_results().save("06-search-results.png")
clustering_lab().save("07-clustering-lab.png")
cluster_detail().save("08-cluster-detail.png")
compare().save("09-vector-inspector.png")
methods().save("10-methods-help.png")
print("10 screenshots written")
