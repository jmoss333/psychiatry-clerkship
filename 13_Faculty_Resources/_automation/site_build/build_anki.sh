#!/usr/bin/env bash
# Stage exactly three packages; routine builds never modify committed baselines.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB="$(cd "$HERE/../../.." && pwd)"
OUT_DIR="${1:?usage: build_anki.sh OUT_DIR}"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
# genanki leaves its temporary SQLite file; keep it inside our cleanup directory.
export TMPDIR="$STAGE"
mkdir -p "$STAGE/tools" "$STAGE/anki"
cp "$OUT_DIR/tools/concepts.json" "$STAGE/tools/concepts.json"
# Dependency absence is a hard failure, including when using committed fallback.
python3 -c 'import genanki'
if ! (python3 "$HERE/export_anki.py" --out "$STAGE/anki" &&
      python3 "$HERE/export_anki_content.py" --feed "$STAGE/tools/concepts.json" --out "$STAGE/anki" &&
      python3 "$HERE/export_anki_all.py" --feed "$STAGE/tools/concepts.json" --out "$STAGE/anki"); then
  echo '[anki] generation failed; checking committed fallback for exact semantic equality'
  for name in psychiatry_clerkship_library psychiatry_clerkship_concepts psychiatry_clerkship_library_ALL; do
    cp "$LIB/09_Exam_Prep/anki_export/$name.apkg" "$STAGE/anki/$name.apkg"
  done
fi
python3 "$HERE/check_anki_parity.py" "$STAGE"
mkdir -p "$OUT_DIR/anki"
for name in psychiatry_clerkship_library psychiatry_clerkship_concepts psychiatry_clerkship_library_ALL; do
  cp "$STAGE/anki/$name.apkg" "$OUT_DIR/anki/$name.apkg"
done
python3 "$HERE/check_anki_parity.py" "$OUT_DIR"
