#!/usr/bin/env python3
"""Copy the AIRL task app from airl-tasks.web.app into airl-tasks/ for https://airl.kz/airl-tasks/.

The app is a built React + Supabase SPA (its source is not in this repo). This script
downloads the built files and adapts them to live under /airl-tasks/:

  * root paths (/assets/..., /favicon.svg and other public files) -> /airl-tasks/...
  * after Google sign-in, return to /airl-tasks/ instead of the site root
    (in Supabase -> Authentication -> URL Configuration, https://airl.kz/airl-tasks/**
    must be in Redirect URLs, otherwise Supabase sends people to its Site URL)
  * noindex: it is an internal tool

Data, sign-in and Telegram stay in Supabase as before.

usage: python3 scripts/mirror-airl-tasks.py [--source URL] [--out DIR]
"""
import argparse
import os
import re
import shutil
import sys
import urllib.error
import urllib.request

BASE = "/airl-tasks/"
UA = "airl-mirror/1.0 (+https://airl.kz)"
PUBLIC_EXT = r"(?:svg|png|jpe?g|webp|gif|ico|woff2?|ttf|otf|mp3|wav|ogg|json|webmanifest|txt|js|css)"
# a root-absolute path inside quotes: "/x.svg", `/assets/a-1.js`, url(/assets/f.woff2)
ROOT_REF = re.compile(r"""(?P<q>["'`(])(?P<p>/(?!/)[A-Za-z0-9_\-./]+\.""" + PUBLIC_EXT + r""")(?=[\"'`)?#])""")


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.status, r.headers.get("content-type", ""), r.read()


def fetch_file(source, path):
    """Return bytes of a real file, or None when the server answers with the SPA fallback page."""
    try:
        status, ctype, body = get(source + path)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise
    if status != 200:
        return None
    if "text/html" in ctype and not path.endswith(".html"):
        return None  # SPA fallback (index.html) instead of a missing file
    return body


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", default="https://airl-tasks.web.app")
    ap.add_argument("--out", default="airl-tasks")
    a = ap.parse_args()
    source = a.source.rstrip("/")

    files = {}  # path -> bytes
    _, _, html = get(source + "/")
    files["/index.html"] = html
    queue = [m.group("p") for m in ROOT_REF.finditer(html.decode("utf-8"))]
    seen = set()
    while queue:
        p = queue.pop(0)
        if p in seen or p.startswith(BASE):
            continue
        seen.add(p)
        body = fetch_file(source, p)
        if body is None:
            continue  # a string that looks like a path but is not a file on the site
        files[p] = body
        if p.endswith((".js", ".css", ".json", ".webmanifest", ".svg")):
            try:
                text = body.decode("utf-8")
            except UnicodeDecodeError:
                continue
            queue += [m.group("p") for m in ROOT_REF.finditer(text)]

    real = set(files)

    def rebase(text):
        return ROOT_REF.sub(lambda m: m.group("q") + (BASE + m.group("p")[1:] if m.group("p") in real else m.group("p")), text)

    out = {}
    for p, body in files.items():
        if p.endswith((".html", ".js", ".css", ".json", ".webmanifest", ".svg")):
            try:
                text = body.decode("utf-8")
            except UnicodeDecodeError:
                out[p] = body
                continue
            text = rebase(text)
            if p == "/index.html":
                if "noindex" not in text:
                    tag = '<meta name="robots" content="noindex" />'
                    m = re.search(r"<meta charset=[^>]*>", text, re.I)
                    if m:
                        text = text[:m.end()] + "\n    " + tag + text[m.end():]
                    else:
                        text = text.replace("<head>", "<head>\n    " + tag, 1)
            if p.endswith(".js") and "signInWithOAuth" in text:
                old = "redirectTo:window.location.origin"
                n = text.count(old)
                if n != 1:
                    sys.exit("sign-in redirect not found exactly once in %s (found %d): check the new build" % (p, n))
                text = text.replace(old, "redirectTo:window.location.origin+`" + BASE + "`")
            out[p] = text.encode("utf-8")
        else:
            out[p] = body

    if not any(b"redirectTo:window.location.origin+`" + BASE.encode() + b"`" in b for b in out.values()):
        sys.exit("sign-in redirect patch was not applied")

    tmp = a.out + ".new"
    shutil.rmtree(tmp, ignore_errors=True)
    for p, body in out.items():
        dst = os.path.join(tmp, p.lstrip("/"))
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        with open(dst, "wb") as f:
            f.write(body)
    shutil.rmtree(a.out, ignore_errors=True)
    os.rename(tmp, a.out)
    for p in sorted(out):
        print("%8d  %s" % (len(out[p]), p))
    print("copied %d files from %s into %s/" % (len(out), source, a.out))


if __name__ == "__main__":
    main()
