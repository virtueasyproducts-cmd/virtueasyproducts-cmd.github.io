#!/usr/bin/env python3
"""
Sync the "From the Blog" section on the home page (index.html) with the newest
posts listed at the top of blog/index.html.

Source of truth: blog/index.html card order (newest post first).
The top N cards are re-rendered into the home page card style, between the
<!-- BLOG-CARDS:START --> / <!-- BLOG-CARDS:END --> markers.

Run manually (`python .github/scripts/sync_blog_home.py`) or via the
sync-blog-home GitHub Action on every push to blog/**.

Exit code 0 always; prints whether index.html changed.
"""
import os
import re
import sys

N = 3  # number of posts to feature on the home page

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BLOG_INDEX = os.path.join(ROOT, "blog", "index.html")
HOME = os.path.join(ROOT, "index.html")

START = "<!-- BLOG-CARDS:START (auto-generated from /blog/index.html by .github/scripts/sync_blog_home.py — do not edit by hand) -->"
END = "<!-- BLOG-CARDS:END -->"

# One card in blog/index.html:
#   <a href="posts/slug.html" class="card" data-tag="Tag">
#     <div class="card-inner">
#       <span class="card-tag">Tag</span>
#       <h2>Title</h2>
#       <p>Excerpt</p>
#       <div class="card-footer"><span class="card-read">8 min read</span>...
CARD_RE = re.compile(
    r'<a\s+href="(?P<href>posts/[^"]+)"\s+class="card"[^>]*>\s*'
    r'<div class="card-inner">\s*'
    r'<span class="card-tag">(?P<tag>.*?)</span>\s*'
    r'<h2>(?P<title>.*?)</h2>\s*'
    r'<p>(?P<excerpt>.*?)</p>\s*'
    r'<div class="card-footer">\s*<span class="card-read">(?P<read>.*?)</span>',
    re.DOTALL,
)

# The specific grid inside the blog-preview-section on the home page.
GRID_RE = re.compile(
    r'(<div style="display:grid; grid-template-columns:repeat\(auto-fill,minmax\(min\(100%,280px\),1fr\)\); gap:1\.5rem;">)'
    r'(?P<body>.*?)'
    r'(</div>\s*</div>\s*</section>)',
    re.DOTALL,
)


def render_card(post):
    return (
        f'          <a href="/blog/{post["href"]}" style="display:block; background:#141414; border:1px solid rgba(255,31,122,0.12); padding:1.8rem; text-decoration:none; transition:border-color 0.2s;" onmouseover="this.style.borderColor=\'rgba(255,31,122,0.4)\'" onmouseout="this.style.borderColor=\'rgba(255,31,122,0.12)\'">\n'
        f'            <span style="display:inline-block; background:#FF1F7A; color:#fff; font-size:0.58rem; font-weight:700; letter-spacing:0.18em; text-transform:uppercase; padding:0.2rem 0.55rem; margin-bottom:1rem;">{post["tag"]}</span>\n'
        f'            <h3 style="font-family:\'Bebas Neue\',sans-serif; font-size:1.35rem; letter-spacing:0.03em; color:#F8F8F8; line-height:1.15; margin-bottom:0.75rem;">{post["title"]}</h3>\n'
        f'            <p style="font-size:0.88rem; color:rgba(248,248,248,0.55); line-height:1.6; margin-bottom:1.2rem;">{post["excerpt"]}</p>\n'
        f'            <span style="font-size:0.75rem; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:#FF1F7A;">{post["read"]} &rarr;</span>\n'
        f'          </a>'
    )


def main():
    with open(BLOG_INDEX, "r", encoding="utf-8") as f:
        blog = f.read()

    posts = []
    for m in CARD_RE.finditer(blog):
        posts.append({k: m.group(k).strip() for k in ("href", "tag", "title", "excerpt", "read")})
        if len(posts) == N:
            break

    if len(posts) < N:
        print(f"ERROR: found only {len(posts)} cards in blog/index.html (need {N}).", file=sys.stderr)
        return 1

    cards = "\n\n".join(render_card(p) for p in posts)
    block = f"{START}\n\n{cards}\n\n          {END}"

    with open(HOME, "r", encoding="utf-8") as f:
        home = f.read()

    if START in home and END in home:
        new_home = re.sub(
            re.escape(START) + r".*?" + re.escape(END),
            block,
            home,
            count=1,
            flags=re.DOTALL,
        )
    else:
        # First run: insert markers by replacing the grid's inner content.
        def repl(m):
            return f'{m.group(1)}\n          {block}\n        {m.group(3)}'

        new_home, n = GRID_RE.subn(repl, home, count=1)
        if n == 0:
            print("ERROR: could not locate the blog-preview grid in index.html.", file=sys.stderr)
            return 1

    if new_home != home:
        with open(HOME, "w", encoding="utf-8") as f:
            f.write(new_home)
        print("CHANGED: index.html updated with newest posts: " + ", ".join(p["href"] for p in posts))
    else:
        print("UNCHANGED: home page already in sync.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
