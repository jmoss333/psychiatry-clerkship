/* theme_audit.js — “which colours on this page do not know about dark mode?”
 *
 * WHY THIS EXISTS. Four defect classes shipped to learners in one day (2026-09-10), and every
 * one of them was the same thing wearing a different coat: a colour that does not flip.
 *
 *   a page-private palette the shared dark stylesheet never overrode      1.06:1
 *   an injected block styled through a namespace defined nowhere          2.59:1
 *   a correct token re-painted by a hardcoded wash in a narrower rule     1.23:1
 *   accent-tinted hairlines that no contrast probe would ever measure     — borders
 *
 * bin/check_design_drift.py now catches all four, but it learned each one AFTER it shipped, and
 * it can only ever check the routes and patterns someone thought to encode. This turns the whole
 * family into something a person can see in five seconds on ANY page, including the ones no
 * route list covers: it reads every painted colour, flips the theme in memory, reads them again,
 * and reports what did not move.
 *
 * A colour identical in both themes is not automatically wrong — white ink on a brand fill is
 * deliberately invariant — so this REPORTS, it does not fail. It is a lamp, not a gate.
 *
 * COST WHEN NOT IN USE: zero. common.py injects a ~200-byte loader that fetches this file only
 * when the URL carries ?theme-audit. No request, no parse, no listener on a normal page load.
 *
 * USE: append ?theme-audit to any page. Add &contrast to include a WCAG AA pass in the theme
 * you are currently in.
 */
(function () {
  'use strict';
  if (window.__cwThemeAudit) return;
  window.__cwThemeAudit = true;

  if (!window.cwThemeScan) {                       // theme_scan.js ships ahead of this file
    console.warn('[theme-audit] theme_scan.js did not load; nothing to render.');
    return;
  }
  var PANEL_ID = window.cwThemeScan.PANEL_ID;
  var api = window.cwThemeScan.install(document, window);

  // The measurement lives in theme_scan.js so this panel and
  // tests/smoke/frozen-colour.spec.js can never measure different things. This file is now only
  // the human-facing half: it renders what the scan found and lets you click a row to flash it.
  function run(opts) {
    var r = api.scan();
    // The scan always reports both themes. The panel shows the one you are actually looking at,
    // because a person reading it wants the page in front of them, not a table of two.
    return { theme: r.theme, scanned: r.scanned, frozen: r.frozen,
             low: opts.contrast ? (r.theme === 'dark' ? r.lowDark : r.lowLight) : {} };
  }

  function render(result, opts) {
    var old = document.getElementById(PANEL_ID);
    if (old) old.remove();

    var panel = document.createElement('aside');
    panel.id = PANEL_ID;
    panel.setAttribute('role', 'complementary');
    panel.setAttribute('aria-label', 'Theme audit results');
    // Every value here is a literal ON PURPOSE: this panel must render identically in both
    // themes, because it is the thing reporting on the theme. It is also the one element the
    // scan skips, so its literals can never appear in its own findings.
    panel.style.cssText = [
      'position:fixed', 'right:12px', 'bottom:12px', 'z-index:2147483647',
      'width:min(460px,calc(100vw - 24px))', 'max-height:min(70vh,620px)', 'overflow:auto',
      'background:#14161a', 'color:#e9e8e4', 'border:1px solid #3a3e43', 'border-radius:10px',
      'box-shadow:0 10px 40px rgba(0,0,0,.5)', 'padding:14px 16px',
      'font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace',
    ].join(';');

    var counts = function (o) { var n = 0; for (var k in o) n += o[k].n; return n; };
    var frozenTotal = counts(result.frozen), lowTotal = counts(result.low);

    var head = document.createElement('div');
    head.style.cssText = 'display:flex;justify-content:space-between;gap:10px;align-items:baseline;margin-bottom:10px';
    head.innerHTML =
      '<strong style="font:600 13px/1.4 ui-monospace,monospace">theme audit · ' + result.theme + '</strong>'
      + '<span style="color:#8d8a84">' + result.scanned + ' elements</span>';
    panel.appendChild(head);

    var summary = document.createElement('p');
    summary.style.cssText = 'margin:0 0 12px;color:#b0aca5';
    summary.textContent = frozenTotal + ' painted colour(s) identical in both themes'
      + (opts.contrast ? ' · ' + lowTotal + ' below AA here' : ' · add &contrast for a WCAG pass');
    panel.appendChild(summary);

    function section(title, groups, colour) {
      var keys = Object.keys(groups).sort(function (a, b) { return groups[b].n - groups[a].n; });
      if (!keys.length) return;
      var h = document.createElement('div');
      h.style.cssText = 'margin:12px 0 6px;color:' + colour + ';font-weight:600';
      h.textContent = title + ' (' + keys.length + ')';
      panel.appendChild(h);
      keys.forEach(function (k) {
        var row = document.createElement('button');
        row.type = 'button';
        row.style.cssText = 'display:block;width:100%;text-align:left;background:none;border:0;'
          + 'border-top:1px solid #2e3236;color:inherit;font:inherit;padding:6px 0;cursor:pointer';
        row.innerHTML = '<span style="color:' + colour + '">' + groups[k].n + '×</span> '
          + k.replace(/[<>&]/g, function (ch) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;' }[ch]; });
        row.addEventListener('click', function () {
          groups[k].els.forEach(function (el) {
            el.style.outline = '2px solid ' + colour;
            el.style.outlineOffset = '1px';
            setTimeout(function () { el.style.outline = ''; el.style.outlineOffset = ''; }, 2600);
          });
          if (groups[k].els[0]) groups[k].els[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
        });
        panel.appendChild(row);
      });
    }

    section('frozen — same colour in light and dark', result.frozen, '#e0a184');
    if (opts.contrast) section('below AA in this theme', result.low, '#e0857c');

    if (!frozenTotal && !(opts.contrast && lowTotal)) {
      var ok = document.createElement('p');
      ok.style.cssText = 'margin:6px 0 0;color:#71b795';
      ok.textContent = 'Nothing frozen. Every painted colour on this page moves with the theme.';
      panel.appendChild(ok);
    }

    var foot = document.createElement('div');
    foot.style.cssText = 'display:flex;gap:8px;margin-top:14px;border-top:1px solid #2e3236;padding-top:10px';
    [['re-scan', function () { render(run(opts), opts); }],
     ['close', function () { panel.remove(); }]].forEach(function (pair) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = pair[0];
      b.style.cssText = 'font:inherit;background:#22262b;color:#e9e8e4;border:1px solid #3a3e43;'
        + 'border-radius:5px;padding:5px 11px;cursor:pointer;min-height:28px;white-space:nowrap';
      b.addEventListener('click', pair[1]);
      foot.appendChild(b);
    });
    var hint = document.createElement('span');
    hint.style.cssText = 'color:#8d8a84;align-self:center';
    hint.textContent = 'click a row to flash it on the page';
    foot.appendChild(hint);
    panel.appendChild(foot);

    document.body.appendChild(panel);
  }

  function start() {
    var opts = { contrast: /[?&]contrast\b/.test(location.search) };
    render(run(opts), opts);
  }
  // The reader paints asynchronously; a scan on DOMContentLoaded would read an empty article.
  if (document.readyState === 'complete') setTimeout(start, 400);
  else window.addEventListener('load', function () { setTimeout(start, 400); });
})();
