// The prefers-reduced-motion override in spa_index.html's first stylesheet zeroes transitions
// on selectors that are declared LATER in the same sheet at the same specificity. In the
// cascade, later wins, so the override only works if it is the last of those declarations.
// PR #677 originally placed it first and reduced motion silently did nothing for the practice
// chevrons, section chevrons and the mobile sidebar; this pins the order so it cannot regress.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPA = path.join(ROOT, '13_Faculty_Resources', '_automation', 'site_build', 'spa_index.html');

function firstStylesheet() {
  const html = fs.readFileSync(SPA, 'utf8');
  const open = html.indexOf('<style>');
  const close = html.indexOf('</style>', open);
  assert.ok(open >= 0 && close > open, 'spa_index.html carries a first <style> block');
  return html.slice(open, close);
}

test('the shell reduced-motion override is declared after every transition it zeroes', () => {
  const css = firstStylesheet();
  const override = css.match(/@media\(prefers-reduced-motion:reduce\)\{([^{}]+)\{transition:none\}\}/);
  assert.ok(override, 'the shell override exists and ends in transition:none');
  const overrideAt = override.index;
  const selectors = override[1].split(',').map((s) => s.trim());
  assert.ok(selectors.includes('.practice-chev') && selectors.includes('.layout>aside'),
    'the override still covers the practice chevron and the sidebar');
  for (const sel of selectors) {
    const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('(?:^|[{},;\\s])' + esc + '(?:,[^{]*)?\\{[^}]*transition:(?!none)', 'g');
    let m;
    while ((m = re.exec(css))) {
      assert.ok(m.index < overrideAt,
        `${sel} declares a transition at offset ${m.index}, AFTER the reduced-motion override at ${overrideAt}`);
    }
  }
});
