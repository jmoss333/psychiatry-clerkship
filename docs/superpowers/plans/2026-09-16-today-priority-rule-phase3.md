# "One Thing First" — Phase 3 (guest deep link, F4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A visitor who follows a link to one page or tool reads it without being asked who they are, and is assigned **no role**; their next plain visit runs the first-run wizard from step 1.

**Architecture:** One new branch in `fdResolveState` (`fd_wire.js`): a routed non-alias `page`/`tool` with no stored role resolves to `screen:'app'` with `guest:true` and no `role`. The two boot sites in `spa_index.html` that used to stamp `FD_ROLES[0]` onto a deep-link visitor stop doing so (they keep `browsing=true`). Nothing persists `guest` (`FD_KEYS` is unchanged), so the stored state after a guest visit has no role and the existing `!out.role → 'setup-role'` rule runs the wizard next time; the wizard's week step already patches `openId:null`, so the learner then lands on Today, not on the page they read as a guest.

**Spec:** handoff §5 and §7 C1–C4. **Authority:** Josh, in session 2026-09-16: "merged complete phase 3" — the written go the handoff required before this could merge.

## Ground truth (2026-09-16, branch `claude/today-priority-rule-p3` from `5fc37ac`)

`fd_wire.js` `fdResolveState` at ~97–149 (role default from `rotationStart` at 125–128, `!out.role → 'setup-role'` at 129). `spa_index.html` stamps a default role in **two** places, not one: the main boot (~2694–2697) and the prerelease/rejected-edition path (~2629–2632). `fdHeader(state)` reads no role. `fdSettingsRoles(roles, roleId)` marks no chip when `roleId` matches nothing. `fdLiveState` maps `role` → `roleId` + display name; with no role both are undefined and Today greets "there" (pinned by `fd-today.test.mjs`). The wizard's `data-fd-week` handler patches `openId:null, screen:'app'`.

## Global Constraints

Phase 1's constraints apply (ES5 in `frontdoor/`, audience-neutral copy, no new `cw_*` key). Additionally: `fd-wire.test.mjs` deep-equals `fdResolveState` outputs for a stored role (lines 78–81, 130–136) — the guest flag must appear **only** when there is no role. `fdResolveState('/', {})` must still return `setup-role` (line 137–140).

---

### Task 1: The resolver admits a guest (`fd_wire.js`)

- [ ] Test (append to `tests/fd-wire.test.mjs`): `/?page=pg_suicide.md` + `{}` ⇒ `screen:'app'`, `guest:true`, `openId:'pg_suicide.md'`, `fromTab:'today'`, no `role`; `/?tool=mse.html` + `{tab:'library'}` ⇒ same shape with `fromTab:'library'`; a stored role ⇒ no `guest` key; aliases (`__home__`, `__start__`) with `{}` ⇒ `setup-role`, no `guest`; `/` + `{openId, tab, browsing:true}` (what a guest visit leaves behind) ⇒ `setup-role`, no `role`, no `guest`.
- [ ] Run → red. Implement: replace `if(!out.role) out.screen='setup-role';` with
  ```js
  /* Guest deep link (2026-09-16): a routed page or tool with no stored role renders the resource
     without asking who the reader is, and assigns NO role -- so the next plain visit still runs
     the wizard from step 1. Aliases are not resources and keep the setup gate. */
  if(!out.role&&routedRef&&!fdIsLegacyRouteAlias(routedRef)){ out.guest=true; out.screen='app'; }
  else if(!out.role) out.screen='setup-role';
  ```
  keeping the following `else if … 'app'` / `else … 'setup-week'` lines.
- [ ] Run `node --test tests/fd-wire.test.mjs` → green. Commit.

### Task 2: The boot stops stamping a role (`spa_index.html`)

- [ ] Test (append to `tests/fd-shell-boot.test.mjs`): `doesNotMatch /fdStored\.role=\(FD_ROLES\[0\]/`, `doesNotMatch /fdPrereleaseStored\.role=\(FD_ROLES\[0\]/`, `match /if\(fdIncomingRef&&!fdIsLegacyRouteAlias\(fdIncomingRef\)&&!fdStored\.role\)\{\s*fdStored\.browsing=true;\s*\}/`, and the same shape for the prerelease path.
- [ ] Run → red. Implement: in both `if(…&&!fdStored.role){…}` blocks delete the `role=` line, keep `browsing=true`.
- [ ] Run the full node suite → green. Commit.

### Task 3: Header and settings hold with no role (tests only)

- [ ] `tests/fd-shell.test.mjs`: `fdHeader({})` and `fdHeader({tab:'today'})` render, contain no `undefined`, keep the safety button and the week pill.
- [ ] `tests/fd-settings.test.mjs`: `fdSheetSettingsBody(withState({ roles: ROLES }))` (no `roleId`) renders every role chip with `aria-pressed="false"` and no `is-active` — no chip is the truth.
- [ ] Run → both green already (behaviour exists; these are the guards). Commit with Task 2 or alone.

### Task 4: Smoke C1–C4 (`tests/smoke/front-door.spec.js`, both audiences)

- [ ] C1: fresh context (freeze time, no seed) → `/?page=pg_suicide.md` renders the reader, no "Who's this for?" heading, header present without the text "undefined"; open settings → every `.fd-choices__btn` has `aria-pressed="false"`; close; click the reader's `[data-fd-back]` → `.fd-today` visible, exactly one primary (the setup CTA), `cw_frontdoor_v1` has no `role` key.
- [ ] C2: then `goto('/')` → "Who's this for?" visible.
- [ ] C3: complete the wizard from that state (role, week 1) → `.fd-today` visible and the URL carries no `page=`; the existing "first run reaches Today" test stays untouched.
- [ ] C4: as the guest on Today, `history.length` before; click the first `.fd-quicktool` → URL has `tool=`; `history.length` grew by exactly 1; `goBack()` → `.fd-today` visible with the same primary. (The guest's primary is the setup CTA, which opens the week wizard in place without navigating, so the history contract is measured on a resource open instead.)
- [ ] Run on both audiences against fresh builds → green. Commit.

### Task 5: Gates and PR

Same battery as Phases 1–2: node suite → `bin/verify.sh` → both builds → drift gate → smoke (One Thing First + field guide + hostile dialog + runtime, both audiences, uncontended) → push → PR. PR body: the contract change in one sentence, Josh's approval quoted, the two boot sites, tests added, gates, and that nothing is persisted for a guest.
