import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const asset = new URL('../02_Clinical_Skills/Mental_Status_Exam/mse-rounds-case.js', import.meta.url);
function api() {
  assert.ok(existsSync(asset), 'the shared fictional case and bounded handoff are available');
  const window = {};
  new Function('window', 'URLSearchParams', readFileSync(asset, 'utf8'))(window, URLSearchParams);
  return window.MSERounds;
}
test('the same curated case separates observations, reports, and missing assessment', () => {
  const a = api();
  assert.equal(a.caseData.id, 'mse-change-v1');
  assert.deepEqual(a.caseData.reviewSlugs, ['mse.html', 'oral.html']);
  assert.deepEqual([...new Set(a.caseData.rows.map(r => r.source))], ['Observed', 'Patient report', 'Not assessed']);
  assert.equal(new Set(a.caseData.rows.map(r => r.id)).size, a.caseData.rows.length);
});
test('handoffs carry only selected IDs and round-trip through direct and shell routes', () => {
  const a = api();
  for (const embedded of [false, true]) {
    const url = new URL(a.link('oral.html', ['attention', 'speech'], embedded), 'https://example.test/tools/mse.html');
    assert.deepEqual(a.read(url.search), { present: true, valid: true, ids: ['speech', 'attention'] });
    assert.equal(url.searchParams.get('format'), 'rounds');
    assert.equal(url.searchParams.get('view'), 'guided');
    assert.equal(url.pathname, embedded ? '/' : '/tools/oral.html');
    assert.equal(url.searchParams.get('tool'), embedded ? 'oral.html' : null);
    assert.equal(a.read(new URL(a.link('mse.html', ['speech'], embedded), url).search).valid, true);
  }
});
test('unknown, duplicate, empty, or partial URL fields cannot become a clinical handoff', () => {
  const a = api();
  for (const q of ['?msecase=unknown&msepicks=speech', '?msecase=mse-change-v1', '?msepicks=speech', '?msecase=mse-change-v1&msepicks=', '?msecase=mse-change-v1&msepicks=speech,untrusted', '?msecase=mse-change-v1&msecase=mse-change-v1&msepicks=speech', '?msecase=mse-change-v1&msepicks=speech&msepicks=mood']) {
    assert.deepEqual(a.read(q), { present: true, valid: false, ids: [] }, q);
  }
  assert.deepEqual(a.read('?format=rounds'), { present: false, valid: false, ids: [] });
});
test('normalization never mutates selections and rejects unsupported destinations', () => {
  const a = api(); const input = ['attention', 'speech', 'speech'];
  assert.deepEqual(a.normalize(input), ['speech', 'attention']);
  assert.deepEqual(input, ['attention', 'speech', 'speech']);
  assert.equal(a.link('https://untrusted.test', input, false), null);
  assert.equal(a.link('oral.html', [], false), null);
  assert.equal(a.link('oral.html', ['speech', 'untrusted'], false), null);
});
test('selection identity is order-independent but changes when the learner changes the selection', () => {
  const a = api();
  assert.equal(a.token(['mood', 'speech']), a.token(['speech', 'mood']));
  assert.notEqual(a.token(['speech']), a.token(['speech', 'attention']));
});
test('both tools load the registered case and derive review status from their canonical records', () => {
  api();
  const manifest = JSON.parse(readFileSync(new URL('../13_Faculty_Resources/_automation/site_build/site_manifest.json', import.meta.url)));
  assert.ok(manifest.toolAssets.some(x => x[0].endsWith('/mse-rounds-case.js') && x[1] === 'mse-rounds-case.js'));
  const reviewed = JSON.parse(readFileSync(new URL('../13_Faculty_Resources/reviewed.json', import.meta.url)));
  for (const [slug, path] of [['mse.html', 'Mental_Status_Exam/mental-status-exam-module.html'], ['oral.html', 'Oral_Presentations/oral-presentation-module.html']]) {
    assert.match(readFileSync(new URL('../02_Clinical_Skills/' + path, import.meta.url), 'utf8'), /src="mse-rounds-case.js"/);
    assert.ok(['pending', 'reviewed'].includes(reviewed[slug].status));
    if (reviewed[slug].status === 'pending') {
      assert.equal(reviewed[slug].by, 'Pending faculty review');
      assert.ok(reviewed[slug].reason);
    }
  }
});
