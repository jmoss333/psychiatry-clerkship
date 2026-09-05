import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repo = process.cwd();
const METRICS_ORIGIN = 'https://clerkship-metrics.netlify.app';

for (const site of ['ms3', 'res']) {
  const out = path.join(repo, '_build', site);

  test(`(build ${site}) ships analytics.js`, (t) => {
    if (!fs.existsSync(out)) { t.skip(`no _build/${site}`); return; }
    assert.ok(fs.existsSync(path.join(out, 'analytics.js')), 'analytics.js copied to the site root');
  });

  test(`(build ${site}) CSP allows the metrics origin and nothing new besides`, (t) => {
    if (!fs.existsSync(out)) { t.skip(`no _build/${site}`); return; }
    const headers = fs.readFileSync(path.join(out, '_headers'), 'utf8');
    const connect = /connect-src ([^;]+);/.exec(headers);
    assert.ok(connect, 'connect-src present');
    const origins = connect[1].trim().split(/\s+/);
    assert.deepEqual(origins.sort(), [
      "'self'", METRICS_ORIGIN, 'https://sp-interview-proxy.netlify.app',
    ].sort(), 'connect-src gained exactly the metrics origin');
  });

  test(`(build ${site}) index.html declares CW_SITE and loads the emitter`, (t) => {
    if (!fs.existsSync(out)) { t.skip(`no _build/${site}`); return; }
    const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
    assert.match(html, /<script src="\/analytics\.js" defer><\/script>/);
    assert.match(html, new RegExp(`window\\.CW_SITE='${site}'`));
  });

  test(`(build ${site}) every injected CW_PAGE value is on that site's allowlist`, (t) => {
    if (!fs.existsSync(out)) { t.skip(`no _build/${site}`); return; }
    const allowlistPath = path.join(repo, 'metrics', 'allowlist.json');
    if (!fs.existsSync(allowlistPath)) { t.skip('no metrics/allowlist.json'); return; }
    const allowlist = JSON.parse(fs.readFileSync(allowlistPath, 'utf8'));
    const allowedKeys = new Set(allowlist.keys[site] || []);

    const toolsDir = path.join(out, 'tools');
    const htmlFiles = [path.join(out, 'index.html')];
    if (fs.existsSync(toolsDir)) {
      for (const f of fs.readdirSync(toolsDir)) {
        if (f.endsWith('.html')) htmlFiles.push(path.join(toolsDir, f));
      }
    }

    let pagesWithCwPage = 0;
    const unmatched = [];
    for (const file of htmlFiles) {
      if (!fs.existsSync(file)) continue;
      const html = fs.readFileSync(file, 'utf8');
      const m = /window\.CW_PAGE='([^']+)'/.exec(html);
      if (!m) continue;
      pagesWithCwPage += 1;
      const key = `page:${m[1]}`;
      if (!allowedKeys.has(key)) {
        unmatched.push(`${path.relative(out, file)} -> ${key}`);
      }
    }

    assert.ok(pagesWithCwPage > 0, `expected at least one built ${site} page to carry CW_PAGE`);
    assert.deepEqual(unmatched, [], 'every injected CW_PAGE value must resolve to an allowlisted key');
  });
}
