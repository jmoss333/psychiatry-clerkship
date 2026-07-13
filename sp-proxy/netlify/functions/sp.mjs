// SP Interview proxy — LLM standardized patient, live mode (Netlify Functions v2, ESM).
// Auth/CORS/structure mirrors faculty-console/netlify/functions/attest.mjs.
//
// Security model:
//   • ANTHROPIC_API_KEY lives ONLY here, in the server env. The browser never sees it.
//   • Every request must carry the rotation-block student passcode (SP_STUDENT_PASSCODE),
//     compared in constant time. Rotate the passcode each rotation block.
//   • The case pack is fetched server-side from SP_PACK_URL (the attested repo copy) and is
//     the ONLY source of prompts and clinical content. The client never supplies prompt text.
//   • Gate/rapport state is re-derived server-side from the transcript on every call —
//     a modified client cannot unlock a gated disclosure by claiming state.
//   • Locked gated reveals are NEVER placed in the actor's context (only their deflection
//     lines are), so prompt-injection cannot extract what the model was never given.
//   • Responses return only {reply, state} / {feedback}. Logs are metadata-only: no
//     message text, no transcripts. Student transcripts live in the student's browser.
//
// Endpoints (config.path = "/api/sp"):
//   GET   → health: {ok, cases, actorModel} (passcode required)
//   POST  → {caseId, turns:[{me,pt}], message}                      → converse
//           {caseId, mode:"evaluate", turns, selfAssess:{a,b,c}}    → evaluate
//
// Required env vars (Netlify UI, never in code):
//   ANTHROPIC_API_KEY      server-side Anthropic key
//   SP_STUDENT_PASSCODE    shared student passcode for the current rotation block
//   SP_PACK_URL            URL of the attested pack, e.g.
//                          https://raw.githubusercontent.com/jmoss333/psychiatry-clerkship/main/_prototypes/sp-interview/sp-interview.pack.json
// Optional:
//   SP_MODEL_ACTOR         pinned actor model (default below — MUST match pack.engine.modelPinned)
//   SP_MODEL_EVALUATOR     pinned evaluator model
//   SP_ALLOWED_ORIGINS     comma-separated origins (default "*")
//   SP_MAX_TURNS           per-encounter turn cap (default 40)
//   SP_DAILY_LIMIT         encounters/day across the passcode (default 200 turns-equivalent guard)
//   SP_MAX_TOKENS_ACTOR    default 300
//   SP_MAX_TOKENS_EVAL     default 1500

const API_KEY = process.env.ANTHROPIC_API_KEY;
const KEY = process.env.SP_STUDENT_PASSCODE;
const PACK_URL = process.env.SP_PACK_URL;
const MODEL_ACTOR = process.env.SP_MODEL_ACTOR || 'claude-haiku-4-5-20251001';
const MODEL_EVAL = process.env.SP_MODEL_EVALUATOR || MODEL_ACTOR;
const ORIGINS = (process.env.SP_ALLOWED_ORIGINS || '*').split(',').map(s => s.trim());
const MAX_TURNS = parseInt(process.env.SP_MAX_TURNS || '40', 10);
const DAILY_LIMIT = parseInt(process.env.SP_DAILY_LIMIT || '2000', 10); // LLM calls/day, all users
const MAX_TOKENS_ACTOR = parseInt(process.env.SP_MAX_TOKENS_ACTOR || '300', 10);
const MAX_TOKENS_EVAL = parseInt(process.env.SP_MAX_TOKENS_EVAL || '1500', 10);
const MAX_MSG_CHARS = 1200;

const ANTHROPIC = 'https://api.anthropic.com/v1/messages';

function corsOrigin(request) {
  const o = request.headers.get('origin') || '';
  if (ORIGINS.includes('*')) return '*';
  return ORIGINS.includes(o) ? o : ORIGINS[0];
}
function cors(request) {
  return {
    'Access-Control-Allow-Origin': corsOrigin(request),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-student-key',
    'Content-Type': 'application/json',
  };
}
function json(request, status, obj) {
  return new Response(JSON.stringify(obj), { status, headers: cors(request) });
}
function safeEqual(a, b) {
  a = String(a || ''); b = String(b || '');
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
function authed(request) { return KEY && safeEqual(request.headers.get('x-student-key'), KEY); }

/* ------------------------- daily quota (best effort) -------------------------
   Durable when @netlify/blobs is available (package.json includes it); falls back
   to per-container memory otherwise. Metadata only: a counter, keyed by date. */
let memQuota = { day: '', n: 0 };
async function bumpQuota() {
  const day = new Date().toISOString().slice(0, 10);
  try {
    const { getStore } = await import('@netlify/blobs');
    const store = getStore('sp-quota');
    const cur = parseInt((await store.get(day)) || '0', 10) + 1;
    await store.set(day, String(cur));
    return cur;
  } catch {
    if (memQuota.day !== day) memQuota = { day, n: 0 };
    memQuota.n++;
    return memQuota.n;
  }
}

/* ------------------------------- pack cache ------------------------------- */
let packCache = { at: 0, pack: null };
async function getPack() {
  if (packCache.pack && Date.now() - packCache.at < 5 * 60 * 1000) return packCache.pack;
  const r = await fetch(PACK_URL, { headers: { 'User-Agent': 'sp-proxy' } });
  if (!r.ok) throw new Error(`pack fetch → ${r.status}`);
  const pack = await r.json();
  packCache = { at: Date.now(), pack };
  return pack;
}

/* --------------- deterministic state derivation (mirrors MockProvider) ---------------
   Re-run over the full student transcript on every request. The client is untrusted. */
function compileIntents(caseDef) {
  return caseDef.intents.map(it => ({ ...it, rx: it.patterns.map(p => new RegExp(p, 'i')) }));
}
function matchIntents(compiled, text) {
  return compiled.filter(it => it.rx.some(r => r.test(text))).map(it => it.id);
}
function deriveState(caseDef, studentMsgs) {
  const compiled = compileIntents(caseDef);
  const rr = caseDef.rapportRules;
  const s = { rapport: 0, covered: {}, unlocked: {}, closedRun: 0, reflections: 0,
              greetUsed: false, openInviteUsed: false, flagHistory: [], lastIntents: [], lastFlags: [] };
  for (const text of studentMsgs) {
    const hits = matchIntents(compiled, text);
    const flags = hits.filter(h => ['judgmental', 'premature_reassurance', 'ooc_attempt'].includes(h));
    for (const r of rr.raises) {
      if (!hits.includes(r.intent)) continue;
      if (r.intent === 'greeting_agenda') { if (s.greetUsed) continue; s.greetUsed = true; }
      if (r.intent === 'open_invite' && r.onlyFirstTime) { if (s.openInviteUsed) continue; s.openInviteUsed = true; }
      s.rapport = Math.min(4, s.rapport + r.delta);
      if (r.intent === 'reflection') s.reflections++;
    }
    for (const r of rr.lowers) if (r.intent && hits.includes(r.intent)) s.rapport = Math.max(-3, s.rapport + r.delta);
    const isQ = /\?\s*$/.test(text.trim());
    const isOpenish = hits.includes('open_invite') || hits.includes('reflection');
    if (isQ && !isOpenish) s.closedRun++; else s.closedRun = 0;
    const runRule = rr.lowers.find(r => r.closedRun);
    if (runRule && s.closedRun === runRule.closedRun) s.rapport = Math.max(-3, s.rapport + runRule.delta);
    hits.forEach(h => { s.covered[h] = true; });
    // gates — MIRROR THE CLIENT MockProvider's one-reply-per-turn cascade exactly, or the server
    // diverges from the untrusted client reference and breaks parity invariant #1. The client
    // (sp-interview.html respond): a flagged turn answers with a flag line and never touches a
    // gate; an si_direct / si_euphemism turn is consumed by the SI branch and never falls through
    // to the secondary gates; and the secondary loop breaks after the first match (one gate/turn).
    if (!flags.length) {
      const recentFlags = s.flagHistory.slice(-2).flat();
      const g0 = caseDef.gated[0];
      let handled = false;
      if (hits.includes('si_direct')) {
        handled = true; // SI branch always produces the reply → secondary gates skipped this turn
        if (!s.unlocked[g0.id] && s.rapport >= g0.requiresRapport
            && !(g0.blockedByRecentFlags || []).some(f => recentFlags.includes(f))) {
          s.unlocked[g0.id] = true;
        }
      } else if (hits.includes('si_euphemism') && !s.unlocked[g0.id]) {
        handled = true; // euphemism is deflected, not answered — no unlock, secondary skipped
      }
      if (!handled) {
        for (let i = 1; i < caseDef.gated.length; i++) {
          const gd = caseDef.gated[i];
          if (hits.includes(gd.requiresIntents[0])) {
            if (s.unlocked[gd.requiresGate]) s.unlocked[gd.id] = true;
            break; // client replies once per turn → at most one secondary gate advances
          }
        }
      }
    }
    s.flagHistory.push(flags);
    s.lastIntents = hits; s.lastFlags = flags;
  }
  return s;
}
function computeCoverage(caseDef, s) {
  return caseDef.checklist.map(c => {
    let status;
    if (c.dependsOnGate && !s.unlocked[c.dependsOnGate]) status = 'na';
    else {
      const got = c.intents.filter(i => s.covered[i]).length;
      if (got === c.intents.length) status = 'observed';
      else if (got > 0) status = 'partial';
      else if ((c.partialIfOnly || []).some(i => s.covered[i])) status = 'partial';
      else status = 'missed';
    }
    return { id: c.id, label: c.label, status, critical: !!c.critical };
  });
}

/* ------------------------------ prompt assembly ------------------------------ */
function actorSystem(caseDef, s) {
  // Locked gates: ONLY deflection lines enter context. Unlocked: reveal + repeatAsk.
  const gates = caseDef.gated.map(g => s.unlocked[g.id]
    ? { id: g.id, status: 'UNLOCKED', reveal: g.reveal, ifAskedAgain: g.repeatAsk || null }
    : { id: g.id, status: 'LOCKED — you do not know this content exists; if probed, use the deflection',
        deflection: g.deflectLowRapport || g.deflectIfLocked || g.deflectEuphemism || 'deflect naturally' });
  const personaBlock = JSON.stringify({
    persona: caseDef.persona,
    hiddenAgendaToneOnly: 'You carry shame and fear of being a burden; you test whether the interviewer will flinch or judge. Do not state this openly.',
    symptomInventory: caseDef.responses,
    inventoryRule: 'The scripted lines above are your ground truth. Paraphrase naturally in your own words; NEVER invent symptoms, history, names, or facts beyond them.',
    gates,
  });
  return caseDef.promptTemplates.actor
    .replace('{{PERSONA_BLOCK}}', personaBlock)
    .replace('{{RAPPORT}}', String(s.rapport))
    .replace('{{UNLOCKED}}', JSON.stringify(Object.keys(s.unlocked)))
    // M1: the director side-channel is deterministic and server-side; actor returns prose only.
    .replace(/Output JSON:.*$/s, 'Respond with the patient\'s spoken words only — no JSON, no narration of internal state, no stage directions longer than a brief *action*.');
}
function evaluatorSystem(caseDef, coverage, s) {
  return caseDef.promptTemplates.evaluator + '\n\nRUBRIC: ' + JSON.stringify(caseDef.rubric)
    + '\nCOVERAGE_MAP (deterministic — trust it): ' + JSON.stringify(coverage)
    + '\nRAPPORT_FINAL: ' + s.rapport + '  REFLECTIONS_USED: ' + s.reflections
    + '\nTEACHING_POINTS (the only management content you may draw on): ' + JSON.stringify(caseDef.debriefTeachingPoints)
    + '\nLINKED_PAGES (growth points must map to these): ' + JSON.stringify(caseDef.linkedPages)
    + '\nOUTPUT_SCHEMA (strict JSON, no code fences): {"domains":{"alliance":{"rating":"observed|partial|missed","note":"…"},"data":{…},"technique":{…},"organization":{…}},"strengths":["…","…"],"growth":[{"t":"Next time, try …","link":"<one of LINKED_PAGES>"},{…}],"selfAssessmentNote":"…"}';
}
async function callAnthropic(model, system, messages, maxTokens) {
  const r = await fetch(ANTHROPIC, {
    method: 'POST',
    headers: { 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages }),
  });
  if (!r.ok) throw new Error(`anthropic → ${r.status} ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
}

/* ---------------------------------- handler ---------------------------------- */
export default async (request) => {
  if (request.method === 'OPTIONS') return new Response('', { status: 204, headers: cors(request) });
  if (!API_KEY || !KEY || !PACK_URL) return json(request, 500, { error: 'server not configured (need ANTHROPIC_API_KEY, SP_STUDENT_PASSCODE, SP_PACK_URL)' });
  if (!authed(request)) return json(request, 401, { error: 'unauthorized' });

  try {
    const pack = await getPack();

    if (request.method === 'GET') {
      return json(request, 200, { ok: true, actorModel: MODEL_ACTOR, evaluatorModel: MODEL_EVAL,
        packVersion: pack.version, packStatus: pack.status, cases: pack.cases.map(c => c.id) });
    }
    if (request.method !== 'POST') return json(request, 405, { error: 'method not allowed' });

    const body = await request.json().catch(() => ({}));
    const caseDef = pack.cases.find(c => c.id === body.caseId);
    if (!caseDef) return json(request, 400, { error: 'unknown caseId' });
    const turns = Array.isArray(body.turns) ? body.turns.slice(0, MAX_TURNS) : [];
    if (turns.length >= MAX_TURNS && body.mode !== 'evaluate') return json(request, 429, { error: 'turn cap reached — end the encounter' });

    // Reject an empty converse message BEFORE charging daily quota: the counter meters LLM calls,
    // and an empty message never reaches callAnthropic (re-checked at the converse guard below).
    if (body.mode !== 'evaluate' && !String(body.message || '').trim()) return json(request, 400, { error: 'empty message' });

    const used = await bumpQuota();
    if (used > DAILY_LIMIT) return json(request, 429, { error: 'daily limit reached — try again tomorrow (or use the offline patient)' });

    if (body.mode === 'evaluate') {
      const studentMsgs = turns.map(t => String(t.me || '').slice(0, MAX_MSG_CHARS));
      const s = deriveState(caseDef, studentMsgs);
      const coverage = computeCoverage(caseDef, s);
      const transcript = turns.map((t, i) => `[${i + 1}] STUDENT: ${String(t.me || '').slice(0, MAX_MSG_CHARS)}\n[${i + 1}] PATIENT: ${String(t.pt || '').slice(0, MAX_MSG_CHARS)}`).join('\n');
      const sa = body.selfAssess || {};
      const user = `TRANSCRIPT:\n${transcript}\n\nSTUDENT SELF-ASSESSMENT:\n1 (patient's fear): ${sa.a || ''}\n2 (wish I had asked): ${sa.b || ''}\n3 (problem representation): ${sa.c || ''}`;
      const raw = await callAnthropic(MODEL_EVAL, evaluatorSystem(caseDef, coverage, s), [{ role: 'user', content: user }], MAX_TOKENS_EVAL);
      let feedback = null;
      try { feedback = JSON.parse(raw.replace(/^```json?\s*/i, '').replace(/```\s*$/, '')); } catch { /* fall through */ }
      if (!feedback) return json(request, 200, { error: 'eval-parse', note: 'deterministic debrief only' });
      console.log(JSON.stringify({ evt: 'evaluate', caseId: caseDef.id, turns: turns.length, day: new Date().toISOString().slice(0, 10) }));
      return json(request, 200, feedback);
    }

    // converse
    const message = String(body.message || '').slice(0, MAX_MSG_CHARS);
    if (!message.trim()) return json(request, 400, { error: 'empty message' });
    const studentMsgs = turns.map(t => String(t.me || '').slice(0, MAX_MSG_CHARS)).concat([message]);
    const s = deriveState(caseDef, studentMsgs);
    const msgs = [];
    for (const t of turns) {
      msgs.push({ role: 'user', content: String(t.me || '').slice(0, MAX_MSG_CHARS) });
      msgs.push({ role: 'assistant', content: String(t.pt || '').slice(0, MAX_MSG_CHARS) });
    }
    msgs.push({ role: 'user', content: message });
    const reply = (await callAnthropic(MODEL_ACTOR, actorSystem(caseDef, s), msgs, MAX_TOKENS_ACTOR)).trim();
    console.log(JSON.stringify({ evt: 'turn', caseId: caseDef.id, turn: turns.length + 1, rapport: s.rapport, day: new Date().toISOString().slice(0, 10) }));
    return json(request, 200, { reply, state: { intents: s.lastIntents, flags: s.lastFlags, rapport: s.rapport, unlocked: Object.keys(s.unlocked) } });
  } catch (e) {
    return json(request, 502, { error: String(e.message || e) });
  }
};

export const config = { path: '/api/sp' };

// Exported for parity tests only (tests/…): server gate logic must match the client MockProvider.
export const _internals = { deriveState, computeCoverage, actorSystem, evaluatorSystem };
