# GriefSpace Quick Actions Interactivity

**Date:** 2026-03-31
**Status:** Approved
**Scope:** `tools-suite/tools/generated/griefspace-app.app.jsx`, `tools-suite/tools/griefspace-app.html`

## Summary

Add interactivity, completion tracking, inline timers, cross-tool links, Patterns integration, and expanded content to the existing Quick Actions (MICRO_ACTIONS) system in GriefSpace.

## Current State

- `MICRO_ACTIONS`: static object mapping 8 emotions → 3 actions each (24 total)
- Each action: `{ id, emoji, title, desc, type }` where type ∈ {grounding, breath, body, expression}
- `MicroActionPanel` component renders inside `ModuleScreen` (pathway lesson pages)
- Already has: `logAction()` writing to `STORAGE.MICRO_LOG`, inline breathing timer for `type: 'breath'`, expand/collapse detail per action type
- `MICRO_LOG` schema: `{ id, emotion, action, timestamp }`
- Dashboard (`DashboardScreen`) does not reference MICRO_LOG

## Changes

### 1. "I tried this" button + warm confirmation

**Location:** Bottom of each expanded Quick Action detail panel in `MicroActionPanel`.

**Behavior:**
1. Button label: **"I tried this ✓"** (subtle outline style, not primary)
2. On tap: button text swaps to **"Good. That matters."** with 300ms fade-in animation, button becomes non-interactive
3. After 2.5 seconds, text transitions to a persistent muted **"✓ Done"** state (remains for the rest of the session)
4. Calls `logAction(action)` with `completed: true` flag (see data changes below)
5. On the Quick Action card itself (collapsed state), show a small `✓` badge in the top-right corner for any action the user has previously completed
6. Badge check reads from MICRO_LOG: if any entry has `action === act.id && completed === true`, show badge

**State:** `completedIds` set, derived from MICRO_LOG on mount. Updated locally after each "I tried this" tap without requiring reload.

### 2. Inline mini-timer for timed body actions

**Currently:** Only `type: 'breath'` actions get timer buttons (1/3/5 min). The existing `startTimer()`, `timer` state, `running` state, and `fmtTime()` in `MicroActionPanel` are reused.

**Change:** Add optional `timer` field (seconds) to action data. For non-breath actions that have `timer`, render:

```
▶ Start [duration] timer
```

Button triggers `startTimer(action.timer)`. Countdown displays in `M:SS` format using existing `fmtTime`. When timer reaches 0, auto-mark action as completed (call logAction with completed: true).

**Actions receiving timers:**

| ID | Action | Timer |
|----|--------|-------|
| s1 | Comfort object | 120s |
| a1 | Clench and release | 15s |
| w1 | Permission to pause | 300s |
| x3 | Progressive release | 120s |

**UI:** Rendered inside the `body` and `grounding` type detail panels, below the description text. Same visual style as existing breath timer buttons but single button (not 1/3/5 options).

### 3. Breathing tool link

**Location:** Inside `type: 'breath'` detail panels, below the existing timer buttons.

**Markup:**
```
Or try the full experience →
[Open Breathing tool]  (gs-btn-ghost style link)
```

**Routing:** Calls `onNavigate('breathing')`.

**Prop change:** `MicroActionPanel` gains an `onNavigate` prop. Passed through from `ModuleScreen` which already receives navigation context. Falls back gracefully — if `onNavigate` is not provided, the link is not rendered.

### 4. Patterns tab — "This week you tried" card

**Location:** `DashboardScreen`, new card between "This Week" summary and "Pattern Insights".

**Data source:** `STORAGE.MICRO_LOG` entries from past 7 days where `completed === true`.

**Rendering logic:**
1. Load MICRO_LOG, filter to entries with `completed === true` and timestamp within last 7 days
2. Resolve `action` field → title by looking up across all MICRO_ACTIONS emotion arrays
3. Deduplicate by action ID (same action tried multiple times → shown once)
4. If completed actions exist: **"🎯 This week you tried"** heading, followed by action titles as a gentle list (emoji + title per line, max 8 shown)
5. If no completed actions: **"Try a Quick Action from any lesson — it'll show up here."** in muted text, no card chrome

**Empty state integration:** This card is shown regardless of whether check-ins exist. It provides a sense of progress even for users who only use Quick Actions without formal journaling.

### 5. Expand to 5 actions per emotion

Add 2 new actions to each of the 8 emotion categories (16 new actions, 40 total). New actions follow the existing schema with optional `timer` field.

**New actions by emotion:**

**numb:**
- `n4` 🫁 Deep sighing — "Take 3 deep sighs. Let each one be louder than the last." (type: breath)
- `n5` ✋ Texture hunt — "Find 3 different textures nearby. Touch each one for 10 seconds." (type: grounding, timer: 30)

**angry:**
- `a4` 🚶 Stomp walk — "Walk hard and fast for 2 minutes. Let your feet hit the ground with purpose." (type: body, timer: 120)
- `a5` 🧊 Cold reset — "Hold ice or run cold water on your wrists. The shock resets your nervous system." (type: grounding)

**sad:**
- `s4` 🫂 Self-hug — "Wrap your arms around yourself and squeeze gently for 30 seconds. This activates your calm system." (type: body, timer: 30)
- `s5` 🕯️ Candle gaze — "Light a candle or look at a warm light. Watch it quietly for 2 minutes." (type: grounding, timer: 120)

**lost:**
- `l4` 🪟 Window pause — "Go to a window. Look at something far away for 1 minute. Let your eyes rest." (type: grounding, timer: 60)
- `l5` 🫀 Heart anchor — "Place your hand on your chest. Count 10 heartbeats. You are here." (type: body)

**guilty:**
- `g4` 📝 Permission slip — "Write yourself a permission slip: 'I give myself permission to ___.' Fill in the blank." (type: expression)
- `g5` 🌊 Wave breathing — "Inhale for 4, exhale for 6. Imagine waves washing guilt out to sea." (type: breath)

**anxious:**
- `x4` 🤲 Palm press — "Press your palms together hard for 10 seconds, then release. Notice the tingle." (type: body, timer: 10)
- `x5` 🔢 Countdown — "Count backward from 20 slowly. Focus on each number." (type: grounding)

**lonely:**
- `o4` 📸 Memory scroll — "Look at 3 photos of people you love. Let yourself smile or cry." (type: expression)
- `o5` 🎧 Voice comfort — "Listen to a voicemail, podcast, or song by someone whose voice feels safe." (type: expression)

**overwhelmed:**
- `w4` 🧊 Cold face — "Splash cold water on your face or hold a cold cloth to your forehead for 30 seconds." (type: body, timer: 30)
- `w5` 📦 One box — "Pick one small area (a drawer, a shelf). Organize just that. Nothing else." (type: grounding)

## Data Changes

### MICRO_ACTIONS schema

```javascript
// Existing
{ id: string, emoji: string, title: string, desc: string, type: 'grounding'|'breath'|'body'|'expression' }

// New (optional timer field)
{ id: string, emoji: string, title: string, desc: string, type: string, timer?: number }
```

Backward compatible — existing actions without `timer` are unaffected.

### MICRO_LOG schema

```javascript
// Existing entries
{ id: string, emotion: string, action: string, timestamp: ISO }

// New entries add completed flag
{ id: string, emotion: string, action: string, timestamp: ISO, completed: true }
```

Backward compatible — old entries without `completed` are treated as views/opens (not completions). The `completed` field is only set to `true` (never `false`), so its absence means "not completed."

### No new storage keys

Everything uses the existing `STORAGE.MICRO_LOG` key.

## CSS Changes

New classes in `griefspace-app.html`:

- `.gs-micro-done-btn` — "I tried this" button (outline style, muted)
- `.gs-micro-done-confirm` — "Good. That matters." confirmation text (fade-in animation)
- `.gs-micro-done-settled` — "✓ Done" settled state (muted checkmark)
- `.gs-micro-badge` — small checkmark badge on completed action cards
- `.gs-micro-timer-btn` — "▶ Start timer" button for body/grounding actions
- `.gs-micro-breathing-link` — "Open Breathing tool" ghost link
- `.gs-tried-card` — "This week you tried" card in Patterns dashboard
- `.gs-tried-list` — list of tried action items

## Component Changes

| Component | Change |
|-----------|--------|
| `MicroActionPanel` | Add `onNavigate` prop, `completedIds` state, "I tried this" button, timer for non-breath timed actions, breathing tool link |
| `ModuleScreen` | Pass `onNavigate` through to `MicroActionPanel` |
| `DashboardScreen` | Add "This week you tried" card reading from MICRO_LOG |
| `MICRO_ACTIONS` (data) | Add 16 new actions (2 per emotion), add `timer` field to 8 actions |

## Testing

QA harness additions:
- Verify MICRO_ACTIONS has 5 entries per emotion (40 total)
- Verify `timer` field is a positive number where present
- Verify MICRO_LOG entries with `completed: true` are created by logAction
- Verify DashboardScreen renders tried-actions card when MICRO_LOG has completed entries
