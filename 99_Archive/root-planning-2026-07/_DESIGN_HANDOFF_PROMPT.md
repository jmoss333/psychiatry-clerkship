# Handoff Prompt — Redesign the Psychiatry Clerkship Library for MS3 Engagement

> Paste everything below the line into Claude (design/artifact mode). It is self-contained.
> Swap the bracketed `[…]` notes if your priorities differ. A trimmed "facelift-only" variant is at the very bottom.

---

You are a senior product designer + front-end engineer with deep experience in medical education UX. You're helping me redesign a psychiatry clerkship library so it is **genuinely engaging for third-year medical students (MS3s)** on a 6-week adult inpatient psychiatry rotation — without losing clinical credibility. I'm a psychiatrist and clerkship director; treat me as a domain expert and design partner.

## 1. The brief (one sentence)
Transform a content-complete but visually flat, link-list library into a fast, mobile-first, retrieval-driven learning experience that an anxious, time-poor MS3 actually opens between patients — and keeps coming back to across all six weeks.

## 2. Who this is for (design to this person)
A third-year medical student, often on their **first real psychiatry exposure**. They are:
- **Anxious about specifics**: interviewing patients, presenting on rounds, suicide/violence/agitation safety, and passing the shelf exam.
- **Time-poor and phone-first**: reading in 2–5 minute gaps, standing on the unit, phone in a white-coat pocket.
- **Motivated by**: not looking unprepared on rounds, passing the shelf, and doing right by real patients.
- **Learns best from**: concrete scripts ("what do I actually say"), worked examples, active recall (self-test), and just-in-time references — not walls of prose.

Secondary audiences exist (Sub-I/MS4, PGY-2 residents, faculty), but **MS3 is the default**. Design MS3-first; let other tracks be lightweight overlays.

## 3. What exists today

**Format.** A static, file-based library (~170 Markdown teaching files + PDFs/PPTs as source assets) with a single hand-built `index.html` "front door" and **6 interactive single-file HTML/React tools** (Mental Status Exam builder, Decisional Capacity note generator, Oral Presentation + timer, Violence Risk one-pager, CIWA-Ar/COWS withdrawal scales, Columbia C-SSRS screener, Reflection/PIF set). No build step, no backend — files are opened directly.

**The problem.** The front door is a flat grid of links. The 6 tools are clean but utilitarian. The ~170 Markdown files are the real substance but render as **raw, unstyled text** — so the content and the tools don't feel like one product, there's no wayfinding, no sense of progress through the 6 weeks, and nothing that prompts active recall. It's a well-stocked shelf, not a learning experience.

**Existing design system — "Clinical Warm" (keep and extend this; do not start a new palette):**
```
Background    #f6f3ee   alt #faf6f0   surface #ffffff   border #ddd3c6
Primary       #c25a3c (terracotta)   dark #a84830
Accent        #2a6b5e (teal)         dark #1e5248
Text          #3b332c   mid #64574b   light #87786a
Semantic      success #357160 · warning #7a6234 · danger #a34132 · info #41618a
Headings font "Source Serif 4" (serif)      Body font "Source Sans 3" (sans)
Radii         6 / 10 / 14 / 999px          Shadows: soft, low-opacity
Existing UI patterns: cards, pills, chips, collapsible accordions, tabs,
  "pearl" callouts (warning-tinted), "danger" callouts, monospace output boxes.
```

**Information architecture (numbered folders):**
`00 Start Here · 01 Six-Week Curriculum (Wk1 Foundations → Wk6 Integration/Exam) · 02 Clinical Skills (Interview, MSE, Formulation, Documentation, Presentations, DDx, Reflection) · 03 Core Topics (Mood, Psychosis, Anxiety/Trauma/OCD, Personality, SUD, Geriatric, Perinatal) · 04 Acute & Safety (Suicide, Violence, Agitation/Restraint, Capacity, Delirium, Catatonia) · 05 Psychopharmacology · 06 Family & Relational · 07 Evidence & Reading (Landmark library, Journal Club) · 08 Cases & Simulation · 09 Exam Prep (Shelf, OSCE) · 10 Patient/Family Education · 11 AI & Prompts · 12 Media · 13 Faculty · 14 Tracks`

## 4. Engagement goals (the design problems to solve — outcomes, not features)
Solve for these. You choose the mechanisms; I've noted candidate moves.
1. **"What do I do today?" wayfinding.** A home that orients by *week of rotation* and *role*, surfaces today's high-yield, and answers "where am I and what's next." (Candidate: week-aware home, "you are here" 6-week tracker, a daily/point-of-care quick-access row.)
2. **Active recall, not passive reading.** Turn high-yield + shelf content into retrieval practice. (Candidate: flashcard decks, self-test quizzes with rationale, OSCE-station player, "test yourself" prompts embedded in topic pages.)
3. **Point-of-care speed.** Mobile-first, instantly scannable, searchable; pocket-card ergonomics. (Candidate: global search/command palette, sticky topic nav, "key points in 30 seconds" blocks, print-to-pocket-card.)
4. **Visible momentum.** A light, *professional* progress layer — checklists and completion the student can see filling in. **No childish gamification**; it must read as credible to a future attending. (Candidate: per-week checklists, completion rings, streaks kept subtle.)
5. **Clinical confidence through concreteness.** Foreground scripts, worked examples, and decision aids over prose. (Candidate: "what to say" script cards, annotated exemplars, decision trees.)
6. **One coherent product.** A unified reading template so any Markdown teaching file renders in the Clinical Warm system with real typography, a table of contents, collapsibles, callouts, estimated read time, and links to the relevant interactive tool.

## 5. What to design and build (phased; deliver Phase 1 fully, then iterate)
- **Phase 0 — Component kit.** Formalize Clinical Warm into a reusable component library: top nav + global search, week-progress tracker, checklist, callout set (pearl/danger/info/key-point), flashcard, quiz card, OSCE-station player, case viewer, "key points" summary block. Single-file, dependency-light, documented tokens.
- **Phase 1 — Redesigned home / front door (the flagship).** Week-aware and role-aware; "today on the unit" quick access; search; the 6-week arc as a visible path with progress; clear routes to tools, topics, acute/safety, and exam prep. Build this one out fully and polished.
- **Phase 2 — Topic/reading template.** One template that makes any teaching Markdown file feel native: TOC, read-time, collapsible sections, callouts, embedded "test yourself," and a "use the tool" CTA.
- **Phase 3 — Active-recall layer.** Flashcard + quiz components and an OSCE-station player, populated from a small sample of high-yield/shelf content to demonstrate the pattern.
- **Phase 4 — Tool polish.** Restyle the 6 existing tools to the refreshed kit and add tasteful micro-interactions (states, transitions, mobile layouts).

## 6. Constraints & guardrails (non-negotiable)
- **Clinical safety / scope.** This is **educational only**; all cases are **fictional composites with no PHI**. You are doing **design, not clinical authoring** — do not invent, alter, or "improve" clinical content, dosing, scores, or algorithms. Preserve existing educational disclaimers and any "pending physician review/attestation" notices. Flag (don't fix) anything that reads like an unverified clinical claim for SME review.
- **Brand.** Stay within Clinical Warm. The target feeling is **"engaging but clinically credible"** — energetic, modern, confident; never gimmicky, neon, or cartoonish. The bar: a skeptical attending should find it serious; a nervous MS3 should find it inviting.
- **Technical.** Keep the **single-file, no-build, portable** pattern (opens from disk; CDN libraries fine). Don't make core functionality depend on browser storage that may be unavailable — if you use progress/streaks, degrade gracefully and tell me where state lives. Keep file sizes reasonable and performance snappy on a mid-range phone.
- **Accessibility.** WCAG 2.1 AA: contrast, full keyboard navigation, semantic HTML, visible focus, `prefers-reduced-motion` support. Touch targets sized for thumbs.
- **Responsive.** Mobile-first; verify the phone layout before the desktop one.

## 7. How to respond (process)
1. **Before building**, return: (a) a short design rationale (how your choices map to the 6 engagement goals), (b) **2–3 directional concepts for the home page** with tradeoffs, and (c) a one-screen component inventory. Ask me to pick a direction.
2. Then **build the chosen home page as a complete, working single-file artifact**, plus the documented component kit it draws from.
3. Then iterate with me page by page. Keep each artifact self-contained and copy-pasteable.
4. Call out every assumption you make in a short list at the end of each turn.

Start with step 1.
```
```
---

## Trimmed variant — "facelift only" (if you just want the front door refreshed)
> Paste this instead if scope is limited to the home page.

You are a senior product designer. Redesign ONE file — the front-door `index.html` of my psychiatry clerkship library — to be more engaging for third-year medical students on a 6-week inpatient rotation, while staying clinically credible. Keep the existing "Clinical Warm" design system (bg `#f6f3ee`, terracotta `#c25a3c`, teal `#2a6b5e`, Source Serif 4 headings / Source Sans 3 body). Today it's a flat grid of links. Make it **week-aware** (show the 6-week arc with a sense of "you are here"), **fast and mobile-first**, **searchable**, and oriented around "what do I do today" — with clear routes to the 6 interactive tools, core topics, acute/safety references, and shelf/OSCE prep. Keep it a single, no-build HTML file that opens from disk. Educational only, no PHI; preserve disclaimers. First give me 2–3 directional concepts with tradeoffs, then build the one I pick.
```
