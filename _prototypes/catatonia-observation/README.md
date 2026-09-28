# Catatonia observation studio — local prototype

`catatonia-observation.preview.html` is an original fictional illustration and an
observation-versus-inference exercise. Four scenes explore a brief greeting, two
separate check-ins, gesture and writing after a spoken pause, and the difference
between a nurse's earlier report and a current bedside observation. Each scene
has four user-controlled moments and a description exercise. Selecting another
scene stops playback and clears the prior answers.
Three starting cards suggest a first scene for MS3 students, PGY-1 residents,
and APPs. Each opens the same shared scene player at moment one; all four
scenes remain available to everyone, and switching clears earlier choices.
The gallery shows all four illustrations at once and reuses the original SVG
artwork without extra image files.

This is not a BFCRS implementation, examination video, diagnostic aid, or clinical
guidance. It stores no answers and runs without a network connection; its optional
outbound links point to URMC's official training and calculator. No scene supplies
BFCRS item text, anchors, or a score.

This prototype is **unattested and unshipped**. The faculty owner accepted the four
scene visuals and exact scene wording, and approved the proposed starter-card
layout and prompts for this private prototype. The new starter copy still needs
exact-revision faculty wording review before learner release. The current student site is MS3; PGY-1 and APP are
separate roles within the resident site. Do not add it to `site_manifest.json`,
`site_extras.py`, learner navigation, or either build before gallery behavior,
accessibility, role-specific delivery, and rights review and an explicit
release decision. The published BFCRS reference remains a static outbound
route to the custodian's materials.

`FACULTY_REVIEW.md` contains the exact-revision review packet, recorded faculty
decisions, remaining review items, and private preview link.

For an interactive local preview, reveal the HTML file in Finder and open it with a
regular browser. The file is self-contained and needs no server. Codex's in-app
browser does not open `file:` URLs; its file tab shows the source, not a rendered
page. The Playwright `prototypes` project verifies the interactions.

Before any promotion, verify it is listed in `shipped_pages.json`, review the exact
build for both audiences, update the appropriate faculty governance record, and
obtain an explicit release decision.
