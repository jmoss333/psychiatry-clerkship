// Locked-content leak check: gated reveal text must NEVER enter the actor's context
// until the gate is earned. Probe phrases are unique to gated reveals (verified below).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const { _internals } = await import(path.join(REPO, 'sp-proxy/netlify/functions/sp.mjs'));
const pack = JSON.parse(fs.readFileSync(path.join(REPO, '_prototypes/sp-interview/sp-interview.pack.json'), 'utf8'));
const cd = pack.cases[0];
const secrets = ["looked at it long enough","never written anything","picked a day","Tom doesn't know I've thought","hung the moon","kept the bottle closed","waiting for you to look horrified","stood in the bathroom"];
const gatedText = cd.gated.map(g => (g.reveal || '') + ' ' + (g.repeatAsk || '')).join(' ');
const nonGated = JSON.stringify({ p: cd.persona, r: cd.responses, h: cd.hiddenAgenda, d: cd.debriefTeachingPoints });
const bad = secrets.filter(s => !gatedText.includes(s) || nonGated.includes(s));
if (bad.length) { console.log('TEST-SETUP FAIL — probe terms not gate-unique:', bad); process.exit(1); }
const locked = _internals.actorSystem(cd, _internals.deriveState(cd, ["Have you had thoughts of killing yourself?"]));
const leaks = secrets.filter(s => locked.includes(s));
console.log((leaks.length ? 'FAIL' : 'PASS') + ' — no gated reveal content in locked actor context' + (leaks.length ? ': ' + leaks.join('; ') : ''));
const warm = _internals.actorSystem(cd, _internals.deriveState(cd, ["Hi, my name is Alex, what would you like me to understand?","Tell me more about what's been going on, in your own words.","That sounds really hard.","Have you had thoughts of killing yourself?"]));
console.log((warm.includes('looked at it long enough') ? 'PASS' : 'FAIL') + ' — reveal enters context only after unlock');
process.exit(leaks.length ? 1 : 0);
