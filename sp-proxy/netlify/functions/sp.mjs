import { getStore } from '@netlify/blobs';

import {
  createBudgetLedger,
  PRODUCTION_BUDGET_NAMESPACE,
  PRODUCTION_BUDGET_STORE_NAME,
} from './_shared/sp-budget.mjs';
import * as productionGovernance from './_shared/sp-governance.mjs';
import {
  OperationalError,
  createHttp,
  operationalError,
  readEnv,
} from './_shared/sp-http.mjs';
import { createPackLoader } from './_shared/sp-pack.mjs';
import { createTicketCodec } from './_shared/sp-speech-ticket.mjs';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const JSON_BODY_LIMIT = 256 * 1024;
const PROVIDER_JSON_LIMIT = 256 * 1024;
const PROVIDER_CONTENT_BLOCK_LIMIT = 64;
const TEXT_LIMIT = 1_200;
const FEEDBACK_TEXT_LIMIT = 600;
const DEFAULT_TIMEOUT_MS = 45_000;
const PRODUCTION_MODEL = 'claude-haiku-4-5-20251001';
const PRODUCTION_ACTOR_MAX_TOKENS = 300;
const PRODUCTION_EVALUATOR_MAX_TOKENS = 1_500;
const ENCOUNTER_ID = /^[A-Za-z0-9_-]{22}$/;
const ROTATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const POST_PACK_STATUSES = new Set(['reviewed', 'attested']);
const FEEDBACK_RATINGS = new Set(['observed', 'partial', 'missed']);

function invalidConfiguration() {
  return operationalError(500, 'invalid_configuration', 'The Interview Room is not configured.');
}

function invalidRequest() {
  return operationalError(400, 'invalid_request', 'The request is invalid.');
}

function unsupportedJson() {
  return operationalError(415, 'unsupported_media_type', 'Content-Type must be application/json.');
}

function bodyTooLarge() {
  return operationalError(413, 'request_too_large', 'The request body is too large.');
}

function packNotApproved() {
  return operationalError(403, 'pack_not_approved', 'The case pack is not approved for learner use.');
}

function packUnavailable() {
  return operationalError(502, 'pack_unavailable', 'The reviewed case pack is unavailable.');
}

function packInvalid() {
  return operationalError(502, 'pack_invalid', 'The reviewed case pack is invalid.');
}

function unknownCase() {
  return operationalError(400, 'unknown_case', 'Unknown case.');
}

function caseNotReviewed() {
  return operationalError(403, 'case_not_reviewed', 'This case is not reviewed for learner use.');
}

function turnCapReached() {
  return operationalError(429, 'turn_cap_reached', 'The reviewed turn limit has been reached.');
}

function methodNotAllowed() {
  return operationalError(405, 'method_not_allowed', 'Method not allowed.');
}

function requestCancelled() {
  return operationalError(499, 'request_cancelled', 'The request was cancelled.');
}

function providerFailed() {
  return operationalError(502, 'anthropic_provider_error', 'The actor provider could not complete the request.');
}

function providerTimeout() {
  return operationalError(504, 'anthropic_timeout', 'The actor provider timed out.');
}

function providerUnavailable() {
  return operationalError(503, 'anthropic_unavailable', 'The actor provider is not configured.');
}

function operationUnavailable() {
  return operationalError(503, 'operation_state_unavailable', 'The operation state is temporarily unavailable.');
}

function duplicateError(kind, terminal = false) {
  const prefix = kind === 'evaluation' ? 'evaluation' : 'actor';
  return operationalError(
    409,
    terminal ? `${prefix}_already_processed` : `${prefix}_in_progress`,
    terminal
      ? `This ${prefix} operation has already been processed.`
      : `This ${prefix} operation is already in progress.`,
  );
}

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length
    && actual.every((key, index) => key === wanted[index]);
}

function nonempty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasUnpairedSurrogate(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function boundedText(value, { maximum = TEXT_LIMIT, allowBlank = false } = {}) {
  return typeof value === 'string'
    && !hasUnpairedSurrogate(value)
    && [...value].length <= maximum
    && (allowBlank || value.trim().length > 0);
}

function canonicalEncounterId(value) {
  if (typeof value !== 'string' || !ENCOUNTER_ID.test(value)) return false;
  try {
    const decoded = Buffer.from(value, 'base64url');
    return decoded.byteLength === 16 && decoded.toString('base64url') === value;
  } catch {
    return false;
  }
}

function declaredTooLarge(value, maximum) {
  if (value === null) return false;
  if (!/^(?:0|[1-9][0-9]*)$/.test(value)) throw invalidRequest();
  const limit = String(maximum);
  return value.length > limit.length || (value.length === limit.length && value > limit);
}

async function cancelReader(reader) {
  try {
    await reader.cancel();
  } catch {
    // The bounded-reader error remains authoritative.
  }
}

async function readRequestJson(request) {
  if (request.headers.get('content-type') !== 'application/json') throw unsupportedJson();
  if (declaredTooLarge(request.headers.get('content-length'), JSON_BODY_LIMIT)) {
    throw bodyTooLarge();
  }
  if (request.signal.aborted) throw requestCancelled();
  if (!request.body || typeof request.body.getReader !== 'function') throw invalidRequest();
  const reader = request.body.getReader();
  const bytes = new Uint8Array(JSON_BODY_LIMIT);
  let length = 0;
  try {
    while (true) {
      let item;
      try {
        item = await reader.read();
      } catch {
        if (request.signal.aborted) throw requestCancelled();
        throw invalidRequest();
      }
      if (item.done) break;
      if (!(item.value instanceof Uint8Array) || item.value.byteLength === 0) {
        await cancelReader(reader);
        throw invalidRequest();
      }
      if (item.value.byteLength > JSON_BODY_LIMIT - length) {
        await cancelReader(reader);
        throw bodyTooLarge();
      }
      bytes.set(item.value, length);
      length += item.value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  if (request.signal.aborted) throw requestCancelled();
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length));
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidRequest();
    return value;
  } catch (error) {
    if (error instanceof OperationalError) throw error;
    throw invalidRequest();
  }
}

async function loadFrozenSnapshot(packLoader) {
  if (!packLoader || typeof packLoader.load !== 'function') throw invalidConfiguration();
  let snapshot;
  try {
    snapshot = await packLoader.load();
  } catch (error) {
    if (error?.code === 'pack_invalid') throw packInvalid();
    throw packUnavailable();
  }
  if (
    !snapshot
    || typeof snapshot !== 'object'
    || !Object.isFrozen(snapshot)
    || !snapshot.pack
    || !Object.isFrozen(snapshot.pack)
    || !Object.isFrozen(snapshot.pack.cases)
    || typeof snapshot.packHash !== 'string'
    || !/^[a-f0-9]{64}$/.test(snapshot.packHash)
  ) {
    throw packInvalid();
  }
  return snapshot;
}

function reviewedCaseSummaries(governance, pack, now) {
  let summaries;
  try {
    summaries = governance.reviewedCaseSummaries(pack, { now });
  } catch {
    throw invalidConfiguration();
  }
  if (!Array.isArray(summaries)) throw invalidConfiguration();
  return summaries.map((summary) => {
    if (
      !exactKeys(summary, ['id', 'title'])
      || !boundedText(summary.id)
      || !boundedText(summary.title)
    ) {
      throw invalidConfiguration();
    }
    return { id: summary.id, title: summary.title };
  });
}

function resolveReviewedCase(governance, pack, caseId, now) {
  let caseDef;
  try {
    caseDef = governance.resolveReviewedCase({ pack, caseId, now });
  } catch (error) {
    if (error?.code === 'unknown_case') throw unknownCase();
    if (error?.code === 'case_not_reviewed') throw caseNotReviewed();
    throw invalidConfiguration();
  }
  if (
    !Array.isArray(pack?.cases)
    || !pack.cases.includes(caseDef)
    || caseDef?.id !== caseId
  ) {
    throw invalidConfiguration();
  }
  return caseDef;
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
  const flagIds = caseDef.intents.filter(it => it.category === 'flag').map(it => it.id);
  const s = { rapport: 0, covered: {}, unlocked: {}, closedRun: 0, reflections: 0,
              greetUsed: false, openInviteUsed: false, flagHistory: [], lastIntents: [], lastFlags: [] };
  for (const text of studentMsgs) {
    const hits = matchIntents(compiled, text);
    const flags = hits.filter(h => flagIds.includes(h));
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
    // gates — fully pack-driven, and an EXACT mirror of the client MockProvider cascade:
    // a flagged turn is answered by the flag line and never touches a gate; gates are
    // evaluated in pack order and at most ONE gate consumes a turn; a gate whose branch
    // produces no reply on the client (e.g. repeatAsk undefined) does not consume the turn.
    if (!flags.length) {
      const recentFlags = s.flagHistory.slice(-2).flat();
      let consumed = false;
      for (const gd of caseDef.gated) {
        if (consumed) break;
        const reqHit = (gd.requiresIntents || []).some(ri => hits.includes(ri));
        if (gd.requiresGate) {
          if (reqHit) {
            if (s.unlocked[gd.requiresGate]) { s.unlocked[gd.id] = true; consumed = true; }
            else consumed = !!gd.deflectIfLocked;
          }
        } else if (reqHit) {
          if (s.unlocked[gd.id]) { consumed = !!gd.repeatAsk; }
          else if (s.rapport >= (gd.requiresRapport || 0)
              && !(gd.blockedByRecentFlags || []).some(f => recentFlags.includes(f))) {
            s.unlocked[gd.id] = true; consumed = true;
          } else { consumed = !!(gd.deflectLowRapport || gd.deflectIfLocked); }
        } else if (gd.euphemismIntent && hits.includes(gd.euphemismIntent) && !s.unlocked[gd.id]) {
          consumed = !!gd.deflectEuphemism;
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
    hiddenAgendaToneOnly: caseDef.hiddenAgendaTone || '',
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
function validateTurn(turn) {
  if (
    !exactKeys(turn, ['me', 'pt'])
    || !boundedText(turn.me)
    || !boundedText(turn.pt)
  ) {
    throw invalidRequest();
  }
  return { me: turn.me, pt: turn.pt };
}

function validateTurns(value, maximum, { evaluation = false } = {}) {
  if (!Array.isArray(value)) throw invalidRequest();
  if (evaluation ? value.length > maximum : value.length >= maximum) throw turnCapReached();
  return value.map(validateTurn);
}

function validateLearnerBody(body, pack) {
  const maximumTurns = pack?.engine?.maxTurns;
  if (!Number.isSafeInteger(maximumTurns) || maximumTurns <= 0) throw invalidConfiguration();
  if (!canonicalEncounterId(body?.encounterId) || !nonempty(body.caseId)) throw invalidRequest();

  if (body.mode === 'open') {
    if (!exactKeys(body, ['caseId', 'encounterId', 'mode', 'turnId']) || body.turnId !== 0) {
      throw invalidRequest();
    }
    return Object.freeze({
      caseId: body.caseId,
      mode: 'open',
      encounterId: body.encounterId,
      turnId: 0,
      turns: Object.freeze([]),
    });
  }
  if (body.mode === 'converse') {
    if (!exactKeys(body, ['caseId', 'encounterId', 'message', 'mode', 'turnId', 'turns'])) {
      throw invalidRequest();
    }
    const turns = validateTurns(body.turns, maximumTurns);
    if (
      !Number.isSafeInteger(body.turnId)
      || body.turnId <= 0
      || body.turnId !== turns.length + 1
      || !boundedText(body.message)
    ) {
      throw invalidRequest();
    }
    return Object.freeze({
      caseId: body.caseId,
      mode: 'converse',
      encounterId: body.encounterId,
      turnId: body.turnId,
      turns: Object.freeze(turns),
      message: body.message,
    });
  }
  if (body.mode === 'evaluate') {
    if (!exactKeys(body, ['caseId', 'encounterId', 'mode', 'selfAssess', 'turns'])) {
      throw invalidRequest();
    }
    const turns = validateTurns(body.turns, maximumTurns, { evaluation: true });
    if (
      !exactKeys(body.selfAssess, ['a', 'b', 'c'])
      || !['a', 'b', 'c'].every((key) => boundedText(
        body.selfAssess[key],
        { allowBlank: true },
      ))
    ) {
      throw invalidRequest();
    }
    return Object.freeze({
      caseId: body.caseId,
      mode: 'evaluate',
      encounterId: body.encounterId,
      turns: Object.freeze(turns),
      selfAssess: Object.freeze({ ...body.selfAssess }),
    });
  }
  throw invalidRequest();
}

function validateEngineContract(pack, runtime) {
  const engine = pack?.engine;
  if (
    !engine
    || !nonempty(engine.modelPinned)
    || !Number.isSafeInteger(engine.maxActorOutputTokens)
    || engine.maxActorOutputTokens <= 0
    || !Number.isSafeInteger(engine.maxEvaluatorOutputTokens)
    || engine.maxEvaluatorOutputTokens <= 0
    || !Number.isSafeInteger(engine.maxTurns)
    || engine.maxTurns <= 0
    || !Number.isSafeInteger(engine.rapportMin)
    || !Number.isSafeInteger(engine.rapportMax)
    || engine.rapportMin > engine.rapportMax
    || runtime?.actorModel !== engine.modelPinned
    || runtime?.evaluatorModel !== engine.modelPinned
    || runtime?.maxActorOutputTokens !== engine.maxActorOutputTokens
    || runtime?.maxEvaluatorOutputTokens !== engine.maxEvaluatorOutputTokens
    || typeof runtime?.now !== 'function'
    || !ROTATION_ID.test(runtime?.rotationId ?? '')
  ) {
    throw invalidConfiguration();
  }
  const rateCard = pack?.speechEngine?.rateCard;
  const rates = rateCard?.rates;
  let nowMs;
  try {
    nowMs = runtime.now();
  } catch {
    throw invalidConfiguration();
  }
  let validNow = Number.isSafeInteger(nowMs);
  if (validNow) {
    try {
      new Date(nowMs).toISOString();
    } catch {
      validNow = false;
    }
  }
  const effectiveMs = typeof rateCard?.effectiveDate === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(rateCard.effectiveDate)
    ? Date.parse(`${rateCard.effectiveDate}T00:00:00.000Z`)
    : Number.NaN;
  const canonicalEffectiveDate = Number.isFinite(effectiveMs)
    && new Date(effectiveMs).toISOString().slice(0, 10) === rateCard.effectiveDate;
  if (
    !exactKeys(rateCard, ['currency', 'effectiveDate', 'rates', 'version'])
    || !nonempty(rateCard.version)
    || rateCard.currency !== 'USD'
    || !validNow
    || !canonicalEffectiveDate
    || effectiveMs > nowMs
    || !Array.isArray(rates)
  ) {
    throw invalidConfiguration();
  }
  for (const meter of ['input_tokens', 'output_tokens']) {
    const matches = rates.filter((rate) => (
      rate?.provider === 'anthropic'
      && rate?.model === engine.modelPinned
      && rate?.meter === meter
    ));
    if (matches.length !== 1) throw invalidConfiguration();
    const rate = matches[0];
    let source;
    try {
      source = new URL(rate.sourceUrl);
    } catch {
      throw invalidConfiguration();
    }
    if (
      !exactKeys(rate, ['meter', 'model', 'price', 'provider', 'sourceUrl', 'unit'])
      || !['million_tokens', 'thousand_tokens'].includes(rate.unit)
      || typeof rate.price !== 'number'
      || !Number.isFinite(rate.price)
      || rate.price <= 0
      || source.protocol !== 'https:'
      || source.username !== ''
      || source.password !== ''
    ) {
      throw invalidConfiguration();
    }
  }
  return Object.freeze({
    rateKey: Object.freeze({ provider: 'anthropic', model: engine.modelPinned }),
    actorModel: engine.modelPinned,
    evaluatorModel: engine.modelPinned,
    actorMaximum: engine.maxActorOutputTokens,
    evaluatorMaximum: engine.maxEvaluatorOutputTokens,
  });
}

function actorMessages(input) {
  const messages = [];
  for (const turn of input.turns) {
    messages.push({ role: 'user', content: turn.me });
    messages.push({ role: 'assistant', content: turn.pt });
  }
  messages.push({ role: 'user', content: input.message });
  return messages;
}

function evaluationMessage(input) {
  const transcript = input.turns.map((turn, index) => (
    `[${index + 1}] STUDENT: ${turn.me}\n[${index + 1}] PATIENT: ${turn.pt}`
  )).join('\n');
  return `TRANSCRIPT:\n${transcript}\n\nSTUDENT SELF-ASSESSMENT:\n1 (patient's fear): ${input.selfAssess.a}\n2 (wish I had asked): ${input.selfAssess.b}\n3 (problem representation): ${input.selfAssess.c}`;
}

function assembleOutbound(input, caseDef, contract) {
  if (input.mode === 'converse') {
    const state = deriveState(caseDef, input.turns.map((turn) => turn.me).concat(input.message));
    const payload = {
      model: contract.actorModel,
      max_tokens: contract.actorMaximum,
      system: actorSystem(caseDef, state),
      messages: actorMessages(input),
    };
    return Object.freeze({
      kind: 'actor',
      state,
      turnId: input.turnId,
      bodyBytes: new TextEncoder().encode(JSON.stringify(payload)),
      maximumOutputTokens: contract.actorMaximum,
    });
  }
  const state = deriveState(caseDef, input.turns.map((turn) => turn.me));
  const coverage = computeCoverage(caseDef, state);
  const payload = {
    model: contract.evaluatorModel,
    max_tokens: contract.evaluatorMaximum,
    system: evaluatorSystem(caseDef, coverage, state),
    messages: [{ role: 'user', content: evaluationMessage(input) }],
  };
  return Object.freeze({
    kind: 'evaluation',
    state,
    turnId: input.turns.length,
    bodyBytes: new TextEncoder().encode(JSON.stringify(payload)),
    maximumOutputTokens: contract.evaluatorMaximum,
  });
}

function operationIdentity({ runtime, input, outbound }) {
  return JSON.stringify({
    schemaVersion: 1,
    rotationId: runtime.rotationId,
    encounterId: input.encounterId,
    turnId: outbound.turnId,
    caseId: input.caseId,
    operation: outbound.kind,
  });
}

function publicState(state, engine) {
  const intents = state?.lastIntents;
  const flags = state?.lastFlags;
  const unlocked = Object.keys(state?.unlocked ?? {});
  if (
    !Array.isArray(intents)
    || !intents.every((value) => typeof value === 'string')
    || !Array.isArray(flags)
    || !flags.every((value) => typeof value === 'string')
    || !unlocked.every((value) => typeof value === 'string')
    || !Number.isFinite(state?.rapport)
    || !Number.isInteger(state.rapport)
    || state.rapport < engine.rapportMin
    || state.rapport > engine.rapportMax
  ) {
    throw invalidConfiguration();
  }
  return {
    intents: [...intents],
    flags: [...flags],
    rapport: state.rapport,
    unlocked,
  };
}

function validateProviderResult(result) {
  if (
    !exactKeys(result, ['text', 'usage'])
    || typeof result.text !== 'string'
    || !exactKeys(result.usage, ['inputTokens', 'outputTokens'])
    || !Number.isSafeInteger(result.usage.inputTokens)
    || result.usage.inputTokens < 0
    || !Number.isSafeInteger(result.usage.outputTokens)
    || result.usage.outputTokens < 0
  ) {
    throw providerFailed();
  }
  return result;
}

function actorReply(text) {
  const reply = text.trim();
  if (!boundedText(reply)) throw providerFailed();
  return reply;
}

function feedbackText(value) {
  return boundedText(value, { maximum: FEEDBACK_TEXT_LIMIT });
}

function validateFeedback(raw, linkedPages) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw providerFailed();
  }
  if (
    !exactKeys(value, ['domains', 'growth', 'selfAssessmentNote', 'strengths'])
    || !exactKeys(value.domains, ['alliance', 'data', 'organization', 'technique'])
    || !Array.isArray(value.strengths)
    || value.strengths.length !== 2
    || !value.strengths.every(feedbackText)
    || !Array.isArray(value.growth)
    || value.growth.length !== 2
    || !feedbackText(value.selfAssessmentNote)
    || !Array.isArray(linkedPages)
  ) {
    throw providerFailed();
  }
  const domains = {};
  for (const name of ['alliance', 'data', 'technique', 'organization']) {
    const domain = value.domains[name];
    if (
      !exactKeys(domain, ['note', 'rating'])
      || !FEEDBACK_RATINGS.has(domain.rating)
      || !feedbackText(domain.note)
    ) {
      throw providerFailed();
    }
    domains[name] = { rating: domain.rating, note: domain.note };
  }
  const growth = value.growth.map((item) => {
    if (
      !exactKeys(item, ['link', 't'])
      || !feedbackText(item.t)
      || typeof item.link !== 'string'
      || !linkedPages.includes(item.link)
    ) {
      throw providerFailed();
    }
    return { t: item.t, link: item.link };
  });
  return {
    domains,
    strengths: [...value.strengths],
    growth,
    selfAssessmentNote: value.selfAssessmentNote,
  };
}

function defaultTimers() {
  return Object.freeze({
    setTimeout: (callback, milliseconds) => globalThis.setTimeout(callback, milliseconds),
    clearTimeout: (id) => globalThis.clearTimeout(id),
  });
}

function validateSignal(signal) {
  if (signal === undefined) return;
  if (
    !signal
    || typeof signal.aborted !== 'boolean'
    || typeof signal.addEventListener !== 'function'
    || typeof signal.removeEventListener !== 'function'
  ) {
    throw invalidRequest();
  }
}

async function withDeadline({ callerSignal, timeoutMs, timers }, operation) {
  validateSignal(callerSignal);
  if (callerSignal?.aborted) throw requestCancelled();
  const controller = new AbortController();
  let timedOut = false;
  let callerAborted = false;
  let rejectBoundary;
  const boundary = new Promise((_resolve, reject) => { rejectBoundary = reject; });
  const onCallerAbort = () => {
    callerAborted = true;
    controller.abort();
    rejectBoundary(requestCancelled());
  };
  callerSignal?.addEventListener('abort', onCallerAbort, { once: true });
  const timeoutId = timers.setTimeout(() => {
    timedOut = true;
    controller.abort();
    rejectBoundary(providerTimeout());
  }, timeoutMs);
  const providerOperation = Promise.resolve().then(() => operation(controller.signal));
  try {
    return await Promise.race([providerOperation, boundary]);
  } catch (error) {
    if (timedOut) throw providerTimeout();
    if (callerAborted || callerSignal?.aborted) throw requestCancelled();
    if (error instanceof OperationalError) throw error;
    throw providerFailed();
  } finally {
    callerSignal?.removeEventListener('abort', onCallerAbort);
    timers.clearTimeout(timeoutId);
  }
}

async function cancelBody(response) {
  try {
    await response.body?.cancel?.();
  } catch {
    // Provider cancellation detail is deliberately discarded.
  }
}

async function readProviderBytes(response) {
  const declared = response.headers.get('content-length');
  let oversized = false;
  try {
    oversized = declared !== null && declaredTooLarge(declared, PROVIDER_JSON_LIMIT);
  } catch {
    await cancelBody(response);
    throw providerFailed();
  }
  if (oversized) {
    await cancelBody(response);
    throw providerFailed();
  }
  if (!response.body || typeof response.body.getReader !== 'function') throw providerFailed();
  const reader = response.body.getReader();
  const bytes = new Uint8Array(PROVIDER_JSON_LIMIT);
  let length = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      if (!(item.value instanceof Uint8Array) || item.value.byteLength === 0) {
        await cancelReader(reader);
        throw providerFailed();
      }
      if (item.value.byteLength > PROVIDER_JSON_LIMIT - length) {
        await cancelReader(reader);
        throw providerFailed();
      }
      bytes.set(item.value, length);
      length += item.value.byteLength;
    }
  } catch {
    throw providerFailed();
  } finally {
    reader.releaseLock();
  }
  return bytes.subarray(0, length);
}

function parseAnthropicResponse(value) {
  if (
    !value
    || typeof value !== 'object'
    || !Array.isArray(value.content)
    || value.content.length === 0
    || value.content.length > PROVIDER_CONTENT_BLOCK_LIMIT
    || !value.usage
    || !Number.isSafeInteger(value.usage.input_tokens)
    || value.usage.input_tokens < 0
    || !Number.isSafeInteger(value.usage.output_tokens)
    || value.usage.output_tokens < 0
  ) {
    throw providerFailed();
  }
  const text = [];
  for (const block of value.content) {
    if (!block || typeof block !== 'object' || typeof block.type !== 'string') {
      throw providerFailed();
    }
    if (block.type === 'text') {
      if (typeof block.text !== 'string' || hasUnpairedSurrogate(block.text)) {
        throw providerFailed();
      }
      text.push(block.text);
    }
  }
  const combined = text.join('');
  if (combined.trim().length === 0) throw providerFailed();
  return Object.freeze({
    text: combined,
    usage: Object.freeze({
      inputTokens: value.usage.input_tokens,
      outputTokens: value.usage.output_tokens,
    }),
  });
}

export function createAnthropicProvider({
  fetchImpl,
  readApiKey,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  timers = defaultTimers(),
} = {}) {
  if (
    typeof fetchImpl !== 'function'
    || typeof readApiKey !== 'function'
    || timeoutMs !== DEFAULT_TIMEOUT_MS
    || !timers
    || typeof timers.setTimeout !== 'function'
    || typeof timers.clearTimeout !== 'function'
  ) {
    throw invalidConfiguration();
  }
  return Object.freeze({
    async prepare() {
      let key;
      try {
        key = readApiKey();
      } catch {
        throw providerUnavailable();
      }
      if (!nonempty(key)) throw providerUnavailable();
      return Object.freeze({
        async call({ bodyBytes, signal } = {}) {
          if (!(bodyBytes instanceof Uint8Array) || bodyBytes.byteLength === 0) {
            throw invalidRequest();
          }
          return withDeadline({ callerSignal: signal, timeoutMs, timers }, async (deadlineSignal) => {
            let response;
            try {
              response = await fetchImpl(ANTHROPIC_URL, {
                method: 'POST',
                headers: {
                  'x-api-key': key,
                  'anthropic-version': ANTHROPIC_VERSION,
                  'content-type': 'application/json',
                },
                body: bodyBytes,
                signal: deadlineSignal,
              });
            } catch {
              throw providerFailed();
            }
            if (!(response instanceof Response)) throw providerFailed();
            if (!response.ok) {
              await cancelBody(response);
              throw providerFailed();
            }
            const mediaType = (response.headers.get('content-type') ?? '')
              .split(';', 1)[0]
              .trim()
              .toLowerCase();
            if (mediaType !== 'application/json') {
              await cancelBody(response);
              throw providerFailed();
            }
            const bytes = await readProviderBytes(response);
            try {
              const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
              return parseAnthropicResponse(JSON.parse(decoded));
            } catch (error) {
              if (error instanceof OperationalError) throw error;
              throw providerFailed();
            }
          });
        },
      });
    },
  });
}

async function resolveDependency(dependency, context, method) {
  const resolved = typeof dependency === 'function'
    ? await dependency(context)
    : dependency;
  if (!resolved || typeof resolved[method] !== 'function') throw invalidConfiguration();
  return resolved;
}

function sanitizeProviderError(error) {
  if (error?.status === 504 || error?.code === 'anthropic_timeout') return providerTimeout();
  if (error?.status === 499 || error?.code === 'request_cancelled') return requestCancelled();
  return providerFailed();
}

function sanitizeBudgetError(error, kind) {
  if (error?.code === 'budget_in_progress') return duplicateError(kind, false);
  if (error?.code === 'rotation_budget_reserved') {
    return operationalError(429, 'rotation_budget_reserved', 'The rotation budget is reserved.');
  }
  if (error?.code === 'budget_contention' || error?.code === 'budget_unavailable') {
    return operationUnavailable();
  }
  if (error instanceof OperationalError) {
    if (error.status === 429) {
      return operationalError(429, 'rotation_budget_reserved', 'The rotation budget is reserved.');
    }
    if (error.status === 409) {
      return operationalError(409, 'operation_conflict', 'The operation conflicts with stored state.');
    }
  }
  return operationUnavailable();
}

function sameOperation(error) {
  const safe = error instanceof OperationalError ? error : requestCancelled();
  Object.defineProperty(safe, 'retryDisposition', { value: 'same-operation' });
  return safe;
}

function normalizedError(error) {
  if (error instanceof OperationalError) return error;
  return operationalError(500, 'internal_error', 'Internal server error.');
}

function ticketContext({ snapshot, caseDef, governance, runtime }) {
  if (typeof governance?.managedVoiceEligibility !== 'function') return null;
  try {
    const eligibility = governance.managedVoiceEligibility({
      pack: snapshot.pack,
      packHash: snapshot.packHash,
      caseDef,
      now: runtime.now,
      runtime: runtime.voiceRuntime,
    });
    if (eligibility?.eligible !== true) return null;
    const matches = snapshot.pack.speechEngine?.candidateStacks?.filter((candidate) => (
      candidate?.id === runtime.voiceRuntime?.stackId
    )) ?? [];
    if (matches.length !== 1) return null;
    const profile = eligibility.profile;
    if (
      !profile
      || !Number.isSafeInteger(profile.profileVersion)
      || !nonempty(profile.provider)
      || !nonempty(profile.voiceId)
      || !nonempty(matches[0]?.synthesis?.model)
    ) {
      return null;
    }
    return {
      attestationHash: eligibility.attestationHash,
      profileHash: eligibility.profileHash,
      profileVersion: profile.profileVersion,
      provider: profile.provider,
      model: matches[0].synthesis.model,
      voiceId: profile.voiceId,
    };
  } catch {
    return null;
  }
}

function issueTicket({
  snapshot,
  caseDef,
  input,
  reply,
  opening,
  governance,
  ticketCodec,
  runtime,
  logger,
}) {
  const context = ticketContext({ snapshot, caseDef, governance, runtime });
  if (context === null) return null;
  try {
    const method = opening ? 'issueStableOpening' : 'issue';
    if (typeof ticketCodec?.[method] !== 'function') throw invalidConfiguration();
    const ticket = ticketCodec[method]({
      rotationId: runtime.rotationId,
      encounterId: input.encounterId,
      turnId: input.turnId,
      caseId: caseDef.id,
      packHash: snapshot.packHash,
      attestationHash: context.attestationHash,
      profileHash: context.profileHash,
      profileVersion: context.profileVersion,
      provider: context.provider,
      model: context.model,
      voiceId: context.voiceId,
      reply,
    });
    if (typeof ticket !== 'string' || ticket.length === 0) throw invalidConfiguration();
    return ticket;
  } catch {
    try {
      logger?.({ event: 'speech_ticket_unavailable', mode: input.mode });
    } catch {
      // Logging must never discard a completed actor reply.
    }
    return null;
  }
}

async function executeBudgeted({
  request,
  snapshot,
  caseDef,
  input,
  outbound,
  contract,
  anthropic,
  budget,
  governance,
  ticketCodec,
  runtime,
  logger,
}) {
  if (request.signal.aborted) throw sameOperation(requestCancelled());
  let provider;
  try {
    provider = await resolveDependency(
      anthropic,
      { snapshot, caseDef, input, outbound, runtime },
      'prepare',
    );
  } catch (error) {
    if (error?.code === 'anthropic_unavailable') throw providerUnavailable();
    throw sanitizeProviderError(error);
  }
  let prepared;
  try {
    prepared = await provider.prepare();
  } catch (error) {
    if (error?.code === 'anthropic_unavailable') throw providerUnavailable();
    throw sanitizeProviderError(error);
  }
  if (!prepared || typeof prepared.call !== 'function') throw invalidConfiguration();
  if (request.signal.aborted) throw sameOperation(requestCancelled());

  let ledger;
  try {
    ledger = await resolveDependency(budget, { snapshot, runtime }, 'reserve');
  } catch (error) {
    throw sanitizeBudgetError(error, outbound.kind);
  }
  for (const method of ['reserve', 'markProviderStarted', 'settle', 'failBeforeProvider']) {
    if (typeof ledger[method] !== 'function') throw invalidConfiguration();
  }
  if (request.signal.aborted) throw sameOperation(requestCancelled());

  let reservation;
  try {
    reservation = await ledger.reserve({
      idempotencyKey: operationIdentity({ runtime, input, outbound }),
      kind: outbound.kind,
      rateKey: { ...contract.rateKey },
      maximumUsage: {
        inputTokens: outbound.bodyBytes.byteLength,
        outputTokens: outbound.maximumOutputTokens,
      },
    });
  } catch (error) {
    throw sanitizeBudgetError(error, outbound.kind);
  }
  if (reservation?.finalized === true) throw duplicateError(outbound.kind, true);
  if (!reservation || typeof reservation !== 'object' || Array.isArray(reservation)) {
    throw operationUnavailable();
  }

  if (request.signal.aborted) {
    try {
      const released = await ledger.failBeforeProvider({
        reservation,
        code: 'request_cancelled',
      });
      if (released?.status !== 'failed_before_provider') throw operationUnavailable();
    } catch {
      throw operationUnavailable();
    }
    throw sameOperation(requestCancelled());
  }

  let authorization;
  try {
    authorization = await ledger.markProviderStarted(reservation);
  } catch {
    throw operationUnavailable();
  }
  if (authorization?.authorized !== true) throw duplicateError(outbound.kind, false);

  let providerResult;
  try {
    providerResult = validateProviderResult(await prepared.call({
      bodyBytes: outbound.bodyBytes,
      signal: request.signal,
    }));
  } catch (error) {
    try {
      const settled = await ledger.settle({
        reservation,
        outcome: 'provider_failed',
        usage: null,
      });
      if (settled?.status !== 'provider_failed' || settled?.outcome !== 'provider_failed') {
        throw operationUnavailable();
      }
    } catch {
      throw operationUnavailable();
    }
    throw sanitizeProviderError(error);
  }

  let result;
  try {
    result = outbound.kind === 'actor'
      ? actorReply(providerResult.text)
      : validateFeedback(providerResult.text, caseDef.linkedPages);
  } catch {
    try {
      const settled = await ledger.settle({
        reservation,
        outcome: 'provider_failed',
        usage: null,
      });
      if (settled?.status !== 'provider_failed' || settled?.outcome !== 'provider_failed') {
        throw operationUnavailable();
      }
    } catch {
      throw operationUnavailable();
    }
    throw providerFailed();
  }

  try {
    const settled = await ledger.settle({
      reservation,
      outcome: 'succeeded',
      usage: {
        inputTokens: providerResult.usage.inputTokens,
        outputTokens: providerResult.usage.outputTokens,
      },
    });
    if (settled?.status !== 'settled' || settled?.outcome !== 'succeeded') {
      throw operationUnavailable();
    }
  } catch {
    throw operationUnavailable();
  }
  // Metadata-only spend attribution: identifies WHICH client is burning the
  // shared rotation budget without ever logging message content.
  try {
    logger?.({
      event: 'budget_settled',
      rotationId: runtime.rotationId,
      encounterId: input.encounterId,
      caseId: input.caseId,
      operation: outbound.kind,
      turnId: outbound.turnId,
      inputTokens: providerResult.usage.inputTokens,
      outputTokens: providerResult.usage.outputTokens,
    });
  } catch {
    // Logging must never discard a completed actor reply.
  }
  if (request.signal.aborted) throw requestCancelled();

  if (outbound.kind === 'evaluation') return result;
  const ticket = issueTicket({
    snapshot,
    caseDef,
    input,
    reply: result,
    opening: false,
    governance,
    ticketCodec,
    runtime,
    logger,
  });
  if (request.signal.aborted) throw requestCancelled();
  return {
    reply: result,
    state: publicState(outbound.state, snapshot.pack.engine),
    ticket,
  };
}

function errorResponse(http, error, origin) {
  const normalized = normalizedError(error);
  const retryDisposition = error?.retryDisposition === 'same-operation'
    ? 'same-operation'
    : 'offline-only';
  return http.json({
    error: { code: normalized.code, message: normalized.message },
    retryDisposition,
  }, { status: normalized.status, origin });
}

export function createSpHandler({
  http,
  packLoader,
  governance,
  budget,
  anthropic,
  ticketCodec = null,
  logger = null,
  config: runtime,
} = {}) {
  if (!http || !runtime || typeof governance?.resolveReviewedCase !== 'function') {
    throw invalidConfiguration();
  }

  return async function spHandler(request) {
    let origin = null;
    try {
      if (request.method === 'OPTIONS') return http.preflight(request);
      origin = http.requireOrigin(request);
      http.requireStudentCredential(request);
      if (!['GET', 'POST'].includes(request.method)) throw methodNotAllowed();

      let learnerBody = null;
      if (request.method === 'POST') learnerBody = await readRequestJson(request);
      const snapshot = await loadFrozenSnapshot(packLoader);
      if (request.method === 'POST' && !POST_PACK_STATUSES.has(snapshot.pack.status)) {
        throw packNotApproved();
      }
      const contract = validateEngineContract(snapshot.pack, runtime);

      if (request.method === 'GET') {
        if (typeof governance.reviewedCaseSummaries !== 'function') throw invalidConfiguration();
        return http.json({
          schemaVersion: 1,
          actorModel: contract.actorModel,
          evaluatorModel: contract.evaluatorModel,
          packVersion: snapshot.pack.version,
          packStatus: snapshot.pack.status,
          // SHA-256 of the raw pack bytes. Already computed on every load and
          // validated in loadFrozenSnapshot; it was simply never exposed. It is
          // here because packVersion does not move when pack CONTENT moves: the
          // D12/D13 safety-scoring wave rewrote 70 lines and left version at
          // 0.1.0, so nothing downstream could tell which scoring was serving.
          // A hash of the bytes can. It reveals no pack content (D6).
          packSha256: snapshot.packHash,
          cases: reviewedCaseSummaries(governance, snapshot.pack, runtime.now),
        }, { origin });
      }

      const input = validateLearnerBody(learnerBody, snapshot.pack);
      const caseDef = resolveReviewedCase(
        governance,
        snapshot.pack,
        input.caseId,
        runtime.now,
      );

      if (input.mode === 'open') {
        const reply = caseDef?.persona?.opening;
        if (!boundedText(reply)) throw invalidConfiguration();
        const state = deriveState(caseDef, []);
        return http.json({
          reply,
          state: publicState(state, snapshot.pack.engine),
          ticket: issueTicket({
            snapshot,
            caseDef,
            input,
            reply,
            opening: true,
            governance,
            ticketCodec,
            runtime,
            logger,
          }),
        }, { origin });
      }

      const outbound = assembleOutbound(input, caseDef, contract);
      const result = await executeBudgeted({
        request,
        snapshot,
        caseDef,
        input,
        outbound,
        contract,
        anthropic,
        budget,
        governance,
        ticketCodec,
        runtime,
        logger,
      });
      return http.json(result, { origin });
    } catch (error) {
      return errorResponse(http, error, origin);
    }
  };
}

function createProductionSpHandler() {
  const production = readEnv('CONTEXT') === 'production';
  const now = Date.now;
  const zeroRetention = readEnv('SP_VOICE_ZERO_RETENTION_ENTITLED');
  const runtime = Object.freeze({
    rotationId: readEnv('SP_ROTATION_ID') ?? '',
    actorModel: PRODUCTION_MODEL,
    evaluatorModel: PRODUCTION_MODEL,
    maxActorOutputTokens: PRODUCTION_ACTOR_MAX_TOKENS,
    maxEvaluatorOutputTokens: PRODUCTION_EVALUATOR_MAX_TOKENS,
    voiceRuntime: Object.freeze({
      stackId: readEnv('SP_VOICE_STACK_ID') ?? '',
      transcriptionProvider: readEnv('SP_VOICE_TRANSCRIPTION_PROVIDER') ?? '',
      transcriptionModel: readEnv('SP_VOICE_TRANSCRIPTION_MODEL') ?? '',
      synthesisProvider: readEnv('SP_VOICE_SYNTHESIS_PROVIDER') ?? '',
      synthesisModel: readEnv('SP_VOICE_SYNTHESIS_MODEL') ?? '',
      zeroRetentionEntitled: zeroRetention === 'true'
        ? true
        : zeroRetention === 'false'
          ? false
          : null,
    }),
    now,
  });
  const http = createHttp({
    studentKey: readEnv('SP_STUDENT_PASSCODE'),
    operationsKey: readEnv('SP_OPERATIONS_KEY'),
    allowedOrigins: readEnv('SP_ALLOWED_ORIGINS'),
    production,
  });

  let packLoader = null;
  const lazyPackLoader = Object.freeze({
    load() {
      if (packLoader === null) {
        packLoader = createPackLoader({
          url: readEnv('SP_PACK_URL'),
          token: readEnv('SP_PACK_TOKEN'),
          fetchImpl: globalThis.fetch,
          now,
        });
      }
      return packLoader.load();
    },
  });
  const anthropic = createAnthropicProvider({
    fetchImpl: globalThis.fetch,
    readApiKey: () => readEnv('ANTHROPIC_API_KEY'),
    timeoutMs: DEFAULT_TIMEOUT_MS,
  });
  const budget = ({ snapshot }) => createBudgetLedger({
    store: getStore({ name: PRODUCTION_BUDGET_STORE_NAME, consistency: 'strong' }),
    namespace: PRODUCTION_BUDGET_NAMESPACE,
    rotationId: runtime.rotationId,
    capMicros: 20_000_000,
    warningMicros: 16_000_000,
    rateCard: snapshot.pack.speechEngine?.rateCard,
    clock: now,
  });
  let ticketCodec = null;
  const codec = () => {
    if (ticketCodec === null) {
      ticketCodec = createTicketCodec({
        secret: readEnv('SP_SPEECH_TICKET_SECRET'),
        clock: now,
      });
    }
    return ticketCodec;
  };
  const lazyTicketCodec = Object.freeze({
    issue: (input) => codec().issue(input),
    issueStableOpening: (input) => codec().issueStableOpening(input),
  });

  return createSpHandler({
    http,
    packLoader: lazyPackLoader,
    governance: productionGovernance,
    budget,
    anthropic,
    ticketCodec: lazyTicketCodec,
    logger(event) { console.info(JSON.stringify(event)); },
    config: runtime,
  });
}

let defaultHandler = null;

export default async function handler(request) {
  try {
    if (defaultHandler === null) defaultHandler = createProductionSpHandler();
    return await defaultHandler(request);
  } catch (error) {
    const normalized = normalizedError(error);
    return new Response(JSON.stringify({
      error: { code: normalized.code, message: normalized.message },
      retryDisposition: 'offline-only',
    }), {
      status: normalized.status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }
}

// Rate limit mirrors faculty-console/netlify/functions/attest.mjs. 20 req/min/IP
// caps a scripted passcode holder's burn rate so exhausting the shared $20
// rotation budget takes hours (time to rotate SP_STUDENT_PASSCODE), while
// human-paced interviewing stays far below the window. Tunable if ward-wifi
// NAT ever causes collateral 429s.
export const config = Object.freeze({
  path: '/api/sp',
  rateLimit: Object.freeze({
    windowLimit: 20,
    windowSize: 60,
    aggregateBy: Object.freeze(['ip', 'domain']),
  }),
});

// Exported for parity tests only: this surface must remain byte-for-byte stable in shape.
export const _internals = { deriveState, computeCoverage, actorSystem, evaluatorSystem };
