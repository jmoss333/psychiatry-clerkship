(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else api.start(root);
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var slugs = ['jordan', 'eli', 'leah', 'marisol'];
  var accents = {jordan:'clay', eli:'teal', leah:'plum', marisol:'olive'};
  var allowedAccents = ['clay', 'teal', 'plum', 'olive'];

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

  function accentFor(data, slug) {
    var suggested = data && data.suggestedAccent;
    return allowedAccents.indexOf(suggested) >= 0 ? suggested : accents[slug] || 'clay';
  }

  function catalogMarkup(cases, selectedSlug) {
    return '<nav aria-label="Choose a case journey"><ul class="opf-case-catalog">' + cases.map(function (item, i) {
      var slug = slugs[i], current = slug === selectedSlug, accent = accentFor(item, slug);
      return '<li><a class="opf-case-card opf-case-card--' + accent + '" href="?case=' + slug + '"' + (current ? ' aria-current="page"' : '') + '>' +
        '<span class="opf-case-card__name">' + escape(item.patient.displayName) + '</span>' +
        '<span class="opf-case-card__title">' + escape(item.title) + '</span>' +
        '<span class="opf-case-card__count">6 chapters</span>' +
        (current ? '<span class="opf-case-card__selected">Selected</span>' : '') + '</a></li>';
    }).join('') + '</ul></nav>';
  }

  function routeMarkup(data, selected) {
    return '<ol class="opf-route" role="tablist" aria-label="' + escape(data.patient.displayName) + ' chapters">' + data.weeks.map(function (w, i) {
      var number = i + 1, active = number === selected;
      return '<li class="opf-route__item"><button type="button" id="chapter-tab-' + number + '" class="opf-route__tab" role="tab" aria-controls="chapter-panel" aria-selected="' + (active ? 'true' : 'false') + '" tabindex="' + (active ? '0' : '-1') + '" data-chapter="' + number + '">' +
        '<span class="opf-route__node" aria-hidden="true">' + number + '</span><span class="opf-route__copy"><span class="opf-route__week">' + escape(w.label) + '</span><span class="opf-route__title">' + escape(w.title) + '</span></span></button></li>';
    }).join('') + '</ol>';
  }

  function resourceHref(link) {
    return '../index.html?' + link.kind + '=' + encodeURIComponent(link.target);
  }

  function chapterMarkup(data, w) {
    var number = data.weeks.indexOf(w) + 1;
    var pilot = data.id === 'case_journey_eli_psychosis_draft_001' && number >= 1 && number <= 4;
    var language = w.checklist.map(function (item) {
      return '<div class="opf-language"><p class="opf-note__prompt">' + escape(item.prompt) + '</p>' +
        (pilot ? '<details class="opf-model"><summary>Model example · compare after your attempt</summary>' : '') +
        '<blockquote>' + escape(item.example) + '</blockquote>' + (pilot ? '</details>' : '') + '</div>';
    }).join('');
    function pilotResources(kind) {
      var links = w.links.filter(function (link) { return link.kind === kind; });
      if (!links.length) return '';
      return '<nav class="opf-chapter-resources" aria-label="' + (kind === 'page' ? 'Read resources' : 'Separate practice tools') + '"><p>Opens in a new tab; this case chapter stays here.</p><ul>' + links.map(function (link) {
        return '<li><a target="_blank" rel="noopener noreferrer" href="' + '../?' + link.kind + '=' + encodeURIComponent(link.target) + '">' + escape(link.label) + '</a></li>';
      }).join('') + '</ul></nav>';
    }
    var resources = w.links.map(function (link) {
      return '<li><a target="_parent" href="' + resourceHref(link) + '">' + escape(link.label) + '</a></li>';
    }).join('');
    return '<div class="opf-sheet__topline"><p class="opf-sheet__chapter">Case chapter ' + number + ' of 6</p><span class="opf-sheet__stamp">Fictional composite</span></div>' +
      '<h2 id="case-panel-title">' + escape(w.title) + '</h2>' +
      '<ul class="opf-focus" aria-label="Chapter focus">' + w.focus.map(function (f) { return '<li>' + escape(f) + '</li>'; }).join('') + '</ul>' +
      '<div class="opf-grid"><section class="opf-note opf-note--story"><p class="opf-note__label">' + (pilot ? 'Read · ' : '') + 'What changed in ' + escape(data.patient.displayName) + '’s story</p><p>' + escape(w.patientState) + '</p>' + (pilot ? pilotResources('page') : '') + '</section>' +
      '<section class="opf-note opf-note--task"><p class="opf-note__label">' + (pilot ? 'Practice · learner’s supervised task' : 'Learner’s supervised task') + '</p><p>' + escape(w.learnerTask) + '</p>' + (pilot ? pilotResources('tool') : '') + '</section>' +
      '<section class="opf-note opf-note--language"><p class="opf-note__label">One way to say it</p>' + language + '</section>' +
      '<section class="opf-note opf-note--rounds"><p class="opf-note__label">' + (pilot ? 'Discuss · carry it to rounds' : 'Carry it to rounds') + '</p><p>' + escape(w.handoff) + '</p>' + (pilot ? '<p>' + escape(w.reflectionPrompt) + '</p>' : '') + '</section></div>' +
      (pilot ? '' : '<details class="opf-reflection"><summary>Reflect and explore</summary><p>' + escape(w.reflectionPrompt) + '</p><nav aria-label="Resources for this chapter"><ul>' + resources + '</ul></nav></details>');
  }

  function pageMarkup(cases, selected) {
    var index = slugs.indexOf(selected.slug), data = cases[index], w = data.weeks[selected.chapter - 1];
    var timeFrame = data.timeFrame || '6 ordered chapters';
    var audience = data.audience || 'Shared MS3 and resident practice with the learner’s supervising team.';
    return '<header class="opf-hero"><div class="opf-shell opf-hero__grid"><div><p class="opf-eyebrow">Case Journeys · supervised practice</p><h1>' + escape(data.title) + '</h1><p class="opf-dek">' + escape(data.patient.description) + '</p></div>' +
      '<aside class="opf-boundary" aria-label="Selected case frame"><span class="opf-boundary__mark" aria-hidden="true">01—06</span><p>' + escape(data.patient.frame) + '</p></aside></div></header>' +
      '<main><section class="opf-shell opf-library" aria-labelledby="case-library-heading"><div class="opf-library__heading"><div><p class="opf-eyebrow">Four fictional journeys · 24 chapters</p><h2 id="case-library-heading">Case Journey Library</h2></div><p>Choose a case. The case link is shareable; chapter selection stays on this page and is never saved.</p></div>' +
      catalogMarkup(cases, selected.slug) + (selected.invalid ? '<p class="opf-selection-note" role="status">That case link is unavailable. Jordan is shown instead.</p>' : '') + '</section>' +
      '<section class="opf-shell opf-case-context" aria-label="Selected case context"><div class="opf-case-context__frame"><p class="opf-context-label">Case setting</p><p>' + escape(data.setting) + '</p></div>' +
      '<dl class="opf-case-facts"><div><dt>Clinical time</dt><dd>' + escape(timeFrame) + '</dd></div><div><dt>Learner audience</dt><dd>' + escape(audience) + '</dd></div></dl>' +
      '<aside class="opf-source-boundary"><p class="opf-context-label">Simulation boundary</p><p>' + escape(data.disclaimer) + '</p><p class="opf-source-boundary__note">Navigation is unscored and is not saved.</p>' + (selected.slug === 'eli' ? '<p class="opf-source-boundary__note">Chapters 1–4: Read → Practice → Discuss. Chapters 5–6: optional follow-through.</p>' : '') + '</aside></section>' +
      '<section class="opf-shell opf-workbench" aria-label="' + escape(data.patient.displayName) + '’s interactive case folio"><div class="opf-spine"><div class="opf-spine__heading"><span>' + escape(data.patient.displayName) + '’s case file</span><strong id="counter" aria-live="polite">' + String(selected.chapter).padStart(2, '0') + ' / 06</strong></div><div id="case-route">' + routeMarkup(data, selected.chapter) + '</div></div>' +
      '<div class="opf-folio"><div class="opf-folio__back" aria-hidden="true"></div><article class="opf-sheet" id="chapter-panel" role="tabpanel" tabindex="-1" aria-labelledby="chapter-tab-' + selected.chapter + '">' + chapterMarkup(data, w) + '</article>' +
      '<div class="opf-controls" aria-label="Case chapter controls"><button type="button" id="previous"' + (selected.chapter === 1 ? ' disabled' : '') + '>Previous chapter</button><p>Selection is not saved.</p><button type="button" id="next"' + (selected.chapter === 6 ? ' disabled' : '') + '>Next chapter</button></div></div></section></main>' +
      '<footer class="opf-shell opf-footer"><span>Fictional educational case</span><span>No patient entry · no saved case progress</span></footer>';
  }

  async function start(browser) {
    var doc = browser.document, app = doc.getElementById('app');
    async function json(response) { if (!response.ok) throw new Error('Case data unavailable.'); return response.json(); }
    try {
      var cases = await Promise.all([
        fetch('../longitudinal_case.json').then(json),
        fetch('eli-psychosis.json').then(json),
        fetch('leah-depression-trauma.json').then(json),
        fetch('marisol-delirium-capacity.json').then(json)
      ]);
      cases.forEach(validate);
      var selected = selection(browser.location.search), index = slugs.indexOf(selected.slug), data = cases[index];
      doc.documentElement.setAttribute('data-case-accent', accentFor(data, selected.slug));
      doc.title = data.patient.displayName + ' — Case Journeys';
      app.innerHTML = pageMarkup(cases, selected);
      var panel = doc.getElementById('chapter-panel'), route = doc.getElementById('case-route');
      var previous = doc.getElementById('previous'), next = doc.getElementById('next');

      function render(focus) {
        route.innerHTML = routeMarkup(data, selected.chapter);
        panel.innerHTML = chapterMarkup(data, data.weeks[selected.chapter - 1]);
        panel.setAttribute('aria-labelledby', 'chapter-tab-' + selected.chapter);
        previous.disabled = selected.chapter === 1;
        next.disabled = selected.chapter === 6;
        doc.getElementById('counter').textContent = String(selected.chapter).padStart(2, '0') + ' / 06';
        var tabs = route.querySelectorAll('[role="tab"]');
        tabs.forEach(function (tab) {
          tab.addEventListener('click', function () { selected.chapter = Number(tab.dataset.chapter); render('tab'); });
          tab.addEventListener('keydown', function (event) {
            if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)) return;
            event.preventDefault(); selected.chapter = moveChapter(selected.chapter, event.key); render('tab');
          });
        });
        if (focus === 'tab') route.querySelector('[data-chapter="' + selected.chapter + '"]').focus();
        if (focus === 'panel') panel.focus();
      }

      previous.addEventListener('click', function () { if (selected.chapter > 1) { selected.chapter--; render('panel'); } });
      next.addEventListener('click', function () { if (selected.chapter < 6) { selected.chapter++; render('panel'); } });
      render();
    } catch (problem) {
      app.innerHTML = '<main class="opf-shell"><p class="opf-error" role="alert">The case journeys could not load. Please reload this page or return to the library and try again.</p></main>';
    } finally {
      app.setAttribute('aria-busy', 'false');
    }
  }

  return {escape:escape, validate:validate, selection:selection, moveChapter:moveChapter, accentFor:accentFor, catalogMarkup:catalogMarkup, routeMarkup:routeMarkup, chapterMarkup:chapterMarkup, pageMarkup:pageMarkup, start:start};
}));
