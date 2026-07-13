#!/usr/bin/env bash
# build_anki.sh — (re)generate the Anki decks and stage them into a site output dir.
#
# Usage:  bash build_anki.sh [OUT_DIR]
#   OUT_DIR  optional published-site dir (e.g. _build/ms3). If given, the .apkg
#            files are copied to $OUT_DIR/anki/ for download from the live site.
#
# FAIL-SOFT BY DESIGN: this script NEVER exits non-zero. It is called from
# build_and_check.sh, which runs under `set -euo pipefail` as the Netlify build
# command — a hard failure here would break the deploy. If genanki is missing or
# regeneration fails (e.g. on Netlify's build image), we log a warning and fall
# back to the .apkg already committed in 09_Exam_Prep/anki_export/. Regeneration
# is expected to happen locally / in CI (where genanki is installed) and the
# refreshed decks committed; Netlify then just copies the committed files.

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB="$(cd "$HERE/../../.." && pwd)"
EXPORT_DIR="$LIB/09_Exam_Prep/anki_export"
OUT_DIR="${1:-}"

regen() {
  python3 -c "import genanki" 2>/dev/null || { echo "  [anki] genanki not available — using committed .apkg"; return 0; }
  echo "  [anki] regenerating decks"
  python3 "$HERE/export_anki.py"          --out "$EXPORT_DIR" || echo "  [anki] qbank export failed — keeping committed .apkg"
  python3 "$HERE/export_anki_content.py"  --out "$EXPORT_DIR" || echo "  [anki] concepts export failed — keeping committed .apkg"
  python3 "$HERE/export_anki_all.py"      --out "$EXPORT_DIR" || echo "  [anki] combined export failed — keeping committed .apkg"
}

stage() {
  [ -n "$OUT_DIR" ] || return 0
  mkdir -p "$OUT_DIR/anki" || return 0
  cp -f "$EXPORT_DIR"/*.apkg "$OUT_DIR/anki/" 2>/dev/null \
    && echo "  [anki] staged $(ls "$EXPORT_DIR"/*.apkg 2>/dev/null | wc -l | tr -d ' ') deck(s) → $OUT_DIR/anki/" \
    || echo "  [anki] no .apkg to stage (skipping)"
}

regen
stage
exit 0
