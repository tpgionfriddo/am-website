#!/usr/bin/env python3
"""Mirror the latest Wayback Machine capture of architecturematters.com.au.

Downloads raw HTML (id_ = no Wayback toolbar/rewrite) for every real page, the
WordPress REST JSON for pages/posts/projects/taxonomies, theme CSS/JS, and the
largest available version of every image under /wp-content/uploads/.

Resumable: skips files that already exist. Polite: ~1 req/s with backoff.
Usage: python3 scripts/wayback-mirror.py   (run from site/)
"""
import json, os, re, sys, time, urllib.request, urllib.error
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote

OUT = "archive"
HOST_RE = re.compile(r"^https?://(www\.)?architecturematters\.com\.au(:80)?", re.I)
UA = "Mozilla/5.0 (site-recovery for architecturematters.com.au owner)"
log = open(os.path.join(OUT, "mirror.log"), "a")

def say(*a):
    msg = " ".join(str(x) for x in a)
    print(msg, flush=True); log.write(msg + "\n"); log.flush()

def fetch(url, tries=6):
    delay = 2
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=90) as r:
                data = r.read()
            time.sleep(1.0)
            return data
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            say(f"  HTTP {e.code} (try {i+1}) {url}")
        except Exception as e:
            say(f"  ERR {e!r} (try {i+1}) {url}")
        time.sleep(delay); delay = min(delay * 2, 120)
    return None

def save(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f: f.write(data)

def wb(ts, original):
    return f"https://web.archive.org/web/{ts}id_/{original}"

# Last capture known to be clean (the site was hacked after this).
CUTOFF = "20260801000000"
# Projects still linked from the 2022+ site but only archived with the old theme.
LEGACY = {"/project/essendon-residence/", "/project/fitzroy-town-hall-universal-access-portal/",
          "/project/red-hill-residence/"}

# cdx.json: one (earliest) row per URL, all time. cdx-2022.json: every capture since 2022.
rows = json.load(open(os.path.join(OUT, "cdx.json")))[1:]
rows += json.load(open(os.path.join(OUT, "cdx-2022.json")))[1:]
latest = {}  # normalised path -> (ts, original, mime)  -- latest capture <= CUTOFF
for original, ts, status, mime in rows:
    if ts > CUTOFF or status != "200": continue
    p = HOST_RE.sub("", original).split("#")[0] or "/"
    key = p.lower()
    if mime == "text/html" and "?" not in key: key = key.rstrip("/") + "/"
    if key not in latest or ts > latest[key][0]:
        latest[key] = (ts, original, mime)
json.dump({k: v[0] for k, v in latest.items()}, open(os.path.join(OUT, "capture-timestamps.json"), "w"), indent=0, sort_keys=True)

# ---------- 1. HTML pages ----------
pages = {}
for key, (ts, original, mime) in latest.items():
    if mime != "text/html" or (ts < "20221101" and key not in LEGACY): continue
    if "?" in key or key.startswith(("/wp-", "/feed", "/comments")) or "/feed" in key or "/embed" in key or "xmlrpc" in key:
        continue
    pages[key.rstrip("/") + "/"] = (ts, original)
say(f"{len(pages)} html pages")
html_files = []
for p, (ts, original) in sorted(pages.items()):
    dest = os.path.join(OUT, "html", p.strip("/") or "_home", "index.html")
    html_files.append(dest)
    if os.path.exists(dest): continue
    data = fetch(wb(ts, original))
    if data: save(dest, data); say("html", p, ts)
    else: say("MISSING html", p)

# ---------- 2. REST JSON ----------
for key, (ts, original, mime) in latest.items():
    if mime != "application/json" or not key.startswith("/wp-json/wp/v2/"): continue
    rel = key.split("?")[0].replace("/wp-json/wp/v2/", "").strip("/")
    dest = os.path.join(OUT, "json", rel + ".json")
    if os.path.exists(dest): continue
    data = fetch(wb(ts, original))
    if data: save(dest, data); say("json", rel, ts)

# ---------- 3. Theme assets ----------
for key, (ts, original, mime) in latest.items():
    if "/wp-content/themes/rarchitecture/" not in key: continue
    rel = urlsplit(key).path.split("/wp-content/themes/rarchitecture/")[1]
    dest = os.path.join(OUT, "theme", rel)
    if os.path.exists(dest) or rel.endswith("/"): continue
    data = fetch(wb(ts, original))
    if data: save(dest, data); say("theme", rel)

# ---------- 4. Uploads referenced by pages / JSON ----------
UP_RE = re.compile(r"(?:https?:)?(?://(?:www\.)?architecturematters\.com\.au)?(/wp-content/uploads/[^\s\"'()<>,]+?\.(?:jpe?g|png|gif|webp|svg|pdf|mp4))", re.I)
SIZE_RE = re.compile(r"-(\d+)x(\d+)(\.\w+)$")
refs = set()
for root, _, files in os.walk(OUT):
    for fn in files:
        if fn.endswith((".html", ".json", ".css")):
            txt = open(os.path.join(root, fn), encoding="utf-8", errors="ignore").read().replace("\\/", "/")
            refs.update(unquote(m) for m in UP_RE.findall(txt))
# group size variants under their original
groups = {}
for r in refs:
    m = SIZE_RE.search(r)
    base = SIZE_RE.sub(r"\3", r) if m else r
    w = int(m.group(1)) * int(m.group(2)) if m else 10**12
    groups.setdefault(base, set()).add((w, r))
archived = {urlsplit(HOST_RE.sub("", o)).path.lower(): (ts, o) for o, ts, s, mi in rows if "/wp-content/uploads/" in o}
say(f"{len(groups)} unique uploads ({len(refs)} incl. size variants)")
manifest = {}
for base, variants in sorted(groups.items()):
    dest = os.path.join(OUT, "uploads", base.split("/wp-content/uploads/")[1])
    if os.path.exists(dest): manifest[base] = base; continue
    got = None
    for w, cand in sorted(variants, reverse=True):  # original first, then largest variant
        hit = archived.get(cand.lower())
        url = wb(hit[0], hit[1]) if hit else wb("2025", "https://architecturematters.com.au" + cand)
        data = fetch(url, tries=3)
        if data and not data[:15].lower().startswith((b"<!doctype", b"<html")):
            got = cand; save(dest, data); break
    manifest[base] = got
    say("upload", base, "<-", got or "NOT ARCHIVED")
json.dump(manifest, open(os.path.join(OUT, "uploads-manifest.json"), "w"), indent=1)
say("DONE")
