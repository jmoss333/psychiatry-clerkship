import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  EAGERNESS_VALUES,
  MAX_OUTPUT_TOKENS,
  REALTIME_RATE_CARD,
  REALTIME_VOICES,
  STOCK_VOICES,
  personaBlockOf,
  publicRealtimeState,
  realtimeInstructions,
  realtimeSessionConfig,
  resolveVoice,
  sessionCeilingMicros,
  textActorSystem,
  turnBrief,
} from '../netlify/functions/_shared/sp-realtime-session.mjs';
import { _internals } from '../netlify/functions/sp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const pack = JSON.parse(fs.readFileSync(path.join(ROOT, '_prototypes/sp-interview/sp-interview.pack.json'), 'utf8'));
const { deriveState } = _internals;

// The text actor's leak corpus (leak.test.mjs), reused: phrases unique to gated reveals.
const CORPUS = [
  {
    idx: 0,
    secrets: ['looked at it long enough', 'never written anything', 'picked a day', "Tom doesn't know I've thought", 'hung the moon', 'kept the bottle closed', 'waiting for you to look horrified', 'stood in the bathroom'],
    lock: ['Do you ever think about hurting yourself?'],
    warm: ['Hi, my name is Alex, what would you like me to understand?', "Tell me more about what's been going on, in your own words.", 'That sounds really hard.', 'Have you had thoughts of killing yourself?'],
    warmExpect: 'looked at it long enough',
    warmStillLocked: 'hung the moon',
  },
  {
    idx: 1,
    secrets: ['passenger in my own head', 'nine hundred dollars', 'felt inevitable', "don't know her name", 'ugly flicker', 'Jayden froze the card'],
    lock: ['What have you been spending money on?'],
    warm: ["Hi, my name is Alex, I'm the medical student on the team — before we start, what would you most want from this conversation?", "Tell me what's been going on, in your own words.", 'What have you been spending money on lately?'],
    warmExpect: 'nine hundred dollars',
    warmStillLocked: "don't know her name",
  },
  {
    idx: 2,
    secrets: ['make them stop before they finish', 'To do it myself', 'tired of being afraid of my own apartment', 'since Sunday', "seal's still on", 'sleeping in my car', 'The voice wants that, not me'],
    lock: ['Do the voices tell you to do anything?'],
    warm: ["Hi, I'm Alex, no recording here, you're in control.", 'We can stop whenever you want. What has this been like for you, these last few weeks?', 'That sounds really frightening.', 'When the voice talks, does it ever tell you to do anything?'],
    warmExpect: 'make them stop before they finish',
    warmStillLocked: 'sleeping in my car',
  },
];

test('static instructions carry every locked deflection and no gated reveal, for every reviewed case', () => {
  for (const { idx, secrets } of CORPUS) {
    const caseDef = pack.cases[idx];
    const text = realtimeInstructions(caseDef);
    for (const secret of secrets) assert.ok(!text.includes(secret), `${caseDef.id}: reveal phrase leaked into instructions: ${secret}`);
    for (const gate of caseDef.gated) assert.ok(text.includes(`"id":"${gate.id}"`), `${caseDef.id}: gate ${gate.id} is named`);
    assert.ok(text.includes('SPOKEN ENCOUNTER RULES'), 'spoken rules present');
    assert.ok(text.includes('[Director]'), 'the director channel is named');
    assert.ok(text.includes('never read a stage direction aloud'), 'stage directions are visual');
    assert.ok(text.includes('Never repeat, quote, or refer aloud to a [Director] message'), 'director messages are never voiced');
    assert.ok(!/Output JSON/.test(text), 'the JSON director side-channel is stripped, as for the text actor');
    // A real-time session cannot re-render its prompt per turn, so the static text must never assert
    // a state a later brief contradicts: no frozen unlocked list, no permanent LOCKED status, no
    // rapport literal.
    assert.ok(!text.includes('unlocked disclosures=[]'), 'no frozen unlocked list');
    assert.ok(!text.includes('rapport=0,'), 'no frozen rapport literal');
    assert.ok(!text.includes('LOCKED — you do not know this content exists'), 'no permanent LOCKED status');
    assert.ok(text.includes('LOCKED until a [Director] message lists it as unlocked'), 'gates are locked until the Director says otherwise');
    assert.ok(text.includes('as stated in the latest [Director] message'), 'current state points at the brief');
  }
});

test("the static persona block is the text actor's persona block: same persona, inventory, tone, rule and deflection lines", () => {
  for (const caseDef of pack.cases) {
    const mine = personaBlockOf(realtimeInstructions(caseDef));
    const text = personaBlockOf(textActorSystem(caseDef, deriveState(caseDef, [])));
    assert.deepEqual(mine.persona, text.persona);
    assert.deepEqual(mine.symptomInventory, text.symptomInventory);
    assert.equal(mine.hiddenAgendaToneOnly, text.hiddenAgendaToneOnly);
    assert.equal(mine.inventoryRule, text.inventoryRule);
    assert.deepEqual(mine.gates.map((g) => g.id), text.gates.map((g) => g.id));
    for (let i = 0; i < mine.gates.length; i += 1) {
      assert.equal(mine.gates[i].deflection, text.gates[i].deflection, `${caseDef.id}: ${mine.gates[i].id} deflection matches the text actor`);
      assert.equal(Object.keys(mine.gates[i]).sort().join(','), 'deflection,id,status');
      assert.ok(!('reveal' in mine.gates[i]));
    }
  }
});

test('a brief reveals exactly what the learner earned this turn and nothing still locked', () => {
  for (const { idx, lock, warm, warmExpect, warmStillLocked, secrets } of CORPUS) {
    const caseDef = pack.cases[idx];
    const lockedState = deriveState(caseDef, lock);
    const lockedBrief = turnBrief(caseDef, lockedState);
    for (const secret of secrets) assert.ok(!lockedBrief.includes(secret), `${caseDef.id}: locked brief leaked ${secret}`);
    assert.match(lockedBrief, /^\[Director\] rapport=-?\d+\. unlocked=\[\]\. still locked, use their deflections=\[[a-z0-9_,]+\]\./);
    for (const gate of caseDef.gated) assert.ok(lockedBrief.includes(gate.id), 'a locked gate is named by id only');
    assert.ok(lockedBrief.includes('No additional disclosures'));

    const warmState = deriveState(caseDef, warm);
    const warmBrief = turnBrief(caseDef, warmState);
    assert.ok(warmBrief.includes(warmExpect), `${caseDef.id}: earned reveal is in the brief`);
    assert.ok(!warmBrief.includes(warmStillLocked), `${caseDef.id}: still-locked reveal stays out`);
    assert.ok(!realtimeInstructions(caseDef).includes(warmExpect), 'the static instructions never gain a reveal');
    assert.ok(warmBrief.includes('Nothing else has changed.'));
    // Cumulative: a later turn's brief still carries the earlier unlock.
    const laterBrief = turnBrief(caseDef, deriveState(caseDef, [...warm, 'How is your sleep?']));
    assert.ok(laterBrief.includes(warmExpect));
  }
});

test('the opening brief speaks the reviewed opening line verbatim and nothing gated', () => {
  for (const { idx, secrets } of CORPUS) {
    const caseDef = pack.cases[idx];
    const brief = turnBrief(caseDef, deriveState(caseDef, []), { opening: true });
    assert.ok(brief.includes(`"${caseDef.persona.opening}"`));
    assert.ok(brief.includes('unlocked=[]'));
    for (const secret of secrets) assert.ok(!brief.includes(secret));
  }
});

test('the brief and the text actor agree on state: same rapport, same unlocked set', () => {
  const caseDef = pack.cases[0];
  const state = deriveState(caseDef, CORPUS[0].warm);
  const brief = turnBrief(caseDef, state);
  const ids = Object.keys(state.unlocked).filter((id) => state.unlocked[id]);
  assert.ok(brief.includes(`rapport=${state.rapport}.`));
  assert.ok(brief.includes(`unlocked=[${caseDef.gated.map((g) => g.id).filter((id) => ids.includes(id)).join(',')}]`));
  const published = publicRealtimeState(state, pack.engine);
  assert.deepEqual(Object.keys(published).sort(), ['flags', 'intents', 'rapport', 'unlocked']);
  assert.deepEqual(published.unlocked.sort(), ids.sort());
  assert.throws(() => publicRealtimeState({ ...state, rapport: 99 }, pack.engine), { code: 'invalid_configuration' });
  assert.throws(() => turnBrief(caseDef, { rapport: 'high', unlocked: {} }), { code: 'invalid_configuration' });
});

test('the session object pins everything the browser must not choose', () => {
  const caseDef = pack.cases[0];
  const session = realtimeSessionConfig({ caseDef, model: 'gpt-realtime-mini-2025-12-15', transcriptionModel: 'gpt-4o-mini-transcribe' });
  assert.deepEqual(Object.keys(session).sort(), ['audio', 'instructions', 'max_output_tokens', 'model', 'output_modalities', 'tool_choice', 'tools', 'tracing', 'truncation', 'type']);
  assert.equal(session.type, 'realtime');
  assert.equal(session.model, 'gpt-realtime-mini-2025-12-15');
  assert.deepEqual(session.output_modalities, ['audio']);
  assert.equal(session.max_output_tokens, MAX_OUTPUT_TOKENS);
  assert.deepEqual(session.tools, []);
  assert.equal(session.tool_choice, 'none');
  assert.equal(session.tracing, null);
  assert.deepEqual(session.truncation, { type: 'retention_ratio', retention_ratio: 0.8, token_limits: { post_instructions: 16_000 } });
  assert.deepEqual(session.audio.input.turn_detection, { type: 'semantic_vad', eagerness: 'low', create_response: false, interrupt_response: false });
  assert.deepEqual(session.audio.input.transcription, { model: 'gpt-4o-mini-transcribe', language: 'en' });
  assert.deepEqual(session.audio.input.noise_reduction, { type: 'near_field' });
  assert.equal(session.audio.output.voice, 'marin');
  assert.equal(session.audio.output.speed, caseDef.speechProfile.speakingRate);
  assert.equal(session.instructions, realtimeInstructions(caseDef));
  assert.equal(realtimeSessionConfig({ caseDef, model: 'm', transcriptionModel: 't', eagerness: 'medium' }).audio.input.turn_detection.eagerness, 'medium');
  assert.deepEqual(EAGERNESS_VALUES, ['low', 'medium']);
  assert.throws(() => realtimeSessionConfig({ caseDef, model: 'm', transcriptionModel: 't', eagerness: 'high' }), { code: 'invalid_configuration' });
  assert.throws(() => realtimeSessionConfig({ caseDef, model: '', transcriptionModel: 't' }), { code: 'invalid_configuration' });
  assert.throws(() => realtimeSessionConfig({ caseDef, model: 'm', transcriptionModel: 't', voice: 'someone-real' }), { code: 'invalid_configuration' });
});

test('voices: a reviewed stock profile wins, the audition table is the fallback, an unknown case fails closed', () => {
  for (const caseDef of pack.cases) {
    assert.equal(resolveVoice(caseDef), REALTIME_VOICES[caseDef.id], `${caseDef.id}: draft profile falls back to the audition table`);
    assert.ok(STOCK_VOICES.includes(resolveVoice(caseDef)));
  }
  const reviewed = JSON.parse(JSON.stringify(pack.cases[0]));
  reviewed.speechProfile.status = 'reviewed';
  reviewed.speechProfile.facultyReview.status = 'reviewed';
  reviewed.speechProfile.voiceId = 'sage';
  assert.equal(resolveVoice(reviewed), 'sage');
  reviewed.speechProfile.voiceId = 'voice_cloned_1234';
  assert.equal(resolveVoice(reviewed), 'marin', 'a non-stock id never reaches the provider');
  const unknown = { ...JSON.parse(JSON.stringify(pack.cases[0])), id: 'sp_unknown_999' };
  assert.throws(() => resolveVoice(unknown), { status: 403, code: 'realtime_voice_unavailable' });
});

test('the ceiling is computed from the pinned models and fails closed without their rows', () => {
  const card = {
    version: 't', effectiveDate: '2026-09-26', currency: 'USD',
    assumptions: { learnerAudioTokensPerMinute: 600, patientAudioTokensPerMinute: 1200, learnerSpeakingShare: 0.5, patientSpeakingShare: 1, turnsPerMinuteCeiling: 1.5, instructionTextTokens: 8000, briefTextTokens: 300 },
    rates: [
      { model: 'm', meter: 'audio_input_tokens', unit: 'million_tokens', price: 10 },
      { model: 'm', meter: 'audio_output_tokens', unit: 'million_tokens', price: 20 },
      { model: 'm', meter: 'text_input_tokens', unit: 'million_tokens', price: 1 },
      { model: 't', meter: 'transcription_audio', unit: 'minute', price: 0.003 },
    ],
  };
  // 10 minutes: learner 3,000 tokens @ $10/M = 30,000µ; patient 12,000 @ $20/M = 240,000µ;
  // 15 turns × 24,000 = 360,000 context tokens @ uncached $10/M (no cached row) = 3,600,000µ;
  // text 8,000 + 4,500 = 12,500 @ $1/M = 12,500µ; transcription 10 min = 30,000µ.
  assert.equal(sessionCeilingMicros({ rateCard: card, model: 'm', transcriptionModel: 't', deadlineMinutes: 10, maxTurns: 40 }), 30_000 + 240_000 + 3_600_000 + 12_500 + 30_000);
  card.rates.push({ model: 'm', meter: 'cached_audio_input_tokens', unit: 'million_tokens', price: 0.3 });
  assert.equal(sessionCeilingMicros({ rateCard: card, model: 'm', transcriptionModel: 't', deadlineMinutes: 10, maxTurns: 40 }), 30_000 + 240_000 + 108_000 + 12_500 + 30_000);
  // The pack turn cap bounds the context term.
  assert.equal(sessionCeilingMicros({ rateCard: card, model: 'm', transcriptionModel: 't', deadlineMinutes: 10, maxTurns: 5 }), 30_000 + 240_000 + 36_000 + 8_000 + 1_500 + 30_000);
  assert.throws(() => sessionCeilingMicros({ rateCard: card, model: 'other', transcriptionModel: 't', deadlineMinutes: 10, maxTurns: 40 }), { code: 'invalid_configuration' });
  assert.throws(() => sessionCeilingMicros({ rateCard: card, model: 'm', transcriptionModel: 'other', deadlineMinutes: 10, maxTurns: 40 }), { code: 'invalid_configuration' });
  assert.throws(() => sessionCeilingMicros({ rateCard: card, model: 'm', transcriptionModel: 't', deadlineMinutes: 0, maxTurns: 40 }), { code: 'invalid_configuration' });
  assert.throws(() => sessionCeilingMicros({ rateCard: { rates: card.rates }, model: 'm', transcriptionModel: 't', deadlineMinutes: 10, maxTurns: 40 }), { code: 'invalid_configuration' });
});

test('the shipped planning card prices both candidate models and both transcription models, and says it is planning', () => {
  assert.match(REALTIME_RATE_CARD.version, /planning/);
  for (const model of ['gpt-realtime-2.1', 'gpt-realtime-mini-2025-12-15']) {
    const micros = sessionCeilingMicros({ rateCard: REALTIME_RATE_CARD, model, transcriptionModel: 'gpt-4o-mini-transcribe', deadlineMinutes: 15, maxTurns: pack.engine.maxTurns });
    assert.ok(micros > 0 && micros < 5_000_000, `${model}: a 15-minute ceiling is a few dollars at most (${micros}µ)`);
  }
  for (const row of REALTIME_RATE_CARD.rates) assert.match(row.sourceUrl, /^https:\/\//);
});
