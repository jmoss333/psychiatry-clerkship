# Run: python3 test_media_guard.py   (no framework; plain asserts, exits non-zero on failure)
import os, tempfile, shutil
from media_guard import strip_missing_media

def _w(path, txt):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(txt)

def main():
    out = tempfile.mkdtemp(prefix="mediaguard_test_")
    try:
        os.makedirs(os.path.join(out, "media"), exist_ok=True)
        # only the hero clip exists on disk
        _w(os.path.join(out, "media", "hero.mp4"), "x")

        # content page: one PRESENT hero video + one MISSING week clip
        _w(os.path.join(out, "content", "week1.md"),
           "# Week 1\n\n"
           '<video src="media/hero.mp4" controls></video>\n\n'
           '<video src="media/week-intro-1.mp4" autoplay muted loop playsinline\n'
           '  aria-label="week 1 preview"></video>\n\n'
           "Body text stays.\n")

        # tool page: spotlight <details> wrapping a MISSING clip (resolves via ../media)
        _w(os.path.join(out, "tools", "bfcrs.html"),
           "<body>\n"
           '<details class="tl-spotlight"><summary>See it in action</summary>\n'
           '  <video src="../media/tool-spotlight-bfcrs.mp4" muted loop></video>\n'
           "</details>\n"
           "<div id=root></div>\n</body>\n")

        files_changed, blocks_removed = strip_missing_media(out, verbose=False)

        wk = open(os.path.join(out, "content", "week1.md"), encoding="utf-8").read()
        tl = open(os.path.join(out, "tools", "bfcrs.html"), encoding="utf-8").read()

        assert "media/hero.mp4" in wk, "present hero video must be kept"
        assert "week-intro-1.mp4" not in wk, "missing week clip must be stripped"
        assert "Body text stays." in wk, "surrounding prose must be preserved"
        assert "tool-spotlight-bfcrs.mp4" not in tl, "missing tool clip must be stripped"
        assert "tl-spotlight" not in tl, "orphan spotlight <details> wrapper must be removed"
        assert "See it in action" not in tl, "orphan caption must be removed with the wrapper"
        assert "<div id=root>" in tl, "tool body must be preserved"
        assert blocks_removed == 2, "expected exactly 2 broken embeds removed, got %d" % blocks_removed

        # idempotent: a second pass removes nothing
        _, again = strip_missing_media(out, verbose=False)
        assert again == 0, "guard must be idempotent"

        print("test_media_guard: OK (%d files changed, %d blocks removed, idempotent)"
              % (files_changed, blocks_removed))
    finally:
        shutil.rmtree(out, ignore_errors=True)

if __name__ == "__main__":
    main()
