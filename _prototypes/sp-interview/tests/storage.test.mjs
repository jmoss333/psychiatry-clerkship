import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = ['sp-interview.html', 'sp-interview.preview.html'];

for (const file of files) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const label = `${file}:`;

  assert.match(
    html,
    /localStorage\.getItem\(\s*['"]cw_sp_endpoint['"]\s*\)/,
    `${label} endpoint must persist`,
  );
  assert.match(
    html,
    /localStorage\.setItem\(\s*['"]cw_sp_endpoint['"]/,
    `${label} endpoint must persist`,
  );
  assert.match(
    html,
    /sessionStorage\.getItem\(\s*['"]cw_sp_passcode['"]\s*\)/,
    `${label} passcode must load from sessionStorage`,
  );
  assert.match(
    html,
    /sessionStorage\.setItem\(\s*['"]cw_sp_passcode['"]/,
    `${label} passcode must save to sessionStorage`,
  );
  assert.match(
    html,
    /sessionStorage\.removeItem\(\s*['"]cw_sp_passcode['"]\s*\)/,
    `${label} passcode must have a clear path`,
  );
  assert.match(
    html,
    /localStorage\.removeItem\(\s*['"]cw_sp_passcode['"]\s*\)/,
    `${label} legacy persistent passcode must be deleted`,
  );
  assert.match(
    html,
    /useEffect\(function\(\)\{[\s\S]{0,240}clearLegacyPasscode\(\)/,
    `${label} legacy passcode cleanup must run on initialization`,
  );
  assert.doesNotMatch(
    html,
    /localStorage\.(?:getItem|setItem)\(\s*['"]cw_sp_passcode['"]/,
    `${label} passcode must never be read from or written to localStorage`,
  );
  assert.match(html, /Clear passcode/, `${label} clear action must be visible`);
  assert.match(
    html,
    /E\.provider\.passcode\s*=\s*['"]['"]/,
    `${label} clear action must blank the active provider credential`,
  );
  assert.match(
    html,
    /The passcode is kept only for this browser tab\./,
    `${label} tab-lifetime guidance must be visible`,
  );
  if (file === 'sp-interview.html') {
    assert.match(
      html,
      /https:\/\/sp-interview-proxy\.netlify\.app\/api\/sp/,
      `${label} production endpoint must remain prefilled`,
    );
    assert.match(html, /useState\(['"]live['"]\)/, `${label} Live must remain the default`);
  } else {
    assert.match(html, /useState\(['"]mock['"]\)/, `${label} Mock must remain the default`);
    assert.match(html, /window\.__SP_PACK__\s*=/, `${label} draft pack must remain embedded`);
  }
}

console.log('PASS — passcode is tab-scoped in canonical and preview tools');
