# Prepare for Tomorrow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give MS3 students one preparation guide for interviewing, rounds presentations, and progress notes, with 5- and 15-minute choices and entry points from Today and the Library.

**Architecture:** One single-file HTML tool owns teaching content and transient practice state. Existing MS3-only shipping, Library overlays, and shell navigation provide placement. A narrowly validated message bridge checkpoints task/time in outer browser history without remounting the tool or changing saved study sessions.

**Tech Stack:** Existing Python static builder, single-file HTML/CSS, ES5 JavaScript for shell snippets, Node built-in contract tests, and the existing Playwright smoke suite. No new runtime dependencies or services.

**Spec:** `docs/superpowers/specs/2026-10-02-prepare-for-tomorrow-design.md`, approved October 2, 2026.

## Global Constraints

- Offer 5-minute and 15-minute preparation sessions for each of the three tasks.
- All three tasks are available at every rotation week, including when no rotation start date is configured.
- Its presence does not alter the primary-action priority rule.
- Shared shell modules continue to use audience-neutral display copy and existing ES5 patterns.
- Use one single-file HTML tool in the MS3 Student Ready Pack with the build-injected Clinical Warm palette and content-height framing.
- The guide captures neither spoken rehearsal nor written responses.
- The preparation tool adds no durable completion record.
- Existing centrally gated page-open analytics retain their owner-controlled settings and default off.
- Faculty attestation, merge, and deployment remain separate decisions.
- Every task includes the repository rules: preserve unrelated work; use canonical shipped-page derivation; keep clinical content pending; do not promote attestations or change schemas in a content change; source crisis contacts through build injection; generate visual baselines only through the Ubuntu workflow.

## Review Focus

- An interrupted study block exists: preparation and optional resource visits must preserve its stored steps, capsule, progress, and resumability. Pinned in Tasks 4 and 6.
- Browser Back, reload, or duplicated/invalid query parameters occur: restore only a valid task/time pair; reset disclosure and practice state; retain the shell history snapshot. Pinned in Tasks 2, 4, and 6.
- A different frame or window sends a selection message: neither navigation, history, storage, nor the active resource may change. Pinned against the actual bridge in Tasks 4 and 6.
- A resource becomes pending or unavailable: expose its actual governance or absence, keep preparation content usable, and never substitute unrelated weekly content. Pinned in Tasks 3, 5, and 6.
- The default Essentials view or resident build differs from the full MS3 catalog: keep both MS3 entry points discoverable and the new route absent from resident output. Pinned in Tasks 3, 5, and 6.

## Execution boundaries and file map

This document is a plan, not product implementation. Initial output is a local, reviewable preview plus draft teaching examples for faculty review. Clinical publication requires the existing faculty workflow.

At execution, use an isolated managed worktree after reading the using-git-worktrees skill. Copy these approved local documents into that worktree if they remain uncommitted. Refresh current main and PR #938/#942 before choosing a base: both have Front Door overlap. Record baseline checks and run the collision sentinel for each task's proposed paths. An own-file draft is different from unrelated dirty work; never overwrite another owner's changes. If the sentinel's GitHub probe remains unavailable, supplement it with a complete read-only connector audit, preserving the incomplete report alongside the supplemental evidence.

Two change lanes are required:

1. `codex/prepare-tomorrow-governance`: Task 1 only, plus explanatory documentation and tests; no shipped clinical content.
2. `codex/prepare-for-tomorrow`: Tasks 2–6 after the prerequisite, with new content registered pending. When stacked locally on the first branch, use that branch as the explicit governance comparison base. Refresh the base before any push; never disable the pre-push hook. Publication of either branch is a separate authorized step.

The new source is `14_Tracks/MS3/Student_Ready_Pack/09_prepare_for_tomorrow/prepare-for-tomorrow.html`. It contains three distinguishable sections: JSON teaching data (`pft-data`), pure selection/state functions (`pft-engine`), and DOM/message wiring (`pft-dom`). Tests evaluate the pure engine without importing browser state. The source remains one HTML file; do not introduce a framework or generalized workflow abstraction.

| Area | Files | Responsibility |
| --- | --- | --- |
| Inventory prerequisite | `_automation/validate_tool_governance.py` and its Python test | Admit one named addition while retaining baseline and exact-inventory checks |
| Guide | New HTML source; `tests/prepare-for-tomorrow.test.mjs` | Six complete routes, reading, rehearsal, example reveal, tomorrow card |
| Shipping and placement | `site_extras.py`, `build_deploy.py`, `resident_section.py`, `curriculum.json`, registries | MS3 route, nav, both Library views, metadata, pending registration |
| Derived data | `shipped_pages.json`, `metrics/allowlist.json` | Regenerated inventories; no hand edits |
| Navigation | `frontdoor/fd_wire.js`, `spa_index.html`, `tests/fd-wire.test.mjs` | Restricted selection messages, outer history, clean optional links |
| Entry points | `fd_today.js`, `fd_library.js`, `frontdoor.css`, class inventory | Secondary invitation and selected-tool governance display |
| Browser verification | New smoke spec; existing Playwright configuration | Real MS3/resident, mobile/desktop, governance, history, and study-block behavior |

Paths under `_automation/` in this map mean `13_Faculty_Resources/_automation/`; `site_*`, build scripts, `frontdoor/`, and `spa_index.html` live in its `site_build/` directory.

---

### Task 1: Add a green inventory prerequisite without weakening coverage

**Files:**
- Modify: `13_Faculty_Resources/_automation/validate_tool_governance.py:356`, count calls near 414 and 464.
- Modify: `13_Faculty_Resources/_automation/test_validate_tool_governance.py`, count tests near 598, 678, 712, and 719.

**Interfaces:**
- Consumes: canonical `load_shipped_pages(root)` and existing `SHIPPED_SITE_KEYS`.
- Produces: `expected_tool_count(root: Path, site: str) -> int`; `validate_expected_tool_count(site, item_count, *, root=ROOT) -> None`; `validate_built_tool_inventory(document, tools_directory, *, site=None, root=ROOT) -> None`.
- Existing callers retain compatibility. Both source and built checks use the same repository root; default builders already operate on the real repository root.

- [x] **Step 1: Add controlled failing tests for the declared preparation addition.** Mock the canonical shipped document, independently of `_tool_entries`, and preserve the existing coordinated-source-drop test. Use this exact expected row:

```python
PREP_PAGE = {
    "slug": "prepare-for-tomorrow.html", "kind": "tool", "sites": ["ms3"],
    "source": "14_Tracks/MS3/Student_Ready_Pack/09_prepare_for_tomorrow/prepare-for-tomorrow.html",
}
with patch.object(governance, "load_shipped_pages", return_value={"pages": [PREP_PAGE]}):
    self.assertEqual(governance.expected_tool_count(ROOT, "ms3"), 24)
    self.assertEqual(governance.expected_tool_count(ROOT, "resident"), 26)
    with self.assertRaises(governance.GovernanceError):
        governance.validate_expected_tool_count("ms3", 23, root=ROOT)
```

Add fixtures for no preparation row (23/26), duplicate preparation rows, wrong source, wrong kind, wrong sites, unknown site, and unreadable/malformed canonical data. With a valid addition, truncate source enumeration by one item and verify the expected count remains 24 and rejects the truncated inventory. Verify built HTML/governance ID mismatch still rejects missing and extra files. In this same prerequisite-only change, replace hard-coded real-repository output/count assertions with `expected_tool_count(ROOT, site)`; keep controlled baseline/addition assertions explicitly pinned at 23/24/26. The coordinated-source-drop test computes its expected message from the helper. This lets the prerequisite remain green before and after registration without a second governance change in the content lane.

- [x] **Step 2: Run the new Python tests and record their pre-fix failure.**

```bash
python3 -m unittest discover -s 13_Faculty_Resources/_automation -p test_validate_tool_governance.py
```

Expected: the new helper is missing. Existing baseline assertions remain unchanged at this prerequisite stage.

- [x] **Step 3: Implement the narrowly named conditional addition.**

```python
def expected_tool_count(root: Path, site: str) -> int:
    if site not in EXPECTED_TOOL_COUNTS:
        raise GovernanceError("site: unsupported value")
    try:
        pages = load_shipped_pages(root)["pages"]
    except (ShippedPagesError, KeyError, TypeError) as error:
        raise GovernanceError("shipped_pages.json: cannot determine tool count") from error
    if not isinstance(pages, list):
        raise GovernanceError("shipped_pages.json: invalid pages")
    if any(not isinstance(page, dict) for page in pages):
        raise GovernanceError("shipped_pages.json: invalid page")
    additions = [p for p in pages if p.get("slug") == "prepare-for-tomorrow.html"]
    if len(additions) > 1:
        raise GovernanceError("shipped_pages.json: duplicate preparation tool")
    if additions:
        page = additions[0]
        if (page.get("kind") != "tool" or page.get("sites") != ["ms3"] or
            page.get("source") != "14_Tracks/MS3/Student_Ready_Pack/09_prepare_for_tomorrow/prepare-for-tomorrow.html"):
            raise GovernanceError("shipped_pages.json: invalid preparation tool registration")
    return EXPECTED_TOOL_COUNTS[site] + int(site == "ms3" and bool(additions))
```

Keep the 23/26 baseline. Pass `root` into source validation and allow controlled built-validation roots. Update synthetic built-validation tests to pass their temporary root explicitly; otherwise their expected count would accidentally come from the live repository. Read the canonical document independently from source enumeration: deriving both expected and actual from the same truncated iterator defeats the source-drop check. Never accept an arbitrary set of counts `{23, 24}`.

- [x] **Step 4: Run the Python suite and full local gate on the prerequisite-only branch.** Expected: current 23/26 remains green; only the declared future addition admits 24. Prove source-drop and built-file mutations still fail. The feature's registration test in Task 3 will independently require the guide once its content lands.
- [x] **Step 5: Commit only this governance prerequisite and its tests/documentation.** Suggested message: `Allow the declared MS3 preparation tool in inventory checks`. Do not include the new HTML, curriculum, or ledger registration in this change.

### Task 2: Build the six-route preparation workspace and draft teaching pack

**Files:**
- Create: `14_Tracks/MS3/Student_Ready_Pack/09_prepare_for_tomorrow/prepare-for-tomorrow.html`.
- Create: `tests/prepare-for-tomorrow.test.mjs`.

**Interfaces:**
- Produces: `pftValidSelection(task, minutes) -> boolean`; `pftParseSelection(search) -> {task,minutes,error}`; `pftReduce(data, state, action) -> state`; `pftRender(data, state) -> escaped HTML`.
- State: `{task:null|"interview"|"rounds"|"note",minutes:null|5|15,step:"choose"|"read"|"rehearse"|"card"|"done",exampleOpen:boolean,error:string}`.
- Actions: `task`, `minutes`, `start`, `next`, `example`, `reset`. Changing task/time resets to chooser and closes the example. `start` requires a valid pair and a complete route; `next` follows the ordered steps; `example` applies only during rehearsal; `reset` produces a fresh chooser.
- Message output consumed in Task 4: `{type:"prepare-selection",task,minutes}`. Selection only; no progress or response fields.

- [x] **Step 1: Write a test harness and failing behavioral contracts.**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
const path = new URL('../14_Tracks/MS3/Student_Ready_Pack/09_prepare_for_tomorrow/prepare-for-tomorrow.html', import.meta.url);
const html = readFileSync(path, 'utf8');
const script = html.match(/<script id="pft-engine">([\s\S]*?)<\/script>/);
assert.ok(script, 'the pure engine is present');
const P = new Function(script[1] + ';return {valid:pftValidSelection,parse:pftParseSelection,reduce:pftReduce,render:pftRender};')();
test('all six explicit selections are valid; coercions are rejected', () => {
  for (const task of ['interview', 'rounds', 'note']) {
    for (const minutes of [5, 15]) assert.equal(P.valid(task, minutes), true);
  }
  for (const pair of [['other',5],['note','15'],['note',10],[null,5]]) {
    assert.equal(P.valid(...pair), false);
  }
});
test('duplicate and partial selections return to the chooser', () => {
  for (const query of ['?prepareTask=note','?prepareMinutes=15',
    '?prepareTask=note&prepareTask=rounds&prepareMinutes=15',
    '?prepareTask=note&prepareMinutes=15&prepareMinutes=5']) {
    assert.deepEqual(P.parse(query), {task:null,minutes:null,error:'Choose a task and time to begin.'});
  }
});
```

Add state-transition tests: no implicit default, start rejection until both choices exist, six complete routes, example closed until intentionally revealed, task/time changes clear disclosure, no response fields, and complete route failure when a required reading/example/card field is absent. An entirely empty query returns a clean chooser with `error:''`. Malicious teaching strings are escaped, never interpreted as markup.

- [x] **Step 2: Run the new test and record its missing-source failure.**

```bash
node --test tests/prepare-for-tomorrow.test.mjs
```

- [x] **Step 3: Implement explicit selection parsing and pure state transitions.** The selection primitive is:

```js
function pftValidSelection(task, minutes){
  return (task==='interview'||task==='rounds'||task==='note')&&
    (minutes===5||minutes===15);
}
```

`pftParseSelection` uses `URLSearchParams.getAll`, requires exactly one task and one duration, accepts only literal URL values `5` or `15`, and converts after validating. Build rendered strings with a single escaping helper for `& < > " '`. Return a scoped unavailable message for incomplete teaching data. The pure engine reads neither DOM, storage, clock, nor network. Put event listeners and focus movement in `pft-dom`, using button `aria-pressed`, explicit step headings, native example disclosure, and announced errors.

- [x] **Step 4: Copy this complete draft teaching pack into `pft-data` and check each passage against its named source section.** Every route contains `orientation`, `reading:{heading,paragraphs,sourceRef,sourceSection}`, `rehearsal:{snapshot,prompt,example,reflection}`, and `card:{try,notice,ask}`. All new wording remains pending for faculty review.

```json
{
  "version": 1,
  "tasks": {
    "interview": {
      "title":"Interview a new patient",
      "resources":["pg_interview.md","interview-circle.html"],
      "routes":{
        "5":{
          "orientation":"Prepare your opening and identify the coverage you will need. This rehearsal uses a fictional situation.",
          "reading":{"heading":"Frame the conversation","paragraphs":["Introduce your role, explain the purpose, agree on time, and ask permission to begin.","The interview guide treats domains as a coverage map, while the patient's story remains the center of the conversation. Gather safety information before closing; the resident or attending makes disposition decisions."],"sourceRef":"pg_interview.md","sourceSection":"The Interview Frame; The interview as a circle; Safety Questions"},
          "rehearsal":{"snapshot":"A fictional newly admitted adult says: I am tired of answering the same questions. The team has asked you to introduce yourself and learn what matters most to them.","prompt":"Say your introduction aloud privately. Explain your role and purpose, ask permission, and invite the person's priority.","example":"I am a medical student working with your psychiatry team. I would like to understand what brought you here and what matters most to you today. Can we agree on how much time to spend together? Is it okay to start with what feels most important to you?","reflection":["Did you explain your role?","Did you invite permission and the person's priority?","What still needs to be covered before you close?"]},
          "card":{"try":"Introduce your role, purpose, and agreed time before your first question.","notice":"Which concern the person wants to start with.","ask":"Which parts of this interview would you like me to complete and bring back to you?"}
        },
        "15":{
          "orientation":"Rehearse an opening, a follow-up, and a closing summary. Keep the patient's story at the center while checking remaining coverage.",
          "reading":{"heading":"Use the coverage map","paragraphs":["Cover narrative, symptoms and timeline, safety, psychiatric history, substances, medical and medication contributors, trauma and development, family and social context, function and strengths, and a closing summary.","You can follow a thread and return to the story rather than asking every domain in a fixed order. Ask permission before sensitive topics and explain why you are asking.","Safety information belongs before the close. Positive safety answers go to the resident or attending promptly; disposition remains their responsibility."],"sourceRef":"pg_interview.md","sourceSection":"The interview as a circle; Safety Questions; Trauma-Informed Moves"},
          "rehearsal":{"snapshot":"In this fictional practice encounter, an adult says: I have barely slept, I am worried about missing work, and I do not want my family called yet. No other history, examination, or safety information is supplied.","prompt":"Privately rehearse an opening and one follow-up about their priorities. Then name the information still needed, including safety, and practice a closing summary that does not invent answers.","example":"I hear that sleep, work, and who we contact are important concerns. I would like to understand the timeline and what support you want. Before we finish, we also need to discuss safety and the other parts of your history. My summary so far is limited to what you have told me; I will bring the unanswered questions to my supervising team.","reflection":["Which supplied concern did you follow?","Which coverage domains remain unknown?","Did your summary distinguish known facts from unanswered questions?","Which concern needs supervision rather than an independent decision?"]},
          "card":{"try":"Follow the person's first concern, then return to the remaining coverage map.","notice":"What has been reported, what you observed, and what remains unknown.","ask":"Can we review my interview summary and the information I still need to gather?"}
        }
      }
    },
    "rounds":{
      "title":"Present on rounds",
      "resources":["doc_oral.md","oral.html"],
      "routes":{
        "5":{
          "orientation":"Prepare one concise daily update, rather than retelling the whole admission.",
          "reading":{"heading":"Daily rounds structure","paragraphs":["The documentation guide organizes a daily update around hospital day and active problem; overnight events; one patient-reported point and one MSE point; a risk update; and a plan question.","Use supplied or verified information. Name information you have not assessed rather than turning an absent fact into a reassuring finding."],"sourceRef":"doc_oral.md","sourceSection":"Daily Rounds Presentation Template; Common Student Pitfalls"},
          "rehearsal":{"snapshot":"Fictional day 3 admission for depressed mood and reduced intake. Nursing reports 6 hours of sleep and attendance at one group. The person says: I feel less overwhelmed. No current MSE or safety assessment is supplied.","prompt":"Give a brief update using only these facts. Include the missing information and one supervision question.","example":"Hospital day 3 for depressed mood and reduced intake. Nursing reports 6 hours of sleep and attendance at one group. Today the person reports feeling less overwhelmed. I have not yet gathered the current MSE or safety assessment. My question is which information you would like me to clarify before completing the update.","reflection":["Did you lead with the active problem?","Did you identify the source of the overnight information?","Did you name the missing assessment without inferring a risk level?"]},
          "card":{"try":"Lead with the active problem and what changed overnight.","notice":"Which facts belong in today's update instead of the full admission story.","ask":"What is the most useful question for me to bring to rounds today?"}
        },
        "15":{
          "orientation":"Organize a fictional interval snapshot, rehearse it privately, then compare its structure with an example.",
          "reading":{"heading":"Show your reasoning and uncertainty","paragraphs":["A concise daily presentation includes the active problem, overnight observations, one subjective point, one MSE point, current risk information, and a plan question.","The rubric values concision, organization, observable MSE language, formulation, and naming uncertainty. Avoid presenting an unanswered safety question as a completed assessment."],"sourceRef":"doc_oral.md","sourceSection":"60-Second Rounds Update; Oral Case Presentation Rubric; Common Student Pitfalls"},
          "rehearsal":{"snapshot":"Fictional day 3 admission for depressed mood and reduced intake. Nursing reports 6 hours of sleep, half of breakfast eaten, and attendance at one group. The person says: I feel less overwhelmed, but I am worried about where I will stay. During this practice conversation, speech is at a usual rate and responses follow the questions. Current safety, medication effects, and collateral information are not supplied.","prompt":"Prepare and privately deliver a concise update. Separate observations from interpretation and end with a supervision question. Rehearse a shorter second version after comparison.","example":"Hospital day 3 for depressed mood and reduced intake. Nursing reports 6 hours of sleep, half of breakfast eaten, and attendance at one group. The person feels less overwhelmed but is concerned about housing. In this encounter, speech was at a usual rate and responses followed the questions. Current safety, medication effects, and collateral remain to be clarified, so I cannot supply a completed risk update. My question is how you would like me to prioritize gathering those missing data and discussing the housing concern.","reflection":["Which details supported the active question?","Which observations did you keep separate from interpretation?","Which missing data did you name?","Can you make the second version shorter without losing the uncertainty?"]},
          "card":{"try":"Finish your update with one clear supervision question.","notice":"Whether your presentation distinguishes a reported change from a completed assessment.","ask":"Which missing fact would most improve this presentation?"}
        }
      }
    },
    "note":{
      "title":"Write a progress note",
      "resources":["doc_oral.md","mse.html"],
      "routes":{
        "5":{
          "orientation":"Practice one note section privately using only a supplied fictional interval update.",
          "reading":{"heading":"Record what changed","paragraphs":["The note template separates interval events, the person's report, MSE, formulation update, risk, and plan.","Interval events can include sleep, medication or safety events, nursing observations, and collateral or discharge updates. Do not copy forward an assessment that ignores today's context."],"sourceRef":"doc_oral.md","sourceSection":"Student Progress Note Template; Common Student Pitfalls"},
          "rehearsal":{"snapshot":"In a fictional admission, nursing reports 6 hours of sleep and attendance at one group. The person says: I feel less overwhelmed. No other interval information is provided.","prompt":"Privately draft separate Interval Events and Subjective sections. Keep the source of each fact visible and avoid adding missing findings.","example":"Interval Events: Nursing reports 6 hours of sleep and attendance at one group. Other interval data were not supplied for this exercise. Subjective: The person reports feeling less overwhelmed. Additional subjective assessment is not supplied.","reflection":["Did you separate nursing observations from the person's report?","Did you avoid inventing medication, examination, or safety findings?","Which information would you clarify before completing a real note?"]},
          "card":{"try":"Separate interval observations from the person's own report.","notice":"Which sentence is copied forward and needs a current update.","ask":"Can you review whether my note shows today's change clearly?"}
        },
        "15":{
          "orientation":"Draft a complete student note privately from a limited fictional encounter, making missing assessment information explicit.",
          "reading":{"heading":"Use the whole note structure","paragraphs":["The guide uses a one-liner, interval events, subjective report, MSE, formulation update, risk, and a plan organized by problem.","A formulation update explains today's change and its implications. Risk documentation must be current; a missing assessment cannot license a reassuring conclusion.","Use the supervising team's assessment and plan when finalizing real documentation. This exercise supplies no independent diagnosis, treatment change, or disposition decision."],"sourceRef":"doc_oral.md","sourceSection":"Student Progress Note Template; Common Student Pitfalls"},
          "rehearsal":{"snapshot":"Fictional adult on day 3 of admission for depressed mood and reduced intake. Nursing reports 6 hours of sleep, half of breakfast eaten, and attendance at one group. The person reports feeling less overwhelmed and being worried about housing. In this conversation, speech is at a usual rate and responses follow the questions. Safety assessment, medication review, other MSE domains, and collateral are not supplied.","prompt":"Privately write each note section. Use only supplied facts, identify missing assessment, and distinguish questions for the supervisor from established plan decisions.","example":"One-liner: Fictional adult on day 3 of admission for depressed mood and reduced intake, with ongoing housing concerns. Interval Events: Nursing reports 6 hours of sleep, half of breakfast eaten, and attendance at one group. Other interval information is not supplied. Subjective: Reports feeling less overwhelmed and worried about housing. MSE: Speech at a usual rate; responses follow the questions. Other domains are not assessed in this exercise. Formulation Update: The person reports improvement in feeling overwhelmed, while housing remains a concern. The available data do not establish a complete current formulation. Risk: Current safety assessment is not supplied; a risk conclusion cannot be completed from this snapshot. Plan: Review missing safety, medication, MSE, and collateral information with the supervising team; discuss the housing concern and document the team's decisions once clarified. This exercise proposes no independent treatment or disposition change.","reflection":["Did every asserted finding come from the snapshot?","Where did you name incomplete assessment?","Did the formulation reflect today's supplied change?","Did you distinguish supervision questions from decisions already made?"]},
          "card":{"try":"Update the formulation using today's verified information.","notice":"Which part of the assessment is incomplete or copied forward.","ask":"Which part of my formulation or plan needs clarification before the note is finalized?"}
        }
      }
    }
  }
}
```

Each task has exactly `"5"` and `"15"` routes. Validate all fields before starting an exercise and test the complete six-route pack. These are draft teaching examples, not reviewed clinical content; the local review packet must include the entire new pack. Retain the time allocations in the approved spec, and verify readability with faculty review rather than claiming measured reading times.

Use canonical teaching sections rather than inventing clinical doctrine:

- Interview: `The Interview Frame`, the coverage-map section, and the closing/supervision framing in `pg_interview.md`. Short route rehearses an opening; long route practices following a synthetic narrative and naming remaining coverage. Attribute selected source passages.
- Rounds: `Daily Rounds Presentation Template` and `60-Second Rounds Update` in `doc_oral.md`. Draft a fixed fictional interval snapshot and an illustrative concise presentation grounded only in those supplied facts. The long route adds rehearsal and uncertainty reflection.
- Note: `Student Progress Note Template` and `Common Student Pitfalls` in `doc_oral.md`. Short route practices one section. Long route supplies enough fictional interval information to draft a complete student note and compare it with an illustrative note; explicitly distinguish supplied facts from information not assessed or requiring supervision. Do not invent examination findings, collateral, medication administration, or risk conclusions from missing data.

Draft each tomorrow card around one task-specific action, observation, and supervision question. New excerpts, summaries, cases, examples, and cards remain pending for faculty review. Avoid new paper claims, dose literals, instrument item reproduction, and real-patient details. Because the guide includes interview coverage/risk preparation, include `<!-- crisis-block-html -->` and use the canonical injected block.

- [x] **Step 5: Complete DOM wiring and optional reading actions.** Render task/time selection, focused reading, rehearsal with reveal, tomorrow card, and neutral finish text. Use `aria-labelledby`, visible focus, readable phone layout, and CSS variables supplied by Clinical Warm with local token fallbacks for source-preview review. Use ordinary print CSS; no print service or export library. Do not add `cw-frame=viewport`.

In the built shell, optional links send these messages in order from the same child window:

```js
window.parent.postMessage({type:'prepare-selection',task:state.task,minutes:state.minutes}, window.location.origin);
window.parent.postMessage({type:'openPage',f:ref,search:'?'+(ref.slice(-5)==='.html'?'tool':'page')+'='+encodeURIComponent(ref)}, window.location.origin);
```

Allow `ref` only when it belongs to the selected task's fixed resource list. For the local source review, serve the worktree with `python3 -m http.server 4300 --bind 127.0.0.1 --directory .` and open the source at `/14_Tracks/MS3/Student_Ready_Pack/09_prepare_for_tomorrow/prepare-for-tomorrow.html`. When `parent===window`, canonical links open `/_build/ms3/?page=...` or `/_build/ms3/?tool=...` in a separate tab with `noopener`; label them as built resources and report if the local build is unavailable. For `file:` opens, show that resource links require the local preview server and send no messages. Completion sends no receipt or storage writes. The return-to-Today control targets the same-origin outer shell path with the fixed `?tab=today` query; use a normal top-level link rather than introducing a new unrestricted message type.

- [x] **Step 6: Run pure contracts and inspect the source preview.** Confirm six complete route definitions and no answer inputs, microphone, durable storage, automatic grades, readiness claims, or preparation-specific analytics calls. Commit source and tests on the content lane: `Add the MS3 preparation workspace and pending teaching examples`.

### Task 3: Register the guide on MS3 and derive its governed inventory

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/site_extras.py:48–69`.
- Modify: `13_Faculty_Resources/_automation/site_build/build_deploy.py:126–151`, nav near 449.
- Modify: `13_Faculty_Resources/_automation/site_build/resident_section.py:51`.
- Modify: `curriculum.json`, `tool_registry.json`, `topic_meta.json`, `13_Faculty_Resources/reviewed.json`.
- Regenerate: `13_Faculty_Resources/_automation/site_build/shipped_pages.json`, `metrics/allowlist.json`.
- Test: `site_build/test_shipped_pages.py`, `site_build/test_frontdoor_catalog.py`, `tests/prepare-for-tomorrow.test.mjs`.

**Interfaces:**
- Consumes: the completed HTML and Task 1's declared-inventory support.
- Produces: exactly one canonical page row with slug `prepare-for-tomorrow.html`, `kind:tool`, `sites:["ms3"]`; a resolved MS3 `byRef` item; no resident item or artifact.

- [x] **Step 1: Add failing shipped-page and catalog tests using the existing orientation-extra fixture pattern.**

```python
doc = shipped_pages.derive(ROOT)
prep = [p for p in doc["pages"] if p["slug"] == "prepare-for-tomorrow.html"]
self.assertEqual(len(prep), 1)
self.assertEqual(prep[0]["sites"], ["ms3"])
self.assertEqual(prep[0]["kind"], "tool")
self.assertEqual(prep[0]["source"],
    "14_Tracks/MS3/Student_Ready_Pack/09_prepare_for_tomorrow/prepare-for-tomorrow.html")
```

Pin membership in both default MS3 Essentials and the full catalog, absence from both resident views, honest pending metadata, and exact source path. Update the catalog fixture to include MS3 additions as well as resident additions. Current reference counts move MS3 full/Essentials 83/30 to 84/31; resident remains 93/35. Membership is the primary assertion; refresh counts against the execution base rather than overwriting unrelated additions.

- [x] **Step 2: Run and observe registration failures.**

```bash
python3 -m unittest discover -s 13_Faculty_Resources/_automation/site_build -p test_shipped_pages.py
python3 -m unittest discover -s 13_Faculty_Resources/_automation/site_build -p test_frontdoor_catalog.py
```

- [x] **Step 3: Register and copy the MS3 extra once.** Keep orientation assets in their existing package, then append the guide to the general extra-tool list:

```python
MS3_EXTRA_TOOLS = [entry for entry in MS3_ORIENT_VIDEO if entry[1].endswith(".html")] + [
    ("14_Tracks/MS3/Student_Ready_Pack/09_prepare_for_tomorrow/prepare-for-tomorrow.html",
     "prepare-for-tomorrow.html", "Prepare for tomorrow"),
]
```

In MS3 preflight/copy, process extra HTML not already copied with orientation assets using `_copy_required`; report missing source with the existing missing-assets collection. Remove all MS3-extra HTML from resident output after copying the MS3 tree, while retaining removal of orientation media. Add `_tool('prepare-for-tomorrow.html','Prepare for tomorrow')` to an appropriate MS3 skills nav section. Do not add it to shared `site_manifest.json` or resident nav. Existing `shipped_pages.derive()` already consumes this producer.

- [x] **Step 4: Add audience placement and pending registry records.** Use exact slug in `essentials.ms3` Tools, `siteLibrary.ms3.additions` under `Interactive tools`, a shared `libraryExclude` row with reason `MS3-only preparation guide; placed by the MS3 overlay`, and `libraryHints` with `Choose tomorrow's task and prepare in 5 or 15 minutes.`

Follow `one-patient-six-weeks.html` in `tool_registry.json`, using this complete row without a schema change:

```json
{"file":"prepare-for-tomorrow.html","title":"Prepare for tomorrow","sourcePath":"14_Tracks/MS3/Student_Ready_Pack/09_prepare_for_tomorrow/prepare-for-tomorrow.html","category":"foundations","riskLevel":"moderate","disclaimerType":"fictional-simulation-supervision","storageKeys":[],"evidenceIds":[],"relatedPages":["pg_interview.md","doc_oral.md"]}
```

Topic metadata uses its existing fields, with the exact existing `moderate` safety vocabulary and no new schema:

```json
{"prepare-for-tomorrow.html":{"tldr":"Choose tomorrow's task and prepare with a reading, rehearsal, and supervision question.","read":5,"points":["Interview a new patient","Present on rounds","Write a progress note"],"safetyLevel":"moderate","facultyReview":{"status":"pending"}}}
```

Merge that one entry into existing metadata. Numeric `read:5` is a browse estimate; the actual preparation route still offers 5 or 15. Add this preferred marker:

```html
<!-- [CLERKSHIP-META v1] tool="prepare-for-tomorrow" version="1.0" built="2026-10-02" category="foundations" audience="ms3" settings="self-study" time="5-15min" clinicalClaim="true" summary="Task-based preparation with synthetic rehearsal and supervision questions." -->
```

Register the new ledger row with the required pending identity and creation date:

```json
{"prepare-for-tomorrow.html":{"status":"pending","risk":{"kind":"clinical","level":"moderate"},"reason":"New preparation guide, synthetic examples, and tomorrow cards await faculty review.","at":"2026-10-02","by":"Pending faculty review"}}
```

Merge only this new row into the ledger; use the actual day of pending registration for `at` if execution occurs after the planning date. This is a pending-entry date, not a clinical review. Add no clinician signer or content hash, and never alter existing reviewed rows.

- [x] **Step 5: Regenerate derived files and run the focused validators.**

```bash
python3 13_Faculty_Resources/_automation/site_build/shipped_pages.py --write
python3 13_Faculty_Resources/_automation/site_build/analytics_events.py --write
python3 13_Faculty_Resources/_automation/validate_registry_schemas.py
python3 13_Faculty_Resources/_automation/validate_topic_meta.py
python3 13_Faculty_Resources/_automation/validate_attestation_consistency.py
python3 13_Faculty_Resources/_automation/validate_tool_governance.py
```

Confirm this source adds only an MS3 page key to generated analytics data and no task/completion events. Task 1 already moved real-repository count assertions to its expected-count helper; this content task must not edit governance tests. Run governance separation against the correct parent base before declaring the content lane clean.

- [x] **Step 6: Build MS3 then residents and verify actual output.**

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
```

Verify the guide exists in `_build/ms3/tools/`, its canonical row/nav/governance agree, and `_build/res/tools/prepare-for-tomorrow.html` does not exist. Commit content registration and generated data: `Register the preparation guide for MS3 only`.

### Task 4: Preserve preparation selection through safe shell history

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_wire.js:192–242`, 679–702, controller history near 1032–1103.
- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html:2684` (`fdAuxMessage`).
- Modify: `tests/fd-wire.test.mjs`, `tests/block-wiring.test.mjs`.
- Test: `tests/prepare-for-tomorrow.test.mjs`.

**Interfaces:**
- Produces: `fdPrepareSelection(data) -> {task,minutes}|null`; `fdPrepareSelectionRoute(search, selection) -> string|null`; `fdPrepareFrameParams(search) -> string`; controller method `replacePrepareSelection(selection) -> boolean`.
- `replacePrepareSelection` guards startup/destroy/wrong resource and uses replacement-only history. It returns success only after the valid route is replaced; it never renders or opens a resource.

- [x] **Step 1: Extend `memoryHistory` with a `state` getter and write failing pure/routing contracts.** Test exact own keys `minutes,task,type`, numeric duration, three fixed task IDs, and all malformed/duplicate/partial query cases. Tests for selection replacement must preserve the same snapshot object and mount count.

```js
const valid = {type:'prepare-selection',task:'note',minutes:15};
assert.deepEqual(F.fdPrepareSelection(valid), {task:'note',minutes:15});
assert.equal(F.fdPrepareSelection({...valid,answer:'private'}), null);
assert.equal(F.fdPrepareSelection({...valid,minutes:'15'}), null);
assert.equal(F.fdPrepareSelectionRoute('?tool=prepare-for-tomorrow.html', F.fdPrepareSelection(valid)),
  '?tool=prepare-for-tomorrow.html&prepareTask=note&prepareMinutes=15');
assert.equal(F.fdPrepareSelectionRoute('?tool=prepare-for-tomorrow.html&tool=oral.html',F.fdPrepareSelection(valid)), null);
assert.equal(F.fdPrepareSelectionRoute('?tool=prepare-for-tomorrow.html&page=doc_oral.md',F.fdPrepareSelection(valid)), null);
```

Add a controlled controller test that selects task/time, opens `doc_oral.md`, then goes Back. Expect `openId==='prepare-for-tomorrow.html'`, `fromHistory:true`, restored selection query, unchanged saved block, and reset example disclosure after remount.

- [x] **Step 2: Run the new contracts and record missing-helper failures.**

```bash
node --test tests/fd-wire.test.mjs tests/block-wiring.test.mjs tests/prepare-for-tomorrow.test.mjs
```

- [x] **Step 3: Implement scoped preparation parsing and route hygiene.** The exact message validator is:

```js
function fdPrepareSelection(data){
  if(!data||typeof data!=='object'||Array.isArray(data)) return null;
  if(Object.keys(data).sort().join(',')!=='minutes,task,type') return null;
  if(data.type!=='prepare-selection') return null;
  if(data.task!=='interview'&&data.task!=='rounds'&&data.task!=='note') return null;
  if(data.minutes!==5&&data.minutes!==15) return null;
  return {task:data.task,minutes:data.minutes};
}
```

`fdPrepareSelectionRoute` requires exactly one preparation `tool` and no `page`; it strips previous preparation values and block keys `block,n,limit,cat,resume`, then sets the two selection values. `fdPrepareFrameParams` accepts only exactly one valid task/time pair and returns those two parameters; it rejects partial or duplicate values. Delete preparation keys in `fdParamsWithoutRoute` and selectively restore them only for the preparation destination. Its iframe receives only that validated pair and the existing `governed=1`; retain existing pass-through behavior for other tools.

- [x] **Step 4: Add a dedicated, origin/source-checked branch to the actual message handler.** Resolve the live frame from `contentEl.querySelector('.toolframe')`: the legacy `currentToolFrame` variable is not assigned by normal Front Door tool mounting. Require the current item, controller `openId`, outer route, same origin, exact event source, and no faculty preview. Then call replacement-only controller history logic:

```js
if(data.type==='prepare-selection'){
  var selection=fdPrepareSelection(data);
  var frame=contentEl&&contentEl.querySelector('.toolframe');
  if(selection&&fdController&&!facultyPreviewRequest&&
      event.origin===location.origin&&frame&&event.source===frame.contentWindow&&
      currentItem&&currentItem.f==='prepare-for-tomorrow.html'&&
      fdController.getState().openId==='prepare-for-tomorrow.html'){
    fdController.replacePrepareSelection(selection);
  }
  return;
}
```

Inside `replacePrepareSelection`, use existing history ownership, guard committed startup and disposal, require the active preparation route, and call `history.replaceState(history.state,'',nextURL)` preserving the exact current snapshot. No route dispatch, iframe remount, push entry, storage write, or selection persistence belongs here. Keep unrelated existing message behavior outside this new branch.

- [x] **Step 5: Test the real message-handler branch with a rejection table.** Wrong origin; different frame; removed frame; wrong current item; wrong outer route; controller not committed or destroyed; faculty preview; extra own field; nonnumeric duration; invalid task; duplicate tool; both page/tool. Each rejected input preserves URL, history state, entry count, active frame identity, resource mount count, and storage sentinels. Valid messages update only the selection query. Test message ordering before optional resource navigation and confirm clean resource queries contain neither preparation nor block parameters.
- [x] **Step 6: Run targeted contracts and commit navigation.** Suggested message: `Keep preparation choices through safe browser navigation`.

### Task 5: Add the Today invitation and discoverable governed Library entry

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_today.js:362–451`.
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_library.js:99–115`.
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css`.
- Modify: `docs/superpowers/specs/front-door-handoff/CLASS-INVENTORY.md`, Today and Essentials sections.
- Modify: `tests/fd-today.test.mjs`, `tests/fd-library.test.mjs`.

**Interfaces:**
- Consumes: `index.byRef['prepare-for-tomorrow.html']`, canonical title/governance, and existing `data-fd-open` routing.
- Produces: one `.fd-prepare` secondary invitation, conditionally present only when that resolved item exists; selected Essentials preview includes its governance badge.

- [x] **Step 1: Add failing renderer fixtures.** Add the preparation item to a controlled MS3 index; compare a resident index without it and an unconfigured-week state. Test title, destination, visible pending/reviewed fixture behavior, and unchanged primary-rule table. Verify the Library tool shelf selects the preparation item and exposes one launch action with an ordinary governance badge.

```js
const prep = {ref:'prepare-for-tomorrow.html',kind:'tool',title:'Prepare for tomorrow',
  governance:{status:'pending',riskKind:'clinical',riskLevel:'moderate',
    by:'Pending faculty review',at:'2026-10-02',reason:'New preparation guide awaiting review.'}};
const idx = {...IDX,byRef:{...IDX.byRef,[prep.ref]:prep}};
const html = F.fdToday(idx, s({week:null}));
assert.match(html, /class="fd-prepare"/);
assert.match(html, /data-fd-open="prepare-for-tomorrow\.html"/);
assert.equal((html.match(/class="fd-prepare"/g)||[]).length, 1);
assert.doesNotMatch(F.fdToday(IDX,s({week:null})), /class="fd-prepare"/);
```

Use the existing valid governance fixture shape when adding badge assertions; do not read the live ledger for expected counts or status.

- [x] **Step 2: Run renderer tests and record absence of the invitation.**

```bash
node --test tests/fd-today.test.mjs tests/fd-library.test.mjs
```

- [x] **Step 3: Render the secondary invitation from actual item presence.** Add `fdPrepareInvitation(index)` next to Today helpers. Require the known tool item; render an accessible section with title `Prepare for tomorrow`, copy `Choose a task and prepare in 5 or 15 minutes.`, and one `data-fd-open` action. Place it after the lead-end marker, remaining below daily actions when `fdTodayLive` splices runtime rows. Never insert it into `FD_TODAY_PRIMARY_ORDER` or replace the lead card.

In `fdKitToolShelf`, include `governanceBadge(selected.governance,{compact:true})` in the selected-tool pane. Scope pending/reviewed tests to controlled fixtures and retain the full catalog's existing badge. Registration supplies its selectable Essentials tab; no second preparation destination or separate catalog is created.

- [x] **Step 4: Style and document the new surface.** Use shared `.fd-*` tokens for spacing, typography, and focus; prefer the existing quiet secondary style. Coordinate PR #942 color changes: safety red belongs to safety, so this ordinary preparation invitation uses the existing ordinary action palette. Update class inventory with `.fd-prepare` and every introduced child class, plus the selected-preview governance placement. Mobile layout stays single-column with no new nested scroll surface.
- [x] **Step 5: Run renderer contracts and commit.** Suggested message: `Expose preparation from Today and both Library views`.

### Task 6: Verify real navigation and deliver a local review packet

**Files:**
- Create: `tests/smoke/prepare-for-tomorrow.spec.js`.
- Modify: `tests/smoke/playwright.config.js`, add the new spec to `nav-ms3` and `nav-res` only.
- Create: `13_Faculty_Resources/Handoffs/PREPARE_FOR_TOMORROW_REVIEW.md`.
- Update: this plan's completion boxes as work completes.

**Interfaces:**
- Consumes: the built MS3/resident sites and controlled governance fixtures.
- Produces: local mechanical validation, an accessible preview, and a faculty review packet covering six pending teaching routes. These are distinct from deployed evidence or faculty attestation.

- [x] **Step 1: Add browser contracts before final integration.** Use controlled reviewed governance fixtures to exercise the complete UI, and pending/unavailable fixtures to exercise the real learner gate. Include reviewed status in both shell governance and tool-governance responses; interception must occur before navigation. Retain service workers blocked as the existing smoke configuration does. Never hand-edit the real ledger to make tests open the guide.

The happy-path assertion follows the real student interaction:

```js
await page.goto('/?tool=prepare-for-tomorrow.html');
const guide = page.frameLocator('iframe.toolframe');
await guide.getByRole('button',{name:'Write a progress note',exact:true}).click();
await guide.getByRole('button',{name:'About 15 minutes',exact:true}).click();
await guide.getByRole('button',{name:'Start preparation',exact:true}).click();
await expect(guide.getByRole('heading',{name:'Focused reading',exact:true})).toBeVisible();
await expect(page).toHaveURL(/prepareTask=note/);
await expect(page).toHaveURL(/prepareMinutes=15/);
```

Drive all six combinations through reading, rehearsal, example reveal, tomorrow card, and finish. Use 390×844 and 1280×800, plus keyboard-only chooser/start/disclosure/reset operation. Check no console errors, no horizontal overflow, visible focus, native disclosure state, and print-readable card structure.

- [x] **Step 2: Add the five failure-mode browser cases.** Start from Today and default Library; select the preparation tab and open its single destination. Seed a controlled unfinished study block and capsule; compare stored values before/after the guide and optional reading. Open a canonical resource, go Back, reload, and verify task/time recovery and disclosure reset. Dispatch rejection-table messages against the actual outer handler; no frame, snapshot, mount, or storage changes may occur. Simulate one missing resource and pending governance; assert honest labels and preserved available preparation content. On residents, assert absent Today/Library entry, absent artifact, and the ordinary not-found outcome for a direct route.

- [x] **Step 3: Run appropriate validation once the feature is assembled.**

```bash
node --test tests/prepare-for-tomorrow.test.mjs tests/fd-wire.test.mjs tests/block-wiring.test.mjs tests/fd-today.test.mjs tests/fd-library.test.mjs
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
bash bin/verify.sh
```

Run the long gate to a log and poll, as AGENTS.md requests. Do not bypass a red pre-push gate. If a failure appears environmental, compare the same check on clean main before attribution. Restore cached LFS media through the documented workflow when available; report an actual media limitation rather than counting skipped coverage as passed.

Start the repository's existing local-server helper from `tests/smoke` with `bash start-local-servers.sh`, leaving it running in its own session, then run from `tests/smoke`:

```bash
npx playwright test prepare-for-tomorrow.spec.js --project=nav-ms3 --project=nav-res
npx playwright test front-door.spec.js governance-warnings.spec.js tool-expand.spec.js --project=nav-ms3 --project=nav-res
```

Do not modify canary scope or workflows and do not regenerate visual baselines locally. Broaden testing only for an unresolved failure or new edit after these checks.

- [x] **Step 4: Assemble the faculty review packet.** Include the source path; all six route labels; verbatim new snapshots, examples, selected teaching passages, and tomorrow cards; source sections; remaining clinical questions; and the guide's pending status. Give an authorized local source-preview route for reviewing new teaching content if the normal learner build correctly blocks the pending tool. Keep the ordinary learner gate intact. Distinguish design approval from clinical approval, local checks from CI, and local preview from deployment.
- [x] **Step 5: Perform independent final code review using the chosen execution method.** With Native execution, use a fresh reviewer on the most capable available model, as the writing-plans handoff specifies. Review the assembled patch for inventory shrinkage, origin/source checks, misleading completion/readiness language, orphaned routes, audience leakage, and clinical-content/attestation separation. Resolve actionable findings and repeat only affected checks.
- [x] **Step 6: Commit the browser checks and review packet and show the local preview.** Suggested message: `Verify preparation journeys and provide the faculty review packet`. Report confirmed results, skipped/unavailable evidence, and pending faculty decisions. Do not claim that the site is deployed or clinically approved.

## Coverage map and handoff

| Approved design requirement | Tasks |
| --- | --- |
| Three tasks, two durations, explicit selection | 2, 6 |
| Focused reading, private rehearsal, example reveal, tomorrow card | 2, 6 |
| MS3-only shipping, nav, canonical inventory, analytics freshness | 1, 3, 6 |
| Both Today and both Library views, honest governance | 3, 5, 6 |
| Outer history restored without remount or persisted responses | 4, 6 |
| Existing study block and completion state preserved | 4, 6 |
| Accessible phone/desktop behavior and honest resource failure | 2, 5, 6 |
| Faculty-reviewed teaching and separate governance changes | 1, 2, 3, 6 |

Recommended execution: **Native**, with one implementer handling the closely linked tool, routing, and registration changes, followed by a fresh independent final reviewer. This minimizes shared-file conflicts and context overhead. **Subagent-driven** is also available: each task gets a fresh implementer and reviewer, with the task interfaces above carried into each dispatch. Parallelize only read-only research or work on genuinely disjoint files; the shared HTML, shell, generated outputs, and builds must remain sequential.

The connected-fictional-patient idea stays a future extension after these six routes receive faculty feedback. The next decision is written-plan review and execution-method selection; implementation starts after that decision.

Completion evidence (2026-10-03): fresh independent final review completed; its Important standalone-navigation finding was repaired in one RED-to-GREEN pass. Full local gate passed after committed product repair1ace985; 312 focused contracts, 22 applicable guide browser cases, and 20 controlled-governance contracts passed. The earlier ordinary browser suites covered300 passing cases with10 visible skips across the initial run and scoped rerun. Three Minor suggestions and all review limitations are preserved in `13_Faculty_Resources/Handoffs/PREPARE_FOR_TOMORROW_REVIEW.md`. Local preview remains open; feature/prerequisite branches and managed worktree are retained. Clinical teaching is pending faculty review, and no publication or attestation was performed.
