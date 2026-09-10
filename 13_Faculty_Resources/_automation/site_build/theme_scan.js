/* theme_scan.js — the measurement half of the ?theme-audit lamp, on its own so a gate can use it.
 *
 * WHY IT IS A SEPARATE FILE
 * -------------------------
 * theme_audit.js was a lamp: a person appends ?theme-audit and reads a panel. Lamps find things
 * — the --on-brand hole, five frozen hairlines and a 4.36:1 brand fill were all found this way,
 * by hand, after every file-reading gate had gone green. But a lamp only finds what someone
 * thought to look at, on the day they looked.
 *
 * tests/smoke/frozen-colour.spec.js turns the same measurement into a ratchet over every shipped
 * page. The measurement therefore has to live in ONE place. If the gate re-implemented the walk,
 * the two would drift, and the drift would be silent: the lamp would keep saying a page is clean
 * while the gate measured something subtly different, or the reverse. So the panel imports this,
 * the spec injects this, and the Node self-test exercises this.
 *
 * WHAT IT MEASURES, AND THE ONE THING THAT MAKES IT WORK
 * -----------------------------------------------------
 * It reads COMPUTED style, flips documentElement.dataset.theme, forces a reflow, reads again,
 * and restores. Two measurements of the same elements with one variable changed. That is the
 * whole trick, and it is why this catches what a stylesheet parser cannot: the defect only
 * exists once the browser has resolved the cascade.
 *
 * A colour identical in both themes is not automatically a defect — white ink on a brand fill is
 * deliberately invariant. So this REPORTS counts; frozen_baseline.json is what decides which
 * counts are allowed, and it only ever lets them fall.
 *
 * Deliberately ES5 and dependency-free: it has to run inside any shipped page, including ones
 * whose CSP forbids everything interesting, and inside Playwright without a build step.
 */
(function (root) {
  'use strict';

  var PANEL_ID = 'cw-theme-audit';
  var COLOUR_PROPS = ['color', 'background-color', 'border-top-color', 'border-right-color',
                      'border-bottom-color', 'border-left-color', 'outline-color'];
  var WIDTH_OF = {
    'border-top-color': 'border-top-width', 'border-right-color': 'border-right-width',
    'border-bottom-color': 'border-bottom-width', 'border-left-color': 'border-left-width',
    'outline-color': 'outline-width'
  };

  function parse(value) {
    var n = String(value).match(/[\d.]+/g);
    if (!n) return null;
    return { c: [+n[0], +n[1], +n[2]], a: n.length > 3 ? +n[3] : 1 };
  }
  function luminance(c) {
    var f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  }
  function ratio(a, b) {
    var x = luminance(a), y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  /* WCAG AA: 3:1 for large text (>=24px, or >=18.66px bold), 4.5:1 for everything else. */
  function barFor(sizePx, weight) {
    return (sizePx >= 24 || (sizePx >= 18.66 && weight >= 700)) ? 3 : 4.5;
  }
  // The pure half (parse/luminance/ratio/barFor) needs no DOM and is what tests/theme-scan.test.mjs
  // exercises directly; install() binds the DOM-dependent half to a document and window, which is
  // what lets a Playwright page and the shipped page share one implementation.
  root.cwThemeScan = {
    parse: parse, luminance: luminance, ratio: ratio, barFor: barFor,
    COLOUR_PROPS: COLOUR_PROPS, WIDTH_OF: WIDTH_OF, PANEL_ID: PANEL_ID,
    install: install
  };

  function install(doc, win) {
    function gcs(el) { return win.getComputedStyle(el); }

    function groundOf(el) {
      var n = el;
      while (n && n !== doc.documentElement) {
        var bg = parse(gcs(n).backgroundColor);
        if (bg && bg.a > 0.5) return bg.c;
        n = n.parentElement;
      }
      var r = parse(gcs(doc.documentElement).backgroundColor);
      return r && r.a > 0.5 ? r.c : [255, 255, 255];
    }
    function label(el) {
      var cls = typeof el.className === 'string' && el.className
        ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
      return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + cls;
    }
    function ownText(el) {
      var out = '';
      for (var i = 0; i < el.childNodes.length; i++) {
        var n = el.childNodes[i];
        if (n.nodeType === 3 && n.textContent.trim().length > 1) out += n.textContent.trim() + ' ';
      }
      return out.trim();
    }
    /* Visible, big enough to see, and never the audit panel itself — it is the instrument. */
    function subjects() {
      var out = [], all = doc.querySelectorAll('body *');
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        if (el.closest && el.closest('#' + PANEL_ID)) continue;
        var st = gcs(el);
        if (st.display === 'none' || st.visibility === 'hidden' || +st.opacity < 0.1) continue;
        var box = el.getBoundingClientRect();
        if (box.width < 3 || box.height < 3) continue;
        out.push(el);
      }
      return out;
    }
    /* A property counts only if it actually paints something a person can see. */
    function painted(el, st, prop) {
      var v = parse(st.getPropertyValue(prop));
      if (!v || v.a < 0.06) return null;
      if (prop === 'color') return ownText(el) ? v : null;
      if (prop === 'background-color') return v;
      // outline-width computes to a real number even when outline-style is none, which reported
      // every unfocused button as carrying a frozen black outline. Style decides whether it paints.
      if (prop === 'outline-color' && st.outlineStyle === 'none') return null;
      var w = parseFloat(st.getPropertyValue(WIDTH_OF[prop]) || '0');
      return w > 0 ? v : null;
    }
    function readAll(els) {
      var rows = [];
      for (var i = 0; i < els.length; i++) {
        var st = gcs(els[i]), one = { _px: parseFloat(st.fontSize), _w: parseInt(st.fontWeight, 10) || 400 };
        for (var p = 0; p < COLOUR_PROPS.length; p++) {
          var prop = COLOUR_PROPS[p], v = painted(els[i], st, prop);
          if (v) one[prop] = st.getPropertyValue(prop);
        }
        rows.push(one);
      }
      return rows;
    }
    // Buckets carry both a count and (up to 40) element references: the panel needs the elements
    // to flash them on click, and the spec needs only the numbers. counts() below is the reducer
    // that crosses the Playwright boundary, because a DOM node cannot.
    function bump(bucket, key, el) {
      var b = bucket[key] || (bucket[key] = { n: 0, els: [] });
      b.n++;
      if (b.els.length < 40) b.els.push(el);
    }
    function lowOf(els, rows) {
      var out = {};
      for (var i = 0; i < els.length; i++) {
        var ink = parse(rows[i].color);
        if (!ink || ink.a <= 0.1) continue;
        var bar = barFor(rows[i]._px, rows[i]._w);
        var r = ratio(ink.c, groundOf(els[i]));
        if (r < bar) bump(out, label(els[i]) + ' — ' + r.toFixed(2) + ':1 (needs ' + bar + ')', els[i]);
      }
      return out;
    }

    /* One navigation, both themes. Restores whatever the page had when it started. */
    function scan() {
      var el = doc.documentElement;
      var before = el.dataset.theme || '';
      var els = subjects();

      el.dataset.theme = 'light'; void el.offsetHeight;
      var light = readAll(els), lowLight = lowOf(els, light);

      el.dataset.theme = 'dark'; void el.offsetHeight;
      var dark = readAll(els), lowDark = lowOf(els, dark);

      if (before) el.dataset.theme = before; else delete el.dataset.theme;
      void el.offsetHeight;

      var frozen = {};
      for (var i = 0; i < els.length; i++) {
        for (var prop in light[i]) {
          if (prop.charAt(0) === '_') continue;
          if (light[i][prop] && light[i][prop] === dark[i][prop]) {
            bump(frozen, label(els[i]) + ' — ' + prop + ': ' + light[i][prop], els[i]);
          }
        }
      }
      return {
        theme: before === 'dark' ? 'dark' : 'light',
        scanned: els.length,
        frozen: frozen, lowLight: lowLight, lowDark: lowDark
      };
    }
    /* {key:{n,els}} -> {key:n}. The only shape that survives page.evaluate(). */
    function counts(bucket) {
      var out = {};
      for (var k in bucket) out[k] = bucket[k].n;
      return out;
    }
    /* What the spec calls: the same scan, reduced to numbers a test runner can carry out. */
    function measure() {
      var r = scan();
      return { scanned: r.scanned, frozen: counts(r.frozen),
               lowLight: counts(r.lowLight), lowDark: counts(r.lowDark) };
    }
    return { scan: scan, measure: measure, counts: counts,
             subjects: subjects, label: label, groundOf: groundOf };
  }
}(typeof globalThis !== 'undefined' ? globalThis : this));
