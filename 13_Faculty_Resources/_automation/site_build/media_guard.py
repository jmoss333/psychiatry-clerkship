# media_guard.py — strip <video> embeds whose asset never shipped, so no broken
# players reach a built site. Shared by build_deploy.py (ms3) and resident_section.py (res);
# each calls strip_missing_media(OUT) at the END of its build, after all content + media are
# in place. Non-destructive to SOURCE — it only edits files already copied into the build dir,
# so a source embed auto-reactivates the moment its real .mp4 is exported and copied.
#
# Why this exists: content authored during the 2026-07 video handoff embeds per-week
# (week-intro-N.mp4) and per-tool (tool-spotlight-X.mp4) clips that were never exported —
# only the two combined reels were. Those 12 embeds otherwise ship pointing at 404s.
# The QA gate (check-static-site.mjs) independently HARD-fails on any surviving broken ref.
import os, re

# Media referenced by a <video>/<source> src; poster/img are intentionally out of scope
# (a missing poster still plays; a missing video is the broken-player case we strip).
_VIDEO_EXT = re.compile(r'\.(mp4|webm|mov|m4v|ogg|ogv)$', re.I)
_SRC = re.compile(r'\bsrc\s*=\s*"([^"]+)"', re.I)
_SPOTLIGHT = re.compile(r'<details\b[^>]*\btl-spotlight\b[^>]*>.*?</details>', re.S | re.I)
_VIDEO = re.compile(r'<video\b[^>]*>.*?</video>', re.S | re.I)
_VIDEO_SELFCLOSE = re.compile(r'<video\b[^>]*/>', re.I)


def _resolve(out_dir, built_file, src):
    # content/*.md is injected by the SPA at the SITE ROOT, so "media/x" resolves against
    # out_dir; tools/*.html is served at its own path, so "../media/x" resolves against its dir.
    base = out_dir if built_file.endswith('.md') else os.path.dirname(built_file)
    return os.path.normpath(os.path.join(base, src))


def _block_is_broken(out_dir, built_file, block):
    vids = [s for s in _SRC.findall(block) if _VIDEO_EXT.search(s)]
    if not vids:
        return False  # no video source in this block — leave it alone
    # broken only if EVERY video source is missing (one surviving <source> is a valid fallback)
    return all(not os.path.isfile(_resolve(out_dir, built_file, s)) for s in vids)


def strip_missing_media(out_dir, verbose=True):
    """Remove video embeds with no on-disk asset from a built site. Returns (files_changed, blocks_removed)."""
    targets = []
    for sub, ext in (('content', '.md'), ('tools', '.html')):
        d = os.path.join(out_dir, sub)
        if os.path.isdir(d):
            targets += [os.path.join(d, f) for f in os.listdir(d) if f.endswith(ext)]

    files_changed = 0
    blocks_removed = 0
    removed_srcs = []

    for fp in targets:
        with open(fp, encoding='utf-8') as fh:
            txt = orig = fh.read()

        def _drop(m):
            nonlocal blocks_removed
            if _block_is_broken(out_dir, fp, m.group(0)):
                blocks_removed += 1
                removed_srcs.extend(s for s in _SRC.findall(m.group(0)) if _VIDEO_EXT.search(s))
                return ''
            return m.group(0)

        txt = _SPOTLIGHT.sub(_drop, txt)        # whole "See it in action" wrapper (tool pages)
        txt = _VIDEO.sub(_drop, txt)            # bare <video>...</video> (week pages)
        txt = _VIDEO_SELFCLOSE.sub(_drop, txt)  # <video ... /> defensive

        if txt != orig:
            with open(fp, 'w', encoding='utf-8') as fh:
                fh.write(txt)
            files_changed += 1

    if verbose:
        if blocks_removed:
            print("media guard: stripped %d broken video embed(s) across %d file(s): %s"
                  % (blocks_removed, files_changed, ", ".join(sorted(set(removed_srcs)))))
        else:
            print("media guard: no broken video embeds found")
    return files_changed, blocks_removed
