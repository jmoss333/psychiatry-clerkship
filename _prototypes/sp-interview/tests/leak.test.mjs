// Locked-content leak check, multi-case: gated reveal text must NEVER enter the actor's
// context until the gate is earned. Probe phrases are unique to gated reveals — uniqueness is
// verified against everything that CAN enter actor context (persona, responses, hiddenAgendaTone).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const { _internals } = await import(path.join(REPO, 'sp-proxy/netlify/functions/sp.mjs'));
const pack = JSON.parse(fs.readFileSync(path.join(REPO, '_prototypes/sp-interview/sp-interview.pack.json'), 'utf8'));

const cases = [
  {
    idx: 0,
    secrets: ["looked at it long enough","never written anything","picked a day","Tom doesn't know I've thought","hung the moon","kept the bottle closed","waiting for you to look horrified","stood in the bathroom"],
    lock: ["Have you had thoughts of killing yourself?"],
    warm: ["Hi, my name is Alex, what would you like me to understand?","Tell me more about what's been going on, in your own words.","That sounds really hard.","Have you had thoughts of killing yourself?"],
    warmExpect: "looked at it long enough",
    warmStillLocked: "hung the moon"
  },
  {
    idx: 1,
    secrets: ["passenger in my own head","nine hundred dollars","felt inevitable","don't know her name","ugly flicker","Jayden froze the card"],
    lock: ["What have you been spending money on?"],
    warm: ["Hi, my name is Alex, I'm the medical student on the team — before we start, what would you most want from this conversation?","Tell me what's been going on, in your own words.","What have you been spending money on lately?"],
    warmExpect: "nine hundred dollars",
    warmStillLocked: "don't know her name"
  },
  {
    idx: 2,
    secrets: ["make them stop before they finish","To do it myself","tired of being afraid of my own apartment","since Sunday","seal's still on","sleeping in my car","The voice wants that, not me"],
    lock: ["Do the voices tell you to do anything?"],
    warm: ["Hi, I'm Alex, no recording here, you're in control.","We can stop whenever you want. What has this been like for you, these last few weeks?","That sounds really frightening.","When the voice talks, does it ever tell you to do anything?"],
    warmExpect: "make them stop before they finish",
    warmStillLocked: "sleeping in my car"
  }
];

let fails = 0;
for (const tc of cases) {
  const cd = pack.cases[tc.idx];
  const gatedText = cd.gated.map(g => (g.reveal || '') + ' ' + (g.repeatAsk || '')).join(' ');
  const actorVisible = JSON.stringify({ p: cd.persona, r: cd.responses, t: cd.hiddenAgendaTone });
  const bad = tc.secrets.filter(s => !gatedText.includes(s) || actorVisible.includes(s));
  if (bad.length) { console.log('TEST-SETUP FAIL (' + cd.id + ') — probes not gate-unique:', bad); fails++; continue; }

  const locked = _internals.actorSystem(cd, _internals.deriveState(cd, tc.lock));
  const leaks = tc.secrets.filter(s => locked.includes(s));
  console.log((leaks.length ? 'FAIL' : 'PASS') + ' — ' + cd.id + ': no gated content in locked context' + (leaks.length ? ': ' + leaks.join('; ') : ''));
  if (leaks.length) fails++;

  const warm = _internals.actorSystem(cd, _internals.deriveState(cd, tc.warm));
  const okReveal = warm.includes(tc.warmExpect);
  const okStillLocked = !warm.includes(tc.warmStillLocked);
  console.log((okReveal && okStillLocked ? 'PASS' : 'FAIL') + ' — ' + cd.id + ': earned reveal present, unearned still absent');
  if (!okReveal || !okStillLocked) fails++;
}
process.exit(fails ? 1 : 0);
