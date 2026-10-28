import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const base = '../13_Faculty_Resources/_automation/site_build/frontdoor/';
const read = name => readFileSync(new URL(base + name, import.meta.url), 'utf8');
const source = ['fd_data.js', 'fd_care_navigator.js', 'fd_care_pack.js',
  'fd_care_search.js', 'fd_care.js', 'fd_wire.js'].map(read).join('\n');
const curriculum = JSON.parse(readFileSync(new URL('../curriculum.json', import.meta.url), 'utf8'));
const index = { ...curriculum, byRef: {} };
const selected = ['resource-finder'];
const crisis = '<section class="crisis-block">Governed fixture</section>';

function api(enabled) {
  // Only explicit opt-in fixtures override the production default.
  return new Function('enabled', source + `
    if (enabled !== undefined) FD_CARE_PATIENT_SHARING_ENABLED = enabled;
    var qrCalls = 0;
    var qrcode = function(){ qrCalls++; throw new Error('QR should not be generated'); };
    return { care: fdCare, pack: fdCarePack, share: fdCareShare,
      builder: fdCareBuilder, dispatch: fdDispatch, qrCalls: function(){return qrCalls;} };
  `)(enabled);
}

test('production Care omits patient-sharing markup even with stale selections', () => {
  const F = api();
  assert.equal(F.pack(index, selected, crisis), '');
  assert.equal(F.share(index, 'resource-finder', selected), '');
  assert.equal(F.builder(index), '');
  const html = F.care(index, 'services', selected, crisis);
  assert.match(html, /data-care-directory/);
  assert.match(html, /data-fd-care-intent="services"/);
  assert.equal((html.match(/class="fd-carelink" data-care-resource=/g) || []).length, 5);
  assert.doesNotMatch(html, /data-fd-care-(?:share|pack|copy|builder)|fd-careitem__actions/);
  assert.equal(F.qrCalls(), 0);
});

test('disabled patient-sharing dispatch cannot copy, print, select or open QR', () => {
  const F = api();
  const state = { screen: 'app', tab: 'care', carePackIds: selected, careShareId: 'resource-finder' };
  for (const action of ['data-fd-care-pack', 'data-fd-care-pack-print',
    'data-fd-care-share', 'data-fd-care-copy', 'data-fd-care-copy-selected']) {
    const result = F.dispatch({ [action]: 'resource-finder' }, { index }, state);
    assert.equal(result.effect, null, action);
    assert.equal(result.route, null, action);
    assert.deepEqual(result.patch, { carePackIds: [], careShareId: '' }, action);
  }
  assert.deepEqual(F.dispatch({ 'data-fd-care-intent': 'services' }, { index }, state).patch,
    { careIntentId: 'services' });
});

test('only an explicit boolean opt-in restores the retained sharing feature', () => {
  for (const value of [false, 'true', 1, {}]) {
    assert.equal(api(value).pack(index, [], crisis), '');
  }
  const F = api(true);
  assert.match(F.pack(index, [], crisis), /data-fd-care-pack-print/);
  assert.match(F.care(index, '', [], crisis), /data-fd-care-share="resource-finder"/);
  assert.equal(F.dispatch({ 'data-fd-care-pack-print': '' }, { index },
    { tab: 'care', carePackIds: selected }).effect.type, 'print-care-pack');
});
