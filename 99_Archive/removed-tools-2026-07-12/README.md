# Removed tool — 2026-07-12

`active-recall.html` (the landmark-paper "Active Recall" self-test **deck browser**) was
retired from both sites. All its decks were landmark/seminal-paper based.

**Kept:** the two sibling tools that share the same `quizzes.json` bank —
**Daily Review** (`review.html`, spaced repetition) and **Shelf Mode**
(`shelf-mode.html`, mixed exam) both remain live. Removing Active Recall dropped the
standalone per-paper browser only; the landmark questions themselves stay available
through Daily Review and Shelf Mode.

Unwired from: `site_manifest.json`, `build_deploy.py`, `resident_section.py`,
`spa_index.html` tool-maps/dashboard, `topic_meta.json`, `learning-path.html`, and the
`landmark_trials_page.md` per-paper "Quiz this paper" links (those pointed at the
per-paper browser, which no longer exists; Daily Review/Shelf Mode have no per-deck
deep-link, so the links were removed rather than repointed). Daily Review's own
"Browse full quiz bank" chip was repointed from Active Recall → Shelf Mode.

Kept here for reference/restore.
