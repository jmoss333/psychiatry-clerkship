import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
// The shipped browser file is a classic script; loaded the same way client.test.mjs does.
const clientModule={exports:{}};
vm.runInThisContext('(function(module,exports){'+fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8')+'\n})',{filename:'preview-client.js'})(clientModule,clientModule.exports);
const {elapsedLabel,elapsedIso,closingNote}=clientModule.exports;
const T0=1_700_000_000_000;

test('the room clock reports whole minutes and never a running countdown',()=>{
  assert.equal(elapsedLabel(T0,T0),'under a minute');
  assert.equal(elapsedLabel(T0,T0+59_000),'under a minute');
  assert.equal(elapsedLabel(T0,T0+60_000),'1 min');
  assert.equal(elapsedLabel(T0,T0+11*60_000+30_000),'11 min');
  assert.equal(elapsedLabel(null,T0+60_000),'','no clock before the encounter starts');
  assert.equal(elapsedLabel(T0,T0-1),'','a clock that runs backwards shows nothing');
});
test('the datetime attribute is a valid ISO duration',()=>{
  assert.equal(elapsedIso(T0,T0+90_000),'PT90S');
  assert.equal(elapsedIso(T0,T0),'PT0S');
  assert.equal(elapsedIso(null,T0),'');
  assert.match(elapsedIso(T0,T0+61_500),/^PT\d+S$/);
});
test('the closing note appears at two questions left, then one, and nowhere else',()=>{
  assert.equal(closingNote(7,10,'listening'),'');
  assert.equal(closingNote(8,10,'listening'),'Two questions left — start closing.');
  assert.equal(closingNote(9,10,'listening'),'Last question — a summary they can correct.');
  assert.equal(closingNote(10,10,'listening'),'','no note once the budget is spent');
  assert.equal(closingNote(8,10,'ended'),'','nothing after the encounter ends');
  assert.equal(closingNote(8,10,'gate'),'','nothing before it starts');
  assert.equal(closingNote(3,5,'listening'),'Two questions left — start closing.','the note tracks maxTurns, not a hard-coded 10');
});
test('the clock ships in the markup and is styled as a companion, not a countdown',()=>{
  const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  assert.match(html,/<time id="elapsed" hidden><\/time>/,'the clock is a <time> element');
  assert.match(html,/id="turn-count-text"/,'the turn count keeps its own span so the clock can sit beside it');
  assert.match(html,/id="closing-note"/);
  const css=fs.readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');
  assert.ok(css.includes('#elapsed{color:var(--muted)'),'the clock is muted');
  assert.ok(css.includes('.closing-note{'),'the closing note has the review-note treatment');
});
