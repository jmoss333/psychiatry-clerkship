/* Cohort aggregate engine — the ONE aggregation + suppression implementation (F8, D-F8-2/D-F8-6).
 *
 * Shared, byte for byte, by:
 *   - the director dashboard prototype (_prototypes/director-dashboard/director-dashboard.html),
 *     which loads this file as a classic <script>, and
 *   - the read-only function (metrics/aggregate/cohort_function.mjs — un-wired until the metrics
 *     Netlify site exists), which imports it for its side effect.
 * Both read `globalThis.CohortAggregate`. Tested once: tests/director-dashboard.test.mjs.
 *
 * Pure: no DOM, no storage, no network, no clock, no logging. Input contract and suppression
 * rules: _prototypes/director-dashboard/DATA_CONTRACT.md.
 *
 * publish(feed) returns ONLY grouped, suppressed totals. A suppressed cell carries no value at
 * all ({ shown: false }), so nothing downstream can render or forward the hidden number.
 */
(function (root) {
  'use strict';

  // Policy floor: L8 §2.1 / tools-and-frontdoor "cells below n=5 are suppressed"; F-wave
  // D-F6-5 / D-F8-1: n>=5. A feed may RAISE the threshold, never lower it.
  var MIN_THRESHOLD = 5;
  var AGGREGATE_VERSION = 1;
  var SITES = ['ms3', 'res'];
  var TOP_KEYS = ['_synthetic', '_label', 'contractVersion', 'generatedOn', 'suppressionThreshold',
    'rotationBlocks', 'counters', 'prepost'];
  var COUNTER_KEYS = ['site', 'week', 'key', 'n'];
  var BLOCK_KEYS = ['id', 'site', 'start', 'weeks'];
  var PREPOST_KEYS = ['block', 'eligible', 'consented', 'paired', 'facultyHours', 'privacyIncidents'];
  var QBANK_OPEN = 'page:question-bank-practice.html';
  var REVIEW_OPEN = 'page:review.html';
  // Cumulative threshold keys (PR #1076) are NEVER published as such: nested thresholds can be
  // differenced (D-F8-6). They are converted to disjoint tiers that partition the tool's opens.
  var FUNNELS = {
    qbank: {
      open: QBANK_OPEN,
      steps: ['tool:qbank:answered-5', 'tool:qbank:answered-10', 'tool:qbank:answered-20'],
      tiers: ['lt5', '5to9', '10to19', '20up'],
      labels: ['opened, fewer than 5 answered', '5–9 answered', '10–19 answered', '20+ answered']
    },
    review: {
      open: REVIEW_OPEN,
      steps: ['tool:daily-review:graded-1', 'tool:daily-review:graded-10',
        'tool:daily-review:graded-25'],
      tiers: ['none', '1to9', '10to24', '25up'],
      labels: ['opened, none graded', '1–9 graded', '10–24 graded', '25+ graded']
    }
  };
  var BANDS = ['lt50', '50to79', '80up'];
  var BAND_LABELS = ['<50% correct', '50–79%', '≥80%'];
  // PROPOSED key family — no producer emits it (PR #1076 deliberately sends no category).
  var CAT_RE = /^tool:qbank:cat:([a-z0-9-]+):first10-(lt50|50to79|80up)$/;
  var DAY = 86400000;

  function isInt(v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v >= 0; }
  function onlyKeys(obj, allowed, where, errs) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) { errs.push(where + ': not an object'); return false; }
    Object.keys(obj).forEach(function (k) {
      if (allowed.indexOf(k) < 0) errs.push(where + ': field "' + k + '" is not in the aggregate-only contract');
    });
    return true;
  }
  function parseDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    if (!m) return null;
    var t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    var d = new Date(t);
    return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? t : null;
  }
  function mondayOf(t) { var dow = new Date(t).getUTCDay(); return t - ((dow + 6) % 7) * DAY; }
  function isoWeekMonday(week) {
    var m = /^(\d{4})-W(\d{2})$/.exec(week || '');
    if (!m || +m[2] < 1 || +m[2] > 53) return null;
    var jan4 = Date.UTC(+m[1], 0, 4);
    return mondayOf(jan4) + (+m[2] - 1) * 7 * DAY;
  }
  function threshold(feed) {
    var t = feed && feed.suppressionThreshold;
    return isInt(t) && t >= MIN_THRESHOLD ? t : MIN_THRESHOLD;
  }

  function validateFeed(feed) {
    var errs = [];
    if (!onlyKeys(feed, TOP_KEYS, 'feed', errs)) return errs;
    if (typeof feed._synthetic !== 'boolean') errs.push('feed: "_synthetic" must be true or false');
    if (feed.contractVersion !== 1) errs.push('feed: contractVersion must be 1');
    if (feed.suppressionThreshold !== undefined &&
        !(isInt(feed.suppressionThreshold) && feed.suppressionThreshold >= MIN_THRESHOLD)) {
      errs.push('feed: suppressionThreshold must be an integer >= ' + MIN_THRESHOLD + ' (policy floor)');
    }
    var blocks = Array.isArray(feed.rotationBlocks) ? feed.rotationBlocks : (errs.push('feed: rotationBlocks must be an array'), []);
    var ids = {};
    blocks.forEach(function (b, i) {
      var w = 'rotationBlocks[' + i + ']';
      if (!onlyKeys(b, BLOCK_KEYS, w, errs)) return;
      // 32 chars admits the opaque rot-YYYY-hx-<16hex> ids of the committed calendar.
      if (typeof b.id !== 'string' || !/^[A-Za-z0-9-]{1,32}$/.test(b.id) || b.id === 'all') errs.push(w + ': id must be a short label');
      else if (ids[b.id]) errs.push(w + ': duplicate id ' + b.id); else ids[b.id] = true;
      if (SITES.indexOf(b.site) < 0) errs.push(w + ': site must be ms3 or res');
      if (parseDate(b.start) === null) errs.push(w + ': start must be YYYY-MM-DD');
      if (!isInt(b.weeks) || b.weeks < 1 || b.weeks > 16) errs.push(w + ': weeks must be 1–16');
    });
    // Overlapping blocks on one site make ISO-week -> rotation-week ambiguous (L8 known limit).
    for (var i = 0; i < blocks.length; i++) for (var j = i + 1; j < blocks.length; j++) {
      var a = blocks[i], c = blocks[j];
      if (!a || !c || a.site !== c.site || parseDate(a.start) === null || parseDate(c.start) === null) continue;
      var a0 = mondayOf(parseDate(a.start)), c0 = mondayOf(parseDate(c.start));
      if (a0 < c0 + c.weeks * 7 * DAY && c0 < a0 + a.weeks * 7 * DAY) {
        errs.push('rotationBlocks: ' + a.id + ' and ' + c.id + ' overlap on site ' + a.site);
      }
    }
    var counters = Array.isArray(feed.counters) ? feed.counters : (errs.push('feed: counters must be an array'), []);
    counters.forEach(function (r, k) {
      var w = 'counters[' + k + ']';
      if (!onlyKeys(r, COUNTER_KEYS, w, errs)) return;
      if (SITES.indexOf(r.site) < 0) errs.push(w + ': site must be ms3 or res');
      if (isoWeekMonday(r.week) === null) errs.push(w + ': week must be an ISO week (YYYY-Www)');
      if (typeof r.key !== 'string' || !/^(page|tool):[a-z0-9._:-]+$/.test(r.key)) errs.push(w + ': key must be an allowlisted page:/tool: key');
      if (!isInt(r.n)) errs.push(w + ': n must be a non-negative integer');
    });
    if (feed.prepost !== undefined) {
      if (!Array.isArray(feed.prepost)) errs.push('feed: prepost must be an array');
      else feed.prepost.forEach(function (p, k) {
        var w = 'prepost[' + k + ']';
        if (!onlyKeys(p, PREPOST_KEYS, w, errs)) return;
        if (!ids[p.block]) errs.push(w + ': block must name a rotation block');
        ['eligible', 'consented', 'paired', 'privacyIncidents'].forEach(function (f) {
          if (!isInt(p[f])) errs.push(w + ': ' + f + ' must be a non-negative integer');
        });
        if (typeof p.facultyHours !== 'number' || !(p.facultyHours >= 0)) errs.push(w + ': facultyHours must be >= 0');
        if (p.consented > p.eligible) errs.push(w + ': consented exceeds eligible');
        if (p.paired > p.consented) errs.push(w + ': paired exceeds consented');
      });
    }
    return errs;
  }

  // The committed rotation calendar (13_Faculty_Resources/_automation/maintenance/
  // rotation_blocks.json: opaque id + startsOn/endsOn, nothing about any person) -> dashboard
  // blocks. Only the dates are read. The calendar carries no site, so the caller names it.
  function blocksFromRotationConfig(cfg, site) {
    var errs = [], out = [];
    if (SITES.indexOf(site) < 0) errs.push('site must be ms3 or res');
    var list = cfg && Array.isArray(cfg.blocks) ? cfg.blocks : (errs.push('calendar: blocks must be an array'), []);
    list.forEach(function (b, i) {
      var s = parseDate(b && b.startsOn), e = parseDate(b && b.endsOn);
      if (s === null || e === null) { errs.push('blocks[' + i + ']: startsOn/endsOn must be YYYY-MM-DD'); return; }
      var days = (e - s) / DAY + 1;
      if (days < 7 || days % 7 !== 0) { errs.push('blocks[' + i + ']: block is not a whole number of weeks'); return; }
      out.push({ id: b.id, site: site, start: b.startsOn, weeks: days / 7 });
    });
    return { blocks: out, errors: errs };
  }

  // Attach rotation block and rotation week to each counter record. Records outside every block
  // are dropped (they are not attributable to a rotation).
  function placeCounters(feed) {
    var out = [];
    (feed.counters || []).forEach(function (r) {
      var wk = isoWeekMonday(r.week);
      (feed.rotationBlocks || []).forEach(function (b) {
        if (b.site !== r.site) return;
        var rw = Math.round((wk - mondayOf(parseDate(b.start))) / (7 * DAY)) + 1;
        if (rw >= 1 && rw <= b.weeks) out.push({ site: r.site, key: r.key, n: r.n, block: b.id, rw: rw });
      });
    });
    return out;
  }

  // ---------------------------------------------------------------- the publication table
  // Every number the aggregate can publish is a CELL; every identity that links cells (a total
  // and its parts, a pooled group and its blocks, the answered-10 <-> accuracy-band identity of
  // PR #1076) is an EQUATION  sum(lhs) = sum(rhs). protect() decides which cells to hide using
  // nothing but these two lists, so the identities ARE the threat model: a reader who knows the
  // published values and every identity must not be able to recover a count of 1..t-1.
  function cid() { return Array.prototype.join.call(arguments, '|'); }

  function buildSite(feed, site) {
    var blocks = (feed.rotationBlocks || []).filter(function (b) { return b.site === site; });
    var placed = placeCounters(feed).filter(function (r) { return r.site === site; });
    var groups = blocks.map(function (b) { return { id: b.id, blocks: [b.id], weeks: b.weeks }; });
    var maxW = blocks.reduce(function (m, b) { return Math.max(m, b.weeks); }, 0);
    groups.push({ id: 'all', blocks: blocks.map(function (b) { return b.id; }), weeks: maxW });
    var cells = {}, eqs = [], withheld = {};
    function sum(g, pred) {
      return placed.reduce(function (s, r) { return g.blocks.indexOf(r.block) >= 0 && pred(r) ? s + r.n : s; }, 0);
    }
    function poolEq(makeId, rw) { // cell(all) = sum of the same cell in each block that has it
      var parts = blocks.filter(function (b) { return !rw || b.weeks >= rw; }).map(function (b) { return makeId(b.id); });
      if (parts.length) eqs.push({ lhs: [makeId('all')], rhs: parts });
    }
    var isRead = function (r) { return /^page:.*\.md$/.test(r.key); };
    // "Other tool opens" excludes the two tools the funnel already counts, so no reach cell
    // contains a funnel cell (removes a cross-panel identity instead of protecting it).
    var isTool = function (r) { return /^page:.*\.html$/.test(r.key) && r.key !== QBANK_OPEN && r.key !== REVIEW_OPEN; };

    // Reach: reading views and other tool opens per rotation week.
    groups.forEach(function (g) {
      for (var w = 1; w <= g.weeks; w++) {
        (function (rw) {
          cells[cid(g.id, 'reads', rw)] = sum(g, function (r) { return r.rw === rw && isRead(r); });
          cells[cid(g.id, 'tools', rw)] = sum(g, function (r) { return r.rw === rw && isTool(r); });
        })(w);
      }
    });
    for (var w = 1; w <= maxW; w++) {
      (function (rw) {
        poolEq(function (g) { return cid(g, 'reads', rw); }, rw);
        poolEq(function (g) { return cid(g, 'tools', rw); }, rw);
      })(w);
    }

    // Funnels: disjoint tiers that partition opens. If the counters are inconsistent (a tier
    // would be negative) the whole funnel for the site is withheld rather than guessed at.
    Object.keys(FUNNELS).forEach(function (f) {
      var F = FUNNELS[f], vals = {};
      groups.forEach(function (g) {
        var opens = sum(g, function (r) { return r.key === F.open; });
        var s = F.steps.map(function (k) { return sum(g, function (r) { return r.key === k; }); });
        vals[g.id] = { opens: opens, tiers: [opens - s[0], s[0] - s[1], s[1] - s[2], s[2]] };
      });
      var bad = groups.some(function (g) { return vals[g.id].tiers.some(function (v) { return v < 0; }); });
      if (bad) { withheld[f] = true; return; }
      groups.forEach(function (g) {
        cells[cid(g.id, f, 'opens')] = vals[g.id].opens;
        F.tiers.forEach(function (tier, i) { cells[cid(g.id, f, tier)] = vals[g.id].tiers[i]; });
        eqs.push({ lhs: [cid(g.id, f, 'opens')], rhs: F.tiers.map(function (tier) { return cid(g.id, f, tier); }) });
      });
      ['opens'].concat(F.tiers).forEach(function (c) { poolEq(function (g) { return cid(g, f, c); }); });
    });

    // First-10 accuracy bands per rotation week, with the row total.
    groups.forEach(function (g) {
      for (var w2 = 1; w2 <= g.weeks; w2++) {
        (function (rw) {
          var tot = 0;
          BANDS.forEach(function (b) {
            var n = sum(g, function (r) { return r.rw === rw && r.key === 'tool:qbank:first10-' + b; });
            cells[cid(g.id, 'band', rw, b)] = n; tot += n;
          });
          cells[cid(g.id, 'band', rw, 'total')] = tot;
          eqs.push({ lhs: [cid(g.id, 'band', rw, 'total')], rhs: BANDS.map(function (b) { return cid(g.id, 'band', rw, b); }) });
        })(w2);
      }
      // PR #1076 records answered-10 and exactly one first10 band in the same visit, so the
      // weekly band totals sum to the funnel's 10-19 + 20+ tiers. Declared, so it is protected.
      if (!withheld.qbank) {
        var weeks = [];
        for (var w3 = 1; w3 <= g.weeks; w3++) weeks.push(cid(g.id, 'band', w3, 'total'));
        eqs.push({ lhs: weeks, rhs: [cid(g.id, 'qbank', '10to19'), cid(g.id, 'qbank', '20up')] });
      }
    });
    for (var w4 = 1; w4 <= maxW; w4++) {
      (function (rw) {
        BANDS.concat(['total']).forEach(function (b) { poolEq(function (g) { return cid(g, 'band', rw, b); }, rw); });
      })(w4);
    }

    // Weak topics (PROPOSED key family): per category, visits <50% (low) and the rest.
    var cats = {};
    placed.forEach(function (r) { var m = CAT_RE.exec(r.key); if (m) cats[m[1]] = true; });
    cats = Object.keys(cats).sort();
    groups.forEach(function (g) {
      cats.forEach(function (c) {
        var v = BANDS.map(function (b) { return sum(g, function (r) { return r.key === 'tool:qbank:cat:' + c + ':first10-' + b; }); });
        cells[cid(g.id, 'topic', c, 'low')] = v[0];
        cells[cid(g.id, 'topic', c, 'rest')] = v[1] + v[2];
        cells[cid(g.id, 'topic', c, 'total')] = v[0] + v[1] + v[2];
        eqs.push({ lhs: [cid(g.id, 'topic', c, 'total')], rhs: [cid(g.id, 'topic', c, 'low'), cid(g.id, 'topic', c, 'rest')] });
      });
    });
    cats.forEach(function (c) {
      ['low', 'rest', 'total'].forEach(function (p) { poolEq(function (g) { return cid(g, 'topic', c, p); }); });
    });

    return { blocks: blocks, groups: groups, cells: cells, eqs: eqs, cats: cats, withheld: withheld };
  }

  // ---------------------------------------------------------------- exact linear algebra
  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var r = a % b; a = b; b = r; } return a; }
  function normalise(row) {
    var g = 0;
    for (var k = 0; k < row.length; k++) if (row[k]) g = gcd(g, row[k]);
    if (g > 1) for (var k2 = 0; k2 < row.length; k2++) row[k2] /= g;
    return row;
  }
  // Gauss-Jordan over the integers (fraction-free with gcd normalisation). The last column is
  // the constant. Throws if a value leaves the safe-integer range — the caller fails CLOSED.
  function reduce(rows, ncols) {
    var r = 0, pivots = [];
    for (var c = 0; c < ncols && r < rows.length; c++) {
      var p = -1;
      for (var i = r; i < rows.length; i++) if (rows[i][c] !== 0) { p = i; break; }
      if (p < 0) continue;
      var tmp = rows[p]; rows[p] = rows[r]; rows[r] = tmp;
      for (var j = 0; j < rows.length; j++) {
        if (j === r || rows[j][c] === 0) continue;
        var a = rows[r][c], b = rows[j][c], row = rows[j];
        for (var k = 0; k < row.length; k++) {
          var v = row[k] * a - rows[r][k] * b;
          if (!Number.isSafeInteger(v)) throw new Error('exact elimination overflowed');
          row[k] = v;
        }
        normalise(row);
      }
      pivots.push({ row: r, col: c }); r++;
    }
    return pivots;
  }

  // Hidden cells that the published values + identities determine exactly, with the value a
  // reader would derive. A pivot row equal to a single unit vector is exactly such a cell.
  function determinable(cells, eqs, hidden) {
    var hid = Object.keys(cells).filter(function (id) { return hidden[id]; }).sort();
    var col = {}; hid.forEach(function (id, i) { col[id] = i; });
    var n = hid.length, rows = [];
    eqs.forEach(function (e) {
      var row = new Array(n + 1).fill(0), any = false;
      function put(id, sign) {
        if (hidden[id]) { row[col[id]] += sign; any = true; } else row[n] -= sign * cells[id];
      }
      e.lhs.forEach(function (id) { put(id, 1); });
      e.rhs.forEach(function (id) { put(id, -1); });
      if (any) rows.push(row);
    });
    var out = [];
    reduce(rows, n).forEach(function (pv) {
      var row = rows[pv.row], solo = true;
      for (var k = 0; k < n; k++) if (k !== pv.col && row[k] !== 0) { solo = false; break; }
      if (solo) out.push({ id: hid[pv.col], value: row[n] / row[pv.col] });
    });
    return out;
  }

  // Small-cell protection. Primary: every cell below t (zero included) is hidden. Then, to a
  // fixpoint, hide the smallest shown cell of any identity that would otherwise let a reader:
  //   (1) recover a single hidden cell by subtraction (exactly one unknown in the identity);
  //   (2) recover the SUM of an identity's hidden cells (all unknowns on one side) as 1..t-1 —
  //       this is the nested-tier / "all but k" leak;
  //   (3) recover any hidden cell by combining identities (exact Gauss-Jordan audit).
  // A derived value of exactly 0 is allowed (it discloses absence, not a person).
  function protect(cells, eqs, t) {
    var hidden = {};
    Object.keys(cells).forEach(function (id) { hidden[id] = cells[id] < t; });
    var byCell = {};
    eqs.forEach(function (e, i) {
      e.lhs.concat(e.rhs).forEach(function (id) { (byCell[id] = byCell[id] || []).push(i); });
    });
    function shownSum(list) { return list.reduce(function (s, id) { return hidden[id] ? s : s + cells[id]; }, 0); }
    function hideSmallest(list) {
      var best = null;
      list.forEach(function (id) {
        if (hidden[id]) return;
        if (best === null || cells[id] < cells[best] || (cells[id] === cells[best] && id < best)) best = id;
      });
      if (best !== null) hidden[best] = true;
      return best !== null;
    }
    function ruleStep() {
      for (var i = 0; i < eqs.length; i++) {
        var e = eqs[i];
        var hl = e.lhs.filter(function (id) { return hidden[id]; });
        var hr = e.rhs.filter(function (id) { return hidden[id]; });
        var nh = hl.length + hr.length;
        if (nh === 0) continue;
        var leak = false;
        if (hl.length === 0 || hr.length === 0) {
          var derived = hl.length ? shownSum(e.rhs) - shownSum(e.lhs) : shownSum(e.lhs) - shownSum(e.rhs);
          leak = nh === 1 ? derived !== 0 : derived >= 1 && derived < t;
        }
        if (leak && hideSmallest(e.lhs.concat(e.rhs))) return true;
      }
      return false;
    }
    var guard = Object.keys(cells).length + 2;
    while (guard-- > 0) {
      if (ruleStep()) continue;
      var found = determinable(cells, eqs, hidden).filter(function (d) { return d.value !== 0; });
      if (!found.length) return { hidden: hidden };
      var members = [];
      (byCell[found[0].id] || []).forEach(function (i) { members = members.concat(eqs[i].lhs, eqs[i].rhs); });
      if (!hideSmallest(members)) break;
    }
    throw new Error('protection did not converge');
  }

  // A share of two PUBLISHED counts. Shown only when both counts are shown, so it carries no
  // information beyond them.
  function share(num, den) {
    if (!num.shown || !den.shown || den.n === 0) return { shown: false };
    var v = num.n / den.n;
    return { shown: true, value: v, text: Math.round(v * 100) + '%' };
  }

  // Feasibility rates (pre/post, pooled per site; counts are never published). Suppressed on a
  // small numerator or denominator; a small complement gives only a lower bound.
  function rate(num, den, t) {
    if (den < t || num < t) return { state: 'suppressed', text: 'suppressed (n<' + t + ')' };
    if (den - num < t) {
      var lower = (den - t + 1) / den;
      return { state: 'bounded', lower: lower, text: '≥' + Math.floor(lower * 100) + '%' };
    }
    return { state: 'ok', value: num / den, text: Math.round((num / den) * 100) + '%' };
  }
  function meetsBar(r, bar) {
    if (r.state === 'ok') return r.value >= bar;
    if (r.state === 'bounded') return r.lower >= bar ? true : null;
    return null;
  }

  function feasibility(feed, site, t) {
    var ids = (feed.rotationBlocks || []).filter(function (b) { return b.site === site; }).map(function (b) { return b.id; });
    var pp = (feed.prepost || []).filter(function (p) { return ids.indexOf(p.block) >= 0; });
    var tot = pp.reduce(function (s, p) {
      s.eligible += p.eligible; s.consented += p.consented; s.paired += p.paired;
      s.hours += p.facultyHours; s.incidents += p.privacyIncidents; return s;
    }, { eligible: 0, consented: 0, paired: 0, hours: 0, incidents: 0 });
    return { blocks: pp.length,
      consent: { bar: 0.70, rate: rate(tot.consented, tot.eligible, t) },
      paired: { bar: 0.80, rate: rate(tot.paired, tot.consented, t) },
      facultyHoursPerBlock: pp.length ? tot.hours / pp.length : null, facultyHoursBar: 2,
      privacyIncidents: tot.incidents };
  }

  // The read-only aggregate: grouped, suppressed totals and nothing else. Throws on an invalid
  // feed (callers render/return nothing). If exact protection cannot be computed for a site,
  // every cell of that site is hidden (fail closed).
  function publish(feed) {
    var errs = validateFeed(feed);
    if (errs.length) { var err = new Error('feed rejected'); err.errors = errs; throw err; }
    var t = threshold(feed);
    var out = { aggregateVersion: AGGREGATE_VERSION, contractVersion: 1, _synthetic: feed._synthetic,
      suppressionThreshold: t, sites: {} };
    if (feed.generatedOn !== undefined && parseDate(feed.generatedOn) !== null) out.generatedOn = feed.generatedOn;
    SITES.forEach(function (site) {
      var B = buildSite(feed, site);
      if (!B.blocks.length) return;
      var hidden, failClosed = false;
      try { hidden = protect(B.cells, B.eqs, t).hidden; }
      catch (e) { failClosed = true; hidden = {}; Object.keys(B.cells).forEach(function (id) { hidden[id] = true; }); }
      function C(id) { return hidden[id] || !(id in B.cells) ? { shown: false } : { shown: true, n: B.cells[id] }; }
      var groups = {};
      B.groups.forEach(function (g) {
        var reach = [];
        for (var w = 1; w <= g.weeks; w++) reach.push({ rw: w, reads: C(cid(g.id, 'reads', w)), tools: C(cid(g.id, 'tools', w)) });
        // Derived only from shown block-level cells, so it adds nothing a reader could not compute.
        var active = 0, blockWeeks = 0;
        g.blocks.forEach(function (bid) {
          var b = B.blocks.filter(function (x) { return x.id === bid; })[0];
          for (var w2 = 1; w2 <= b.weeks; w2++) {
            blockWeeks++;
            var r = C(cid(bid, 'reads', w2)), tl = C(cid(bid, 'tools', w2));
            if ((r.shown ? r.n : 0) + (tl.shown ? tl.n : 0) >= t) active++;
          }
        });
        // Final (pre-shelf) week share of reading views: only if every component is shown.
        var num = g.blocks.map(function (bid) {
          var b = B.blocks.filter(function (x) { return x.id === bid; })[0];
          return C(cid(bid, 'reads', b.weeks));
        });
        var den = reach.map(function (x) { return x.reads; });
        var finalShare = num.concat(den).every(function (c) { return c.shown; })
          ? share({ shown: true, n: num.reduce(function (s, c) { return s + c.n; }, 0) },
            { shown: true, n: den.reduce(function (s, c) { return s + c.n; }, 0) })
          : { shown: false };
        var funnel = {};
        Object.keys(FUNNELS).forEach(function (f) {
          var F = FUNNELS[f];
          if (B.withheld[f]) { funnel[f] = { withheld: true }; return; }
          var opens = C(cid(g.id, f, 'opens'));
          funnel[f] = { withheld: false, opens: opens, tiers: F.tiers.map(function (tier, i) {
            var c = C(cid(g.id, f, tier));
            return { tier: tier, label: F.labels[i], count: c, share: share(c, opens) };
          }) };
        });
        var bands = [];
        for (var w3 = 1; w3 <= g.weeks; w3++) {
          bands.push({ rw: w3, cells: BANDS.map(function (b) { return C(cid(g.id, 'band', w3, b)); }),
            total: C(cid(g.id, 'band', w3, 'total')) });
        }
        var topics = B.cats.map(function (c) {
          var low = C(cid(g.id, 'topic', c, 'low')), total = C(cid(g.id, 'topic', c, 'total'));
          return { category: c, total: total, low: low, rest: C(cid(g.id, 'topic', c, 'rest')), lowShare: share(low, total) };
        });
        topics.sort(function (a, b) {
          var av = a.lowShare.shown ? a.lowShare.value : -1, bv = b.lowShare.shown ? b.lowShare.value : -1;
          return bv - av || (a.category < b.category ? -1 : 1);
        });
        groups[g.id] = { weeks: g.weeks, reach: reach, activeWeeks: active, blockWeeks: blockWeeks,
          finalWeekReadShare: finalShare, funnel: funnel, bands: bands, topics: topics };
      });
      out.sites[site] = {
        blocks: B.blocks.map(function (b) { return { id: b.id, start: b.start, weeks: b.weeks }; }),
        protection: failClosed ? 'fail-closed' : 'exact',
        groups: groups,
        feasibility: feasibility(feed, site, t)
      };
    });
    return out;
  }

  root.CohortAggregate = {
    MIN_THRESHOLD: MIN_THRESHOLD, AGGREGATE_VERSION: AGGREGATE_VERSION, SITES: SITES,
    FUNNELS: FUNNELS, BANDS: BANDS, BAND_LABELS: BAND_LABELS,
    validateFeed: validateFeed, threshold: threshold, isoWeekMonday: isoWeekMonday,
    placeCounters: placeCounters, blocksFromRotationConfig: blocksFromRotationConfig,
    buildSite: buildSite, protect: protect, determinable: determinable, share: share,
    rate: rate, meetsBar: meetsBar, publish: publish
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
