import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repo = process.cwd();
const METRICS_ORIGIN = 'https://clerkship-metrics.netlify.app';

for (const site of ['ms3', 'res']) {
  const out = path.join(repo, '_build', site);
  // CLERKSHIP_ANALYTICS defaults off (common.py's analytics_enabled_for()); a
  // legitimately-disabled build ships _build/<site> with no analytics.js and
  // no CW_SITE tag at all. Detect that state from the build itself rather
  // than the env var — this file (unlike check-static-site.mjs §12, the real
  // post-build gate) commonly runs BEFORE either site is built at all, so
  // every assertion here already has to tolerate "no _build/<site>" the same
  // way.
  const builtAt = fs.existsSync(out);
  const analyticsEnabled = builtAt && fs.existsSync(path.join(out, 'analytics.js'));

  test(`(build ${site}) ships analytics.js when the build flag enables it`, (t) => {
    if (!builtAt) { t.skip(`no _build/${site}`); return; }
    if (!analyticsEnabled) { t.skip(`analytics disabled for this ${site} build (CLERKSHIP_ANALYTICS)`); return; }
    assert.ok(fs.existsSync(path.join(out, 'analytics.js')), 'analytics.js copied to the site root');
  });

  test(`(build ${site}) ships nothing analytics-related when the build flag disables it`, (t) => {
    if (!builtAt) { t.skip(`no _build/${site}`); return; }
    if (analyticsEnabled) { t.skip(`analytics enabled for this ${site} build`); return; }
    assert.ok(!fs.existsSync(path.join(out, 'analytics.js')), 'analytics.js must not ship when disabled');
    const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
    assert.ok(!html.includes('CW_SITE'), 'index.html must not reference CW_SITE when disabled');
    assert.ok(!html.includes('analytics.js'), 'index.html must not load the emitter when disabled');
  });

  test(`(build ${site}) CSP allows the metrics origin and nothing new besides`, (t) => {
    if (!builtAt) { t.skip(`no _build/${site}`); return; }
    const headers = fs.readFileSync(path.join(out, '_headers'), 'utf8');
    const connect = /connect-src ([^;]+);/.exec(headers);
    assert.ok(connect, 'connect-src present');
    const origins = connect[1].trim().split(/\s+/);
    assert.deepEqual(origins.sort(), [
      "'self'", METRICS_ORIGIN, 'https://sp-interview-proxy.netlify.app',
    ].sort(), 'connect-src gained exactly the metrics origin');
  });

  test(`(build ${site}) index.html declares CW_SITE and loads the emitter`, (t) => {
    if (!builtAt) { t.skip(`no _build/${site}`); return; }
    if (!analyticsEnabled) { t.skip(`analytics disabled for this ${site} build (CLERKSHIP_ANALYTICS)`); return; }
    const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
    assert.match(html, /<script src="\/analytics\.js" defer><\/script>/);
    assert.match(html, new RegExp(`window\\.CW_SITE='${site}'`));
  });

  test(`(build ${site}) every injected CW_PAGE value is on that site's allowlist`, (t) => {
    if (!builtAt) { t.skip(`no _build/${site}`); return; }
    if (!analyticsEnabled) { t.skip(`analytics disabled for this ${site} build (CLERKSHIP_ANALYTICS)`); return; }
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
