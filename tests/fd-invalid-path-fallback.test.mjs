import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL(
  '../13_Faculty_Resources/_automation/site_build/spa_index.html', import.meta.url,
), 'utf8');

function extract(re, label) {
  const match = source.match(re);
  assert.ok(match, `${label} not found`);
  return match[0];
}

const progressSrc = extract(/window\.renderProgress=function\(\)\{[\s\S]*?\n  \};/, 'renderProgress');
const storedPlanSrc = extract(/function renderStoredPlan\(\)\{[^\n]*/, 'renderStoredPlan');
const invalidIndex = { path: { id: '', weekCount: 0 }, weeks: [] };
const fallback = (surface) => `<div class="fd-fallback" data-fd-fallback="${surface}" role="alert">This section could not load. Try reloading, or use another tab.</div>`;

test('Progress uses the standard fallback for an invalid path instead of offering placement', () => {
  // eslint-disable-next-line no-new-func
  const renderProgress = new Function('FD_INDEX', 'fdActivePathValid', 'fdPathFallback', `
    var window={};
    function navScan(){ return {cov:{},hy:[]}; }
    function masteryByBlueprint(){ return []; }
    function LS(){ return ''; }
    function fdLoadPlan(){ return null; }
    function fdPathWeekCount(){ return 0; }
    function weakTopics(){ return []; }
    function renderCalibPanel(){ return ''; }
    function calibrationSummary(){ return {total:0}; }
    function esc(value){ return String(value); }
    ${progressSrc}
    return window.renderProgress;
  `)(invalidIndex, () => false, fallback);
  const html = renderProgress();
  assert.equal(html, fallback('progress'));
  assert.doesNotMatch(html, /placement|0-week/i);
});

test('the stored-plan entry uses the standard fallback instead of starting placement', () => {
  // eslint-disable-next-line no-new-func
  const view = new Function('FD_INDEX', 'fdActivePathValid', 'fdPathFallback', `
    var started=false, contentEl={className:'',innerHTML:''}, currentItem=null;
    function fdLoadPlan(){ return null; }
    function fdPathWeekCount(){ return 0; }
    function startPretest(){ started=true; }
    function setLearnerTitle(){}
    ${storedPlanSrc}
    return {renderStoredPlan:renderStoredPlan,get:function(){return {started:started,html:contentEl.innerHTML};}};
  `)(invalidIndex, () => false, fallback);
  view.renderStoredPlan();
  const result = view.get();
  assert.equal(result.started, false);
  assert.match(result.html, /data-fd-fallback="plan" role="alert"/);
  assert.doesNotMatch(result.html, /placement|0-week/i);
});
