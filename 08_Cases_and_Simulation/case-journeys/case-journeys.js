(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else api.start(root);
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var slugs = ['jordan', 'eli', 'leah', 'marisol'];
  function escape(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return {'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c];
    });
  }
  function text(value) { return typeof value === 'string' && value.trim().length > 0; }
  function validate(data) {
    if (!data || !data.patient || !text(data.patient.displayName) || !text(data.title) || !Array.isArray(data.weeks) || data.weeks.length !== 6) throw new Error('A complete six-chapter case is required.');
    if ('learnerRelease' in data && data.learnerRelease !== true) throw new Error('Case is not released to learners.');
    var ids = new Set();
    data.weeks.forEach(function (w) {
      if (!w || !text(w.id) || ids.has(w.id)) throw new Error('Missing or duplicate chapter.');
      ids.add(w.id);
      ['label','title','patientState','learnerTask','handoff','reflectionPrompt'].forEach(function (key) {
        if (!text(w[key])) throw new Error('Missing chapter text.');
      });
      if (!Array.isArray(w.focus) || !w.focus.every(text) || !Array.isArray(w.checklist) || !w.checklist.length || !w.checklist.every(function (item) { return text(item.prompt) && text(item.example); })) throw new Error('Missing model language.');
      if (!Array.isArray(w.links) || !w.links.every(function (link) {
        return text(link.label) && /^(page|tool)$/.test(link.kind) && /^[a-z0-9_-]+\.(md|html)$/.test(link.target);
      })) throw new Error('Invalid resource link.');
    });
    return true;
  }
  function selection(search) {
    var params = new URLSearchParams(search), requested = params.get('case') || 'jordan';
    var invalid = slugs.indexOf(requested) < 0;
    var chapter = Number(params.get('chapter') || params.get('week') || '1');
    if (invalid || !Number.isInteger(chapter) || chapter < 1 || chapter > 6) chapter = 1;
    return {slug:invalid ? 'jordan' : requested, chapter:chapter, invalid:invalid};
  }
  function moveChapter(current, key) {
    if (key === 'Home') return 1;
    if (key === 'End') return 6;
    if (key === 'ArrowLeft' || key === 'ArrowUp') return current === 1 ? 6 : current - 1;
    if (key === 'ArrowRight' || key === 'ArrowDown') return current === 6 ? 1 : current + 1;
    return current;
  }
  function chapterMarkup(data, w) {
    return '<p class="eyebrow">' + escape(w.label) + '</p><h3>' + escape(w.title) + '</h3>' +
      '<ul class="focus">' + w.focus.map(function (f) { return '<li>' + escape(f) + '</li>'; }).join('') + '</ul>' +
      '<div class="chapter-grid"><section class="note story"><h4>What changed in ' + escape(data.patient.displayName) + '’s story</h4><p>' + escape(w.patientState) + '</p></section>' +
      '<section class="note"><h4>Learner’s supervised task</h4><p>' + escape(w.learnerTask) + '</p></section>' +
      '<section class="note language"><h4>One way to say it</h4>' + w.checklist.map(function (item) { return '<p class="model-prompt">' + escape(item.prompt) + '</p><blockquote>' + escape(item.example) + '</blockquote>'; }).join('') + '</section>' +
      '<section class="note"><h4>Carry it to rounds</h4><p>' + escape(w.handoff) + '</p></section></div>' +
      '<details class="reflection"><summary>Reflect and explore</summary><p>' + escape(w.reflectionPrompt) + '</p><ul>' + w.links.map(function (link) {
        return '<li><a target="_parent" href="../index.html?' + link.kind + '=' + encodeURIComponent(link.target) + '">' + escape(link.label) + '</a></li>';
      }).join('') + '</ul></details>';
  }
  async function start(browser) {
    var doc = browser.document, app = doc.getElementById('app');
    async function json(response) { if (!response.ok) throw new Error('Case data unavailable.'); return response.json(); }
    try {
      // Literal asset routes are also discovered by the teaching attestation graph.
      var cases = await Promise.all([
        fetch('../longitudinal_case.json').then(json),
        fetch('eli-psychosis.json').then(json),
        fetch('leah-depression-trauma.json').then(json),
        fetch('marisol-delirium-capacity.json').then(json)
      ]);
      cases.forEach(validate);
      var selected = selection(browser.location.search), index = slugs.indexOf(selected.slug), data = cases[index];
      doc.documentElement.setAttribute('data-case-accent', selected.slug);
      doc.title = data.patient.displayName + ' — Case Journeys';
      app.innerHTML = '<nav aria-label="Choose a case"><ul class="catalog">' + cases.map(function (item, i) {
        return '<li><a href="?case=' + slugs[i] + '"' + (i === index ? ' aria-current="page"' : '') + '><strong>' + escape(item.patient.displayName) + '</strong><span>' + escape(item.title) + '</span><small>6 chapters</small></a></li>';
      }).join('') + '</ul></nav>' + (selected.invalid ? '<p role="status">That case link is unavailable. Jordan is shown instead.</p>' : '') +
      '<header class="case-header"><p class="eyebrow">Fictional case · Six chapters</p><h2>' + escape(data.title) + '</h2><p>' + escape(data.patient.description) + '</p><p>' + escape(data.patient.frame) + '</p><p class="timeframe">' + escape(data.timeFrame || data.setting) + '</p><p class="case-boundary">' + escape(data.disclaimer) + '</p></header>' +
      '<div class="journey"><div class="route" role="tablist" aria-label="' + escape(data.patient.displayName) + ' chapters">' + data.weeks.map(function (w,i) {
        return '<button type="button" role="tab" id="chapter-tab-' + (i+1) + '" aria-controls="chapter-panel" data-chapter="' + (i+1) + '"><span class="number" aria-hidden="true">' + (i+1) + '</span><span><small>' + escape(w.label) + '</small>' + escape(w.title) + '</span></button>';
      }).join('') + '</div><div><article id="chapter-panel" role="tabpanel" tabindex="0"></article><div class="chapter-nav"><button type="button" id="previous">Previous chapter</button><span id="counter" aria-live="polite"></span><button type="button" id="next">Next chapter</button></div></div></div>';
      var panel = doc.getElementById('chapter-panel'), tabs = app.querySelectorAll('[role="tab"]');
      var previous = doc.getElementById('previous'), next = doc.getElementById('next');
      function render(focus) {
        tabs.forEach(function (tab,i) { tab.setAttribute('aria-selected', String(i+1 === selected.chapter)); tab.tabIndex = i+1 === selected.chapter ? 0 : -1; });
        panel.innerHTML = chapterMarkup(data, data.weeks[selected.chapter-1]);
        panel.setAttribute('aria-labelledby', 'chapter-tab-' + selected.chapter);
        previous.disabled = selected.chapter === 1; next.disabled = selected.chapter === 6;
        doc.getElementById('counter').textContent = 'Chapter ' + selected.chapter + ' of 6';
        if (focus === 'tab') tabs[selected.chapter-1].focus();
        if (focus === 'panel') panel.focus();
      }
      tabs.forEach(function (tab) {
        tab.addEventListener('click', function () { selected.chapter = Number(tab.dataset.chapter); render('tab'); });
        tab.addEventListener('keydown', function (event) {
          if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)) return;
          event.preventDefault(); selected.chapter = moveChapter(selected.chapter,event.key); render('tab');
        });
      });
      previous.addEventListener('click', function () { if (selected.chapter > 1) { selected.chapter--; render('panel'); } });
      next.addEventListener('click', function () { if (selected.chapter < 6) { selected.chapter++; render('panel'); } });
      render();
    } catch (problem) {
      app.innerHTML = '<p role="alert">The case journeys could not load. Please reload this page or return to the library and try again.</p>';
    } finally {
      app.setAttribute('aria-busy', 'false');
    }
  }
  return {escape:escape, validate:validate, selection:selection, moveChapter:moveChapter, chapterMarkup:chapterMarkup, start:start};
}));
