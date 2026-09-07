import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const CASE_ID = 'sp_depression_gated_si_001';
const GATED_SPEECH_FIELDS = ['reveal', 'deflectLowRapport', 'deflectEuphemism', 'repeatAsk', 'deflectIfLocked'];
const digest = text => createHash('sha256').update(text, 'utf8').digest('hex');

/**
 * Enumerate only Dana's scripted patient speech, never arbitrary pack strings.
 * id and sha256 identify the exact source text, NOT generated audio bytes.
 * spokenHash identifies text after the device speaker's direction/space cleanup.
 * A recording manifest must store its own audio-byte hash separately.
 * This pure function performs no I/O and does not call a speech provider.
 */
export function createDanaAudioCatalog(pack) {
  const matches = pack?.cases?.filter(c => c.id === CASE_ID) || [];
  if (matches.length !== 1) throw new Error('Expected exactly one canonical Dana case.');
  if (typeof pack.version !== 'string' || !pack.version.trim()) throw new Error('The pack version is missing.');
  const dana = matches[0], entries = [], seen = new Set();

  function add(sourceText, field) {
    if (typeof sourceText !== 'string' || !sourceText.trim()) throw new Error(`Dana speech is missing at ${field}.`);
    const spokenText = sourceText.replace(/\*[^*]*\*/g, ' ').replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!spokenText) throw new Error(`Dana spoken text is empty at ${field}.`);
    if (seen.has(sourceText)) return;
    seen.add(sourceText);
    const id = digest(sourceText);
    entries.push({id, sourceText, spokenText, sha256: id, spokenHash: digest(spokenText), file: id + '.mp3'});
  }

  add(dana.persona?.opening, 'persona.opening');
  if (!dana.responses || typeof dana.responses !== 'object') throw new Error('Dana response bank is missing.');
  for (const [intent, bank] of Object.entries(dana.responses)) {
    if (!bank || typeof bank !== 'object') throw new Error(`Dana response bank ${intent} is invalid.`);
    for (const tier of ['guarded', 'open', 'any']) {
      if (!Object.hasOwn(bank, tier)) continue;
      if (!Array.isArray(bank[tier]) || !bank[tier].length) throw new Error(`Dana response bank ${intent}.${tier} is empty.`);
      bank[tier].forEach((line, index) => add(line, `responses.${intent}.${tier}[${index}]`));
    }
  }
  if (!Array.isArray(dana.gated)) throw new Error('Dana gated speech is missing.');
  for (const gate of dana.gated) {
    for (const field of GATED_SPEECH_FIELDS) {
      if (field === 'reveal' || Object.hasOwn(gate, field)) add(gate[field], `gated.${gate.id}.${field}`);
    }
  }
  return {caseId: CASE_ID, packVersion: pack.version, entries};
}

function main(args) {
  if (args.length && (args.length !== 2 || args[0] !== '--out' || !args[1] || args[1].startsWith('--'))) {
    throw new Error('Usage: node dana-audio-catalog.mjs [--out catalog.json]');
  }
  const pack = JSON.parse(fs.readFileSync(new URL('./sp-interview.pack.json', import.meta.url), 'utf8'));
  const catalog = createDanaAudioCatalog(pack);
  if (args.length) {
    fs.writeFileSync(path.resolve(args[1]), JSON.stringify(catalog, null, 2) + '\n', 'utf8');
    console.log(`Wrote ${catalog.entries.length} Dana speech entries to the requested catalog.`);
  } else {
    console.log(`Dana audio catalog: ${catalog.entries.length} scripted lines. Use --out <path> to write JSON. No audio generated.`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
