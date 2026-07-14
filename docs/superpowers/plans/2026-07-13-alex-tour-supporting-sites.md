# Alex Tour Supporting Sites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement
> this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the three optional Alex Tour destinations accurate and presentation-ready before the
tour links to them: reconcile TherapyMatch's public provider count, rename the Mental Health
Education Library, and make the Family Therapy Seminar Companion evergreen.

**Architecture:** Treat each system according to its real source of truth. TherapyMatch changes happen
in a fresh worktree based on `origin/main`; the dirty redesign checkout is read-only. The education
library change is a Netlify control-plane rename only. The family companion changes in the canonical
clerkship source first, then is copied byte-for-byte to its generated deploy directory.

**Tech Stack:** Git worktrees, Node.js 18+ built-ins, Netlify CLI 26, static HTML, SHA-256, HTTP response
checks.

## Global Constraints

- Never edit `/Users/jm/Code/therapy-match/TherapyMatch App` directly; it contains extensive unrelated
  work on `redesign/08-cleanup`.
- Do not describe 306 records as 306 currently available, verified, or accepting providers. The safe
  phrase is **306 Maine provider records** unless a separate current verification supports more.
- Do not alter the Mental Health Education Library's generated HTML or canonical clinical content in
  this iteration.
- Edit `06_Family_and_Relational/_source/index.html` before touching the presentation deploy copy.
- Do not include PHI, credentials, Netlify tokens, or patient-entered data in commands, output files,
  commits, or documentation.
- Use Netlify site IDs, not display-name guesses, for updates and deploys.
- A failed destination check blocks adding that destination to the tour.

---

## File Structure

### TherapyMatch worktree

- Create: `/Users/jm/Code/therapymatch-alex-count`
- Create: `scripts/verify-public-provider-count.mjs`
- Modify: `README.md`

### Psychiatry Clerkship Library worktree

- Create: `tests/family-companion-evergreen.test.mjs`
- Modify: `06_Family_and_Relational/_source/index.html`

### Generated deployment copy

- Replace mechanically:
  `/Users/jm/Clinical/Presentations:Meeting/Family-Therapy-Didactic-June16/deploy-site/index.html`

No file is modified for the Mental Health Education Library rename.

---

## Task 1: Reconfirm Isolation and Live Baselines

**Files:**

- Read only: `/Users/jm/Code/therapy-match/TherapyMatch App`
- Read only: `/Users/jm/clinical-warm-site/.netlify/state.json`
- Read only: `06_Family_and_Relational/_source/index.html`

- [ ] **Step 1: Confirm the TherapyMatch primary checkout is still dirty**

Run:

```bash
git -C "/Users/jm/Code/therapy-match/TherapyMatch App" status --short --branch
git -C "/Users/jm/Code/therapy-match/TherapyMatch App" worktree list
```

Expected: the primary checkout is on `redesign/08-cleanup` with many existing changes. Record that
fact in the execution notes; do not stage, stash, clean, or edit it.

- [ ] **Step 2: Refresh only the remote reference**

Run:

```bash
git -C "/Users/jm/Code/therapy-match/TherapyMatch App" fetch origin --prune
git -C "/Users/jm/Code/therapy-match/TherapyMatch App" rev-parse origin/main
```

Expected: a commit SHA is returned without changing the dirty working tree.

- [ ] **Step 3: Verify the current production facts**

Run:

```bash
git -C "/Users/jm/Code/therapy-match/TherapyMatch App" \
  show origin/main:app/public/providers.json | \
  node --input-type=module -e \
    "let s=''; for await (const chunk of process.stdin) s+=chunk; console.log(JSON.parse(s).length)"
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
const response = await fetch('https://therapymatch-maine.netlify.app/');
assert.equal(response.status, 200);
const html = await response.text();
const match = html.match(/const PROVIDERS = (\[[\s\S]*?\]);\s*\/\/ ===== CONTEXT =====/);
assert.ok(match, 'Live provider array not found');
const count = JSON.parse(match[1]).length;
assert.equal(count, 306, `Expected 306 live provider records, found ${count}`);
console.log(`Live TherapyMatch provider records: ${count}`);
NODE
curl -fsSI https://family-therapy-seminar-companion.netlify.app/
```

Expected: `providers.json` has 306 records; the TherapyMatch live page exposes 306 rather than 307;
and the family companion returns HTTP 200. The authenticated education-library check is deferred to
Task 4. If either public fact differs, stop and update this plan from evidence.

- [ ] **Step 4: Commit nothing**

This task establishes state only.

---

## Task 2: Add a TherapyMatch Count-Consistency Test

**Files:**

- Create: `/Users/jm/Code/therapymatch-alex-count/scripts/verify-public-provider-count.mjs`

- [ ] **Step 1: Create an isolated worktree**

Run:

```bash
git -C "/Users/jm/Code/therapy-match/TherapyMatch App" worktree add \
  -b codex/therapy-provider-count \
  "/Users/jm/Code/therapymatch-alex-count" origin/main
git -C "/Users/jm/Code/therapymatch-alex-count" status --short --branch
```

Expected: the new worktree is clean and based on the refreshed `origin/main`.

- [ ] **Step 2: Write the failing verifier**

Create `scripts/verify-public-provider-count.mjs` with:

```javascript
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const providers = JSON.parse(
  fs.readFileSync(path.join(root, 'app/public/providers.json'), 'utf8'),
);
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
const landing = fs.readFileSync(path.join(root, 'app/src/app/page.tsx'), 'utf8');
const count = providers.length;

assert.equal(
  count,
  306,
  `Expected the current public dataset to contain 306 records, found ${count}`,
);
assert.match(
  landing,
  new RegExp(`>\\s*${count}\\s*<`),
  `Landing page does not display the public dataset count (${count})`,
);
assert.match(
  readme,
  new RegExp(`Working prototype using ${count} Maine provider records`),
  'README status does not use the current count and denominator',
);
assert.doesNotMatch(readme, /\b307\b/, 'README still contains the superseded 307 count');

console.log(`Provider count verified across dataset, landing page, and README: ${count}`);
```

- [ ] **Step 3: Run the verifier and verify red**

Run:

```bash
cd "/Users/jm/Code/therapymatch-alex-count"
node scripts/verify-public-provider-count.mjs
```

Expected: failure because the current README still claims 307.

- [ ] **Step 4: Commit the red test**

Do not commit a deliberately red repository state. Continue directly to Task 3.

---

## Task 3: Reconcile TherapyMatch's Current Documentation

**Files:**

- Modify: `/Users/jm/Code/therapymatch-alex-count/README.md`
- Test: `/Users/jm/Code/therapymatch-alex-count/scripts/verify-public-provider-count.mjs`

- [ ] **Step 1: Replace the overclaiming status line**

Use this exact status text:

```markdown
**Phase:** Working prototype using 306 Maine provider records
```

- [ ] **Step 2: Correct the repository map**

Replace the stale provider-count comments with this structure:

```text
├── app/                    # Production Next.js application
│   ├── public/
│   │   └── providers.json # Current public dataset (306 Maine provider records)
│   └── src/                # Application source code
├── data/
│   ├── providers/          # Source and enrichment datasets
│   └── patients/           # Synthetic Maine test cohort
```

- [ ] **Step 3: Correct the key-file table**

Use these current entries in place of the 307-provider prototype claim:

```markdown
| `app/src/app/page.tsx` | Current Next.js landing page |
| `app/public/providers.json` | Public prototype dataset (306 Maine provider records) |
```

Keep historical research documents unchanged when they clearly describe earlier snapshots. The root
README is the current-status document and must contain no `307` claim after this edit.

- [ ] **Step 4: Run the focused verifier**

Run:

```bash
cd "/Users/jm/Code/therapymatch-alex-count"
node scripts/verify-public-provider-count.mjs
git diff --check
```

Expected:

```text
Provider count verified across dataset, landing page, and README: 306
```

- [ ] **Step 5: Run the existing real-fixture provider test**

If dependencies are absent, install them without the inherited-production-environment trap:

```bash
cd "/Users/jm/Code/therapymatch-alex-count/app"
NODE_ENV=development npm ci --include=dev
npm test -- --runInBand src/lib/data/__tests__/provider-cache.test.ts
```

Expected: the real fixture produces a non-empty cleaned set and the test suite passes. Report any
unrelated baseline failure separately; do not weaken the test.

- [ ] **Step 6: Commit the isolated fix**

Run:

```bash
cd "/Users/jm/Code/therapymatch-alex-count"
git add README.md scripts/verify-public-provider-count.mjs
git commit -m "fix(docs): reconcile TherapyMatch provider count"
```

- [ ] **Step 7: Publish for review without touching the dirty checkout**

Run:

```bash
git -C "/Users/jm/Code/therapymatch-alex-count" push -u origin codex/therapy-provider-count
body="Uses the live public dataset as the denominator: 306 Maine provider records.
Removes the stale 307 claim without changing matching behavior or production data."
gh -R jmoss333/therapymatch pr create \
  --head codex/therapy-provider-count \
  --base main \
  --title "Reconcile TherapyMatch provider count" \
  --body "$body"
```

Expected: a focused PR containing only the verifier and README changes. Do not merge automatically if
the repository's current branch protections or ownership rules require review.

- [ ] **Step 8: Integrate through the normal review path**

Run the PR checks and inspect the final diff. After the focused change is approved, merge through the
repository's normal strategy; do not force-push `main`. Then run:

```bash
git -C "/Users/jm/Code/therapy-match/TherapyMatch App" fetch origin --prune
git -C "/Users/jm/Code/therapy-match/TherapyMatch App" show origin/main:README.md | \
  rg "Working prototype using 306 Maine provider records"
```

Expected: the accurate denominator is present on `origin/main`. Keep the original dirty checkout
otherwise untouched.

---

## Task 4: Rename the Mental Health Education Library

**Files:** None.

**Netlify site ID:** `91005fbc-3ba1-4cfc-88a2-3c401f306286`

- [ ] **Step 1: Verify authentication and capture the current site**

Run:

```bash
cd "/Users/jm/clinical-warm-site"
netlify status
netlify api getSite --data '{"site_id":"91005fbc-3ba1-4cfc-88a2-3c401f306286"}' | \
  /usr/bin/jq '{id,name,url,ssl_url}'
netlify sites:search mental-health-education-library --json
```

If `netlify status` reports an expired login, run `netlify login`, complete the browser authorization,
then rerun all three commands. Expected: the authenticated account can see the target site, and no
existing project is named `mental-health-education-library`.

- [ ] **Step 2: Rename by immutable site ID**

Run:

```bash
site_update='{
  "site_id": "91005fbc-3ba1-4cfc-88a2-3c401f306286",
  "body": {"name": "mental-health-education-library"}
}'
netlify api updateSite --data "$site_update" | \
  /usr/bin/jq '{id,name,url,ssl_url}'
```

If and only if Netlify explicitly reports the preferred name is unavailable, run the deterministic
fallback:

```bash
site_update='{
  "site_id": "91005fbc-3ba1-4cfc-88a2-3c401f306286",
  "body": {"name": "mental-health-education-maine"}
}'
netlify api updateSite --data "$site_update" | \
  /usr/bin/jq '{id,name,url,ssl_url}'
```

- [ ] **Step 3: Verify the renamed project and both hostnames**

For the preferred-name path, run:

```bash
netlify api getSite --data '{"site_id":"91005fbc-3ba1-4cfc-88a2-3c401f306286"}' | \
  /usr/bin/jq '{id,name,url,ssl_url}'
curl -fsSI https://mental-health-education-library.netlify.app/
curl -sSI https://clinical-warm-staging-28882.netlify.app/
```

Expected: the new URL returns HTTP 200. The old URL may redirect or become retired; record its actual
status without presenting it as the share URL. For the fallback path, substitute only
`mental-health-education-maine` in the first URL.

- [ ] **Step 4: Open the final site visually**

Use the in-app Browser to confirm the page title and patient/family education content load without a
framework error overlay. Record the exact final URL for the tour implementation.

- [ ] **Step 5: Commit nothing**

This is an external Netlify control-plane change. Do not edit `/Users/jm/clinical-warm-site`.

---

## Task 5: Add an Evergreen Family-Companion Regression Test

**Files:**

- Create: `tests/family-companion-evergreen.test.mjs`
- Read: `06_Family_and_Relational/_source/index.html`

- [ ] **Step 1: Write the failing test**

Create `tests/family-companion-evergreen.test.mjs` with:

```javascript
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(
  path.join(repo, '06_Family_and_Relational/_source/index.html'),
  'utf8',
);

const evergreen = 'EVERGREEN FACULTY TEACHING COMPANION · UPDATED JULY 2026';
const provenance = 'Developed from a June 2026 family-therapy seminar.';

assert.ok(html.includes(evergreen));
assert.ok(html.includes(provenance));
assert.doesNotMatch(html, /TUE JUNE 16, 2026/);
assert.doesNotMatch(html, /June 16, 2026 seminar companion/);
assert.doesNotMatch(html, /before the seminar or during it/);
assert.doesNotMatch(html, /June 16|3:30 PM|McG Classroom/i);

console.log('Family Therapy Companion evergreen framing verified');
```

- [ ] **Step 2: Run the test and verify red**

Run:

```bash
cd "/Users/jm/Psychiatry-Clerkship-Library-alex-tour"
node tests/family-companion-evergreen.test.mjs
```

Expected: failure because the source still contains the June 16 event header.

---

## Task 6: Make the Canonical Family Companion Evergreen

**Files:**

- Modify: `06_Family_and_Relational/_source/index.html`
- Test: `tests/family-companion-evergreen.test.mjs`

- [ ] **Step 1: Update the source comment**

Replace the dated authorship comment with:

```html
<!-- Family Therapy Approaches with Adults
     Joshua Moss, MD · Evergreen Faculty Teaching Companion · Updated July 2026 -->
```

- [ ] **Step 2: Add restrained provenance styling**

Immediately after `.ft-session`, add:

```css
.ft-provenance {
  display: inline-block;
  margin-top: 3px;
  color: #D7E1DD;
  font-size: 0.72rem;
  letter-spacing: 0.02em;
  text-transform: none;
}
```

- [ ] **Step 3: Replace the visible event line**

Use:

```html
<div class="ft-session">
  EVERGREEN FACULTY TEACHING COMPANION · UPDATED JULY 2026<br>
  <span class="ft-provenance">Developed from a June 2026 family-therapy seminar.</span>
</div>
```

- [ ] **Step 4: Make the usage cue evergreen**

Replace the event-specific map hint with:

```html
<p class="ft-maphint">
  Click any node to open it. Use the three cases for preparation, teaching, or review —
  your answers save automatically <strong>on this device only</strong>.
</p>
```

- [ ] **Step 5: Update print and download provenance**

Use this print-session text:

```javascript
'Evergreen faculty teaching companion · Updated July 2026 · ' +
  'Developed from a June 2026 family-therapy seminar.'
```

Use these first two download lines:

```javascript
var out = ['FAMILY THERAPY APPROACHES WITH ADULTS — MY ANSWERS',
  'Evergreen faculty teaching companion · Updated July 2026',
  'Developed from a June 2026 family-therapy seminar.', ''];
```

- [ ] **Step 6: Replace the dated SVG center caption**

Use:

```javascript
}, 'EVERGREEN · UPDATED JULY 2026'));
```

- [ ] **Step 7: Run focused and canonical tests**

Run:

```bash
node tests/family-companion-evergreen.test.mjs
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
git diff --check
```

Expected: the evergreen test and both builds pass. The known `rapid_review.md` metadata warning may
remain and must be reported as an unrelated baseline warning.

- [ ] **Step 8: Commit the canonical cleanup separately**

Run:

```bash
git add 06_Family_and_Relational/_source/index.html \
  tests/family-companion-evergreen.test.mjs
git commit -m "fix: make family therapy companion evergreen"
```

---

## Task 7: Synchronize and Deploy the Family Companion

**Files:**

- Source: `06_Family_and_Relational/_source/index.html`
- Replace:
  `/Users/jm/Clinical/Presentations:Meeting/Family-Therapy-Didactic-June16/deploy-site/index.html`

**Netlify site ID:** `2150f5cf-18d8-41a2-b51c-f3d8e7e1a679`

The deploy directory has no reliable `.netlify/state.json`, and its generated Netlify configuration
contains a stale absolute publish path. Never run bare `netlify deploy` from this directory. Every
command below must retain both the explicit `--site` and `--dir` arguments.

- [ ] **Step 1: Reauthenticate and verify the immutable deploy target**

Run:

```bash
netlify api getSite --data '{"site_id":"2150f5cf-18d8-41a2-b51c-f3d8e7e1a679"}' | \
  /usr/bin/jq '{id,name,url,ssl_url}'
```

If the API reports an expired login, run `netlify login` and repeat. Confirm the returned production URL is
`https://family-therapy-seminar-companion.netlify.app/` before uploading anything.

- [ ] **Step 2: Copy only the committed canonical source**

Run:

```bash
cp "/Users/jm/Psychiatry-Clerkship-Library-alex-tour/06_Family_and_Relational/_source/index.html" \
  "/Users/jm/Clinical/Presentations:Meeting/Family-Therapy-Didactic-June16/deploy-site/index.html"
shasum -a 256 \
  "/Users/jm/Psychiatry-Clerkship-Library-alex-tour/06_Family_and_Relational/_source/index.html" \
  "/Users/jm/Clinical/Presentations:Meeting/Family-Therapy-Didactic-June16/deploy-site/index.html"
```

Expected: both SHA-256 values are identical.

- [ ] **Step 3: Publish a draft deploy**

Run:

```bash
netlify deploy \
  --dir "/Users/jm/Clinical/Presentations:Meeting/Family-Therapy-Didactic-June16/deploy-site" \
  --site 2150f5cf-18d8-41a2-b51c-f3d8e7e1a679 \
  --no-build \
  --message "Evergreen family therapy teaching companion"
```

Expected: Netlify returns a unique draft URL.

- [ ] **Step 4: Verify the draft visually**

Open the draft URL with the in-app Browser. Verify desktop and mobile headers, the provenance line,
map interaction, reset, download, and print preview. Confirm no June 16 event invitation remains.

- [ ] **Step 5: Publish production**

Only after the draft passes, run:

```bash
netlify deploy \
  --dir "/Users/jm/Clinical/Presentations:Meeting/Family-Therapy-Didactic-June16/deploy-site" \
  --site 2150f5cf-18d8-41a2-b51c-f3d8e7e1a679 \
  --no-build \
  --prod \
  --message "Evergreen family therapy teaching companion"
```

- [ ] **Step 6: Verify production content and headers**

Run:

```bash
curl -fsS https://family-therapy-seminar-companion.netlify.app/ | \
  rg "EVERGREEN FACULTY TEACHING COMPANION|Developed from a June 2026"
curl -fsSI https://family-therapy-seminar-companion.netlify.app/
shasum -a 256 \
  "/Users/jm/Psychiatry-Clerkship-Library-alex-tour/06_Family_and_Relational/_source/index.html"
curl -fsSL https://family-therapy-seminar-companion.netlify.app/ | shasum -a 256
```

Expected: both evergreen strings appear, the response is HTTP 200, and the local canonical and live
SHA-256 values match exactly.

---

## Task 8: Supporting-Site Exit Audit

- [ ] **Step 1: Open all three final destinations**

Use the in-app Browser to open:

1. `https://therapymatch-maine.netlify.app/`
2. The exact renamed Mental Health Education Library URL returned in Task 4
3. `https://family-therapy-seminar-companion.netlify.app/`

- [ ] **Step 2: Record approved tour labels**

Use exactly:

- **Working prototype — access and referral navigation**
- **Working library — patient and family education**
- **Teaching companion — family systems and supervision**

- [ ] **Step 3: Preserve the denominator distinction**

The tour itself should not advertise a provider count. Its TherapyMatch label is purpose-based; the
count consistency remains verifiable in the linked application's source and current documentation.

- [ ] **Step 4: Verify repository isolation**

Run:

```bash
git -C "/Users/jm/Code/therapy-match/TherapyMatch App" status --short --branch
git -C "/Users/jm/Code/therapymatch-alex-count" status --short --branch
git -C "/Users/jm/Psychiatry-Clerkship-Library-alex-tour" status --short --branch
```

Expected: the original dirty TherapyMatch checkout is untouched; the focused TherapyMatch branch is
clean after its commit; and the clerkship worktree contains only planned Alex Tour work.
