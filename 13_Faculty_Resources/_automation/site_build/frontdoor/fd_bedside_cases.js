/* The clinical text lives with its reading. Each mounted exercise keeps its choices in the DOM. */
function fdMountBedsideCases(body) {
  fdMountMorganExposure(body);
  fdMountFeverExams(body);
  fdMountJoCall(body);
  fdMountLeeTimeline(body);
  fdMountNightSignout(body);
  fdMountFamilyPause(body);
  fdMountCoachLine(body);
  fdMountEctMemory(body);
  fdMountRaeReturnVisit(body);
  fdMountTreatmentRationale(body);
  fdMountFollowupStudy(body);
  fdMountDayroomChoices(body);
  fdMountCatatoniaFrames(body);
  fdMountPerinatalComparison(body);
  fdMountEvidenceRails(body);
  fdMountReplyThread(body);
}

/* Each reading owns its timeline, patient dialogue and ordered debrief rules. */
function fdMountEvidenceRails(body) {
  for (const rail of body.querySelectorAll('.evidence-rail')) {
    if (rail.dataset.mounted) continue;
    rail.dataset.mounted = 'true';
    const find = selector => rail.querySelector(selector);
    const bank = find('[data-et-bank]').content;
    const versions = [...rail.querySelectorAll('[data-et-version]')];
    const sources = [...rail.querySelectorAll('[data-et-source]')];
    const lead = find('[data-et-lead]'), check = find('[data-et-check]');
    const answer = find('[data-et-answer]'), debrief = find('[data-et-debrief]');
    const commit = find('[data-et-commit]'), status = find('[data-et-status]');
    const instruction = status.textContent, read = new Set();
    let version;

    function story(source) {
      return bank.querySelector('[data-et-story="' + version + '-' + source + '"]') ||
        bank.querySelector('[data-et-story="both-' + source + '"]');
    }
    function explanation(group) {
      // More specific rules precede the unconditional fallback in the authored reading.
      const rules = bank.querySelectorAll('[data-et-group="' + group + '"]');
      for (const rule of rules) {
        const conditions = (rule.dataset.when || '').split(' ').filter(Boolean);
        if (conditions.every(key => key === version || read.has(key))) return rule.textContent;
      }
      return '';
    }
    function updateAssessment() {
      debrief.hidden = true;
      debrief.replaceChildren();
      commit.disabled = !(read.size && lead.value && check.value);
      status.textContent = commit.disabled ? instruction : '';
    }
    function switchVersion(key) {
      version = key;
      read.clear();
      for (const button of versions) button.setAttribute('aria-pressed', String(button.dataset.etVersion === key));
      for (const button of sources) {
        button.setAttribute('aria-pressed', 'false');
        button.querySelector('[data-et-state]').textContent = 'Unopened';
        delete button.dataset.reviewed;
      }
      answer.hidden = true;
      answer.replaceChildren();
      lead.value = check.value = '';
      updateAssessment();
    }
    for (const button of versions) {
      button.addEventListener('click', () => {
        if (version !== button.dataset.etVersion) switchVersion(button.dataset.etVersion);
      });
    }
    for (const button of sources) {
      button.addEventListener('click', () => {
        const key = button.dataset.etSource;
        for (const source of sources) source.setAttribute('aria-pressed', String(source === button));
        button.dataset.reviewed = 'true';
        button.querySelector('[data-et-state]').textContent = 'Reviewed';
        const entry = story(key).cloneNode(true);
        entry.querySelector('[data-et-note]').remove();
        answer.replaceChildren(entry);
        answer.hidden = false;
        if (!read.has(key)) {
          read.add(key);
          updateAssessment();
        }
      });
    }
    lead.addEventListener('change', updateAssessment);
    check.addEventListener('change', updateAssessment);
    commit.addEventListener('click', () => {
      if (commit.disabled) return;
      const result = find('[data-et-result]').content.cloneNode(true);
      result.querySelector('[data-et-feedback]').textContent = explanation('lead-' + lead.value);
      result.querySelector('[data-et-next]').textContent = explanation('check-' + check.value);
      const report = [explanation('opening')];
      for (const button of sources) {
        const key = button.dataset.etSource;
        if (read.has(key)) report.push(story(key).querySelector('[data-et-note]').textContent);
      }
      report.push(explanation('handoff'), explanation('extra'));
      result.querySelector('[data-et-sample]').textContent = '“' + report.filter(Boolean).join(' ') + '”';
      debrief.replaceChildren(result);
      debrief.hidden = false;
      status.textContent = '';
      fdBedsideFocus(debrief.querySelector('[data-et-title]'));
    });
    find('[data-et-reset]').addEventListener('click', () => {
      switchVersion(versions[0].dataset.etVersion);
      fdBedsideFocus(sources[0]);
    });
    switchVersion(versions[0].dataset.etVersion);
  }
}

/* The reading supplies the patient replies, feedback and worked rounds sentences. */
function fdMountReplyThread(body) {
  const card = body.querySelector('#reply-thread-case');
  if (!card || card.dataset.mounted) return;
  card.dataset.mounted = 'true';
  const get = selector => card.querySelector(selector);
  const caseButtons = Array.from(card.querySelectorAll('[data-rt-case]'));
  const panels = Array.from(card.querySelectorAll('[data-rt-panel]'));
  const map = get('[data-rt-map]');
  const next = get('[data-rt-next]');
  const ask = get('[data-rt-ask]');
  const open = get('[data-rt-open]');
  const rounds = get('[data-rt-rounds]');
  const feedback = get('[data-rt-feedback]');
  let panel, phrases, selected;

  function drawMap() {
    const visible = phrases.filter(button => !button.closest('li').hidden);
    const count = visible.length + 1;
    const labels = map.querySelector('ol');
    const svg = map.querySelector('svg');
    const svgNode = (tag, attributes) => {
      const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
      for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
      return element;
    };
    const points = Array.from({length: count}, (_, i) => {
      const phrase = visible[i - 1];
      const returned = selected && selected === phrase && phrase.dataset.rtPhrase;
      return {x: (i + 0.5) * 400 / count, y: i === 0 || returned ? 26 : (i % 2 ? 36 : 46)};
    });
    labels.style.gridTemplateColumns = 'repeat(' + count + ', minmax(0, 1fr))';
    labels.replaceChildren();
    svg.replaceChildren();
    svg.append(svgNode('line', {class: 'rt-baseline', x1: points[0].x, y1: 26, x2: points[count - 1].x, y2: 26}));
    svg.append(svgNode('polyline', {class: 'rt-line', points: points.map(p => p.x + ',' + p.y).join(' ')}));
    points.forEach((point, i) => {
      const phrase = visible[i - 1];
      const active = Boolean(phrase && selected === phrase);
      const label = document.createElement('li');
      label.textContent = phrase ? phrase.querySelector('[data-rt-topic]').textContent : 'Question';
      label.classList.toggle('rt-current', active);
      labels.append(label);
      svg.append(svgNode('circle', {class: active || !i ? 'rt-dot rt-filled' : 'rt-dot', cx: point.x, cy: point.y, r: 4.5}));
      if (active && phrase.dataset.rtPhrase) {
        const origin = points[0].x;
        const end = point.x;
        svg.append(svgNode('path', {class: 'rt-return', d: 'M ' + end + ' 17 V 13 Q ' + end + ' 6 ' + (end - 8) + ' 6 H ' + (origin + 8) + ' Q ' + origin + ' 6 ' + origin + ' 13 V 17 m -4 -4 4 4 4 -4'}));
      }
    });
  }

  function clearChoice() {
    selected = null;
    for (const phrase of phrases) phrase.setAttribute('aria-pressed', 'false');
    feedback.textContent = '';
    rounds.hidden = true;
    rounds.querySelector('details').open = false;
    get('[data-rt-sample]').replaceChildren();
  }

  function updateControls() {
    const visible = phrases.filter(p => !p.closest('li').hidden);
    const redirected = visible.some(p => p.closest('[data-rt-redirect]'));
    next.hidden = redirected || phrases.slice(0, -1).every(p => !p.closest('li').hidden);
    ask.hidden = redirected || visible.some(p => p.dataset.rtPhrase);
    drawMap();
  }

  function restart(button) {
    for (const choice of caseButtons) choice.setAttribute('aria-pressed', String(choice === button));
    panel = panels.find(p => p.dataset.rtPanel === button.dataset.rtCase);
    for (const item of panels) item.hidden = item !== panel;
    phrases = Array.from(panel.querySelectorAll('[data-rt-phrase]'));
    phrases.forEach((phrase, i) => { phrase.closest('li').hidden = i > 0; });
    panel.querySelector('[data-rt-map-place]').append(map);
    map.hidden = false;
    const privacy = panel.dataset.rtPanel === 'eden';
    ask.firstElementChild.hidden = privacy;
    ask.lastElementChild.hidden = !privacy;
    clearChoice();
    updateControls();
  }

  function reveal(phrase) {
    clearChoice();
    phrase.closest('li').hidden = false;
    updateControls();
    phrase.focus();
  }

  function showChoice(phrase) {
    clearChoice();
    selected = phrase;
    const visible = phrases.filter(p => !p.closest('li').hidden);
    const privacy = panel.dataset.rtPanel === 'eden';
    let result;
    if (phrase) {
      phrase.setAttribute('aria-pressed', 'true');
      result = phrase.dataset.rtPhrase || (privacy ? 'concern' : 'detail');
    } else if (visible.some(p => p.dataset.rtPhrase)) {
      result = 'look';
    } else if (!next.hidden) {
      result = 'early';
    } else {
      result = privacy ? 'privacy' : 'open';
    }
    const content = get('template[data-rt-result="' + result + '"]').content;
    feedback.textContent = content.querySelector('p').textContent;
    const model = content.querySelector('blockquote');
    if (model) {
      const copy = model.cloneNode(true);
      const evidence = selected || visible[visible.length - 1];
      copy.querySelector('span').textContent = evidence.querySelector('[data-rt-quote]').textContent;
      get('[data-rt-sample]').replaceChildren(...copy.childNodes);
      rounds.hidden = false;
    }
    drawMap();
  }

  for (const button of caseButtons) button.addEventListener('click', () => restart(button));
  card.addEventListener('click', event => {
    const phrase = event.target.closest('[data-rt-phrase]');
    if (phrase && panel.contains(phrase)) showChoice(phrase);
  });
  next.addEventListener('click', () => reveal(phrases.find(p => p.closest('li').hidden)));
  ask.addEventListener('click', () => reveal(phrases[phrases.length - 1]));
  open.addEventListener('click', () => showChoice(null));
  get('[data-rt-restart]').addEventListener('click', () => {
    const current = caseButtons.find(b => b.getAttribute('aria-pressed') === 'true');
    restart(current);
    current.focus();
  });
  restart(caseButtons[0]);
}

function fdMountPerinatalComparison(body) {
  const interview = body.querySelector('#vp-perinatal');
  if (!interview || interview.dataset.mounted) return;
  interview.dataset.mounted = 'true';
  for (const button of interview.querySelectorAll('[data-vp-ask-other]')) {
    button.addEventListener('click', () => {
      const question = interview.querySelector('#' + button.dataset.vpAskOther);
      question.closest('.vp-card').open = true;
      question.open = true;
      question.querySelector('details').open = false;
      fdBedsideFocus(question.querySelector('summary'));
    });
  }
}

function fdMountDayroomChoices(body) {
  const room = body.querySelector('#vp-dayroom');
  if (!room || room.dataset.mounted) return;
  room.dataset.mounted = 'true';
  const choices = room.querySelectorAll('[data-vp-place]');
  const recheck = room.querySelector('#vp-recheck');
  for (const choice of choices) choice.addEventListener('click', () => {
    if (choice.getAttribute('aria-pressed') === 'true') return;
    const selectedPanel = room.querySelector('#' + choice.getAttribute('aria-controls'));
    recheck.hidden = false;
    recheck.open = false;
    for (const disclosure of recheck.querySelectorAll('details[open]')) disclosure.open = false;
    for (const history of recheck.querySelectorAll('[data-vp-first-step]')) {
      history.textContent = selectedPanel.querySelector('[data-vp-opening]').textContent;
    }
    for (const option of choices) {
      const selected = option === choice;
      option.setAttribute('aria-pressed', String(selected));
      const result = room.querySelector('#' + option.getAttribute('aria-controls'));
      result.hidden = !selected;
      if (!selected) result.querySelector('details').open = false;
    }
    room.querySelector('.vp-announcement').textContent = selectedPanel.querySelector('blockquote').textContent;
  });
}

function fdMountCatatoniaFrames(body) {
  const caseCard = body.querySelector('#vp-catatonia');
  if (!caseCard || caseCard.dataset.mounted) return;
  caseCard.dataset.mounted = 'true';
  const frames = Array.from(caseCard.querySelectorAll('[data-vp-frame]'));
  const compare = caseCard.querySelector('[data-vp-compare]');
  for (const frame of frames) frame.addEventListener('toggle', () => {
    const bothOpen = frames.every(item => item.open);
    compare.hidden = !bothOpen;
    caseCard.querySelector('[data-vp-compare-hint]').hidden = bothOpen;
    if (!bothOpen) compare.querySelector('details').open = false;
  });
}

function fdBedsideFocus(control) {
  const section = control.closest('.sec-c');
  if (section && !section.classList.contains('open')) section.querySelector('.sec-h button').click();
  control.focus({preventScroll: true});
  control.scrollIntoView({block: 'center'});
}

function fdMountRaeReturnVisit(body) {
  const card = body.querySelector('#rae-visit');
  const handoff = body.querySelector('#rae-handoff');
  if (!card || !handoff || card.dataset.mounted) return;
  card.dataset.mounted = 'true';

  const questions = card.querySelectorAll('[data-ask]');
  const plans = card.querySelectorAll('[data-plan]');
  const leads = handoff.querySelectorAll('[data-lead]');
  const next = card.querySelector('[data-visit]');
  const time = card.querySelector('[data-time]');
  const who = card.querySelector('[data-who]');
  const timeOpen = time.textContent;
  const teamOpen = who.textContent;
  const booking = card.querySelector('template[data-booking]').content;
  const worked = handoff.querySelector('details');
  const sample = handoff.querySelector('[data-handoff-sample]');
  const copy = (source, field) => source.querySelector('[data-' + field + ']').textContent;
  let morning;
  let outcome;

  function select(buttons, current) {
    for (const button of buttons) button.setAttribute('aria-pressed', String(button === current));
  }
  function chooseLead(button) {
    select(leads, button);
    const matched = button && button.dataset.lead === outcome.dataset.outcome;
    handoff.querySelector('[data-feedback]').textContent = button ? copy(outcome.content, matched ? 'match' : 'hint') : '';
    worked.hidden = !matched;
    worked.open = false;
    sample.textContent = '';
  }
  function showUpdate(key) {
    outcome = key && handoff.querySelector('template[data-outcome="' + key + '"]');
    handoff.querySelector('[data-ready]').hidden = !outcome;
    handoff.querySelector('[data-locked]').hidden = Boolean(outcome);
    const update = handoff.querySelector('[data-update]');
    update.textContent = !outcome ? '' : key === 'change' ? copy(outcome.content, 'words') : copy(morning, 'afternoon');
    chooseLead(null);
  }
  function closeVisit(button) {
    select(plans, button);
    const booked = button && button.dataset.plan === 'return';
    time.textContent = booked ? copy(booking, 'agreed-time') : timeOpen;
    who.textContent = booked ? copy(booking, 'team') : teamOpen;
    card.querySelector('[data-plan-note]').textContent = button ? copy(booking, button.dataset.plan) : '';
    next.hidden = !booked;
    showUpdate(null);
  }
  for (const button of questions) button.addEventListener('click', () => {
    if (button.getAttribute('aria-pressed') === 'true') return;
    morning = card.querySelector('template[data-morning="' + button.dataset.ask + '"]').content;
    select(questions, button);
    card.querySelector('[data-answer]').hidden = card.querySelector('[data-closing]').hidden = false;
    card.querySelector('[data-reply]').textContent = copy(morning, 'words');
    card.querySelector('[data-priority]').textContent = copy(morning, 'card');
    closeVisit(null);
  });
  for (const button of plans) button.addEventListener('click', () => {
    if (button.getAttribute('aria-pressed') !== 'true') closeVisit(button);
  });
  next.addEventListener('click', () => {
    if (!outcome) showUpdate('function');
    fdBedsideFocus(leads[0]);
  });
  handoff.querySelector('[data-switch]').addEventListener('click', () => {
    showUpdate(outcome.dataset.outcome === 'change' ? 'function' : 'change');
    fdBedsideFocus(leads[0]);
  });
  for (const button of leads) button.addEventListener('click', () => chooseLead(button));
  handoff.querySelector('[data-back]').addEventListener('click', () => {
    fdBedsideFocus(card.querySelector('[data-ask][aria-pressed="true"]') || questions[0]);
  });
  worked.querySelector('summary').addEventListener('click', () => {
    sample.textContent = '';
    if (worked.open || worked.hidden) return;
    const nextStep = copy(outcome.content, 'next');
    const report = outcome.dataset.outcome === 'change'
      ? nextStep + ' ' + copy(morning, 'history')
      : copy(morning, 'progress') + ' ' + nextStep;
    sample.textContent = '“' + report + '”';
  });
}

function fdMountTreatmentRationale(body) {
  const card = body.querySelector('#quieter-on-unit');
  if (!card || card.dataset.mounted) return;
  card.dataset.mounted = 'true';

  const find = selector => card.querySelector(selector);
  const bank = find('template').content;
  const lenses = Array.from(card.querySelectorAll('input[name="qt-lens"]'));
  const question = find('[data-qt-question]');
  const instruction = find('[data-qt-instruction]');
  const openingQuestion = question.textContent;
  const openingInstruction = instruction.textContent;
  const options = find('[data-qt-statements]');
  const openButton = find('[data-qt-open]');
  const compared = new Set();
  let historyIndex = 0;
  let nextShift = false;
  const history = () => bank.querySelector('[data-history="' + historyIndex + '"]');

  function updateHandoff() {
    const hasCall = compared.has('call');
    options.hidden = !hasCall;
    find('[data-qt-gap]').hidden = hasCall;
    const selected = options.querySelector('input:checked');
    const feedback = find('[data-qt-feedback]');
    const worked = find('[data-qt-worked]');
    feedback.hidden = !(hasCall && selected);
    feedback.textContent = feedback.hidden ? '' : history().querySelector('[data-feedback="' + selected.value + '"]').textContent;
    worked.hidden = feedback.hidden || !selected.hasAttribute('data-correct');
    const handoff = find('[data-qt-handoff]');
    handoff.replaceChildren();
    if (worked.hidden) return;
    const report = history().querySelector('[data-handoff]').cloneNode(true);
    for (const condition of report.querySelectorAll('[data-if-open],[data-if-unopened]')) {
      const {ifOpen, ifUnopened} = condition.dataset;
      if (ifOpen ? !compared.has(ifOpen) : compared.has(ifUnopened)) condition.remove();
    }
    handoff.textContent = report.textContent;
  }

  function showReading(period, reading) {
    const value = find('[data-qt-' + period + '-value]');
    const quote = find('[data-qt-' + period + '-quote]');
    if (reading) {
      value.replaceChildren(reading.querySelector('[data-value]').cloneNode(true));
      quote.textContent = reading.querySelector('[data-quote]').textContent;
    } else {
      value.textContent = '—';
      quote.textContent = bank.querySelector('[data-pending]').textContent;
    }
  }

  function compare() {
    const lens = lenses.find(input => input.checked);
    find('[data-qt-empty]').hidden = Boolean(lens);
    find('.qt-trace').hidden = !lens;
    openButton.disabled = !lens;
    if (lens) {
      const key = lens.value;
      const metric = bank.querySelector('[data-metric="' + key + '"]');
      find('[data-qt-metric]').textContent = metric.querySelector('[data-title]').textContent;
      find('[data-qt-note]').textContent = metric.querySelector('[data-note]').textContent;
      showReading('base', bank.querySelector('[data-reading="base-' + key + '"]'));
      showReading('next', nextShift && history().querySelector('[data-reading="' + key + '"]'));
      if (nextShift) compared.add(key);
    }
    updateHandoff();
  }

  function showPhase() {
    const isAlternate = historyIndex === 1;
    const phase = nextShift ? (isAlternate ? 'other-open' : 'open') : (isAlternate ? 'alternate' : 'base');
    find('[data-qt-phase]').textContent = bank.querySelector('[data-phase-' + phase + ']').textContent;
    question.textContent = nextShift ? bank.querySelector('[data-question-open]').textContent : openingQuestion;
    instruction.textContent = nextShift ? bank.querySelector('[data-instruction-open]').textContent : openingInstruction;
    const context = find('[data-qt-context]');
    context.querySelector('span').textContent = nextShift ? history().querySelector('[data-context]').textContent : '';
    context.hidden = find('[data-qt-nurse]').hidden = find('[data-qt-practice]').hidden = !nextShift;
    openButton.hidden = nextShift;
    const optionList = options.querySelector('div');
    optionList.replaceChildren();
    if (nextShift) optionList.replaceChildren(...history().querySelector('[data-options]').cloneNode(true).children);
    compare();
    fdBedsideFocus(question);
  }

  for (const lens of lenses) lens.addEventListener('change', compare);
  options.addEventListener('change', updateHandoff);
  openButton.addEventListener('click', () => {
    nextShift = true;
    showPhase();
  });
  function restart(index) {
    historyIndex = index;
    nextShift = false;
    compared.clear();
    for (const lens of lenses) lens.checked = false;
    showPhase();
  }
  find('[data-qt-other]').addEventListener('click', () => restart(1 - historyIndex));
  find('[data-qt-reset]').addEventListener('click', () => restart(0));
}

function fdMountFollowupStudy(body) {
  const card = body.querySelector('#study-denominators');
  if (!card || card.dataset.mounted) return;
  card.dataset.mounted = 'true';
  const all = selector => Array.from(card.querySelectorAll(selector));
  const group = attribute => all('[data-study-' + attribute + ']');
  const controls = card.querySelector('[data-study-controls]');
  const result = card.querySelector('[data-study-result]');
  const debrief = card.querySelector('[data-study-debrief]');
  function mark(buttons, choice) {
    for (const button of buttons) button.setAttribute('aria-pressed', String(button === choice));
  }
  function showView(view) {
    for (const count of group('count')) count.hidden = view === 'rate';
    for (const rate of group('rate')) rate.hidden = view !== 'rate';
    card.querySelector('#study-scale').hidden = view !== 'rate';
    mark(group('view'), card.querySelector('[data-study-view="' + view + '"]'));
  }
  function clearClaim() {
    mark(group('claim'), null);
    debrief.hidden = true;
    for (const detail of debrief.querySelectorAll('details[open]')) detail.open = false;
    for (const reply of group('reply')) reply.hidden = true;
  }
  for (const button of group('view')) {
    button.addEventListener('click', () => showView(button.dataset.studyView));
  }
  for (const button of group('pick')) {
    button.addEventListener('click', () => {
      mark(group('pick'), button);
      clearClaim();
      for (const reply of group('answer')) reply.hidden = reply.dataset.studyAnswer !== button.dataset.studyPick;
      for (const denominator of group('total')) denominator.hidden = false;
      controls.hidden = result.hidden = false;
      showView('rate');
      fdBedsideFocus(card.querySelector('.study-plot'));
    });
  }
  for (const button of group('claim')) {
    button.addEventListener('click', () => {
      clearClaim();
      mark(group('claim'), button);
      card.querySelector('[data-study-reply="' + button.dataset.studyClaim + '"]').hidden = false;
      debrief.hidden = false;
      fdBedsideFocus(debrief);
    });
  }
  card.querySelector('[data-study-reset]').addEventListener('click', () => {
    clearClaim();
    result.hidden = controls.hidden = true;
    for (const denominator of group('total')) denominator.hidden = true;
    for (const reply of group('answer')) reply.hidden = true;
    mark(group('pick'), null);
    showView('count');
    fdBedsideFocus(group('pick')[0]);
  });
}

function fdMountJoCall(body) {
  const call = body.querySelector('#jo-night');
  const handoff = body.querySelector('#jo-note');
  if (!call || !handoff || call.dataset.mounted) return;
  call.dataset.mounted = 'true';

  const sources = Array.from(call.querySelectorAll('[data-source]'));
  const claims = handoff.querySelectorAll('[data-claim]');
  const description = call.querySelector('figcaption');
  const initialCaption = description.textContent;
  const next = call.querySelector('[data-continue]');
  const worked = handoff.querySelector('details');
  const sample = handoff.querySelector('#jo-sample');
  const template = handoff.querySelector('template').content;
  const copy = field => template.querySelector('[data-' + field + ']').textContent;
  const opened = () => sources.filter(button => button.getAttribute('aria-pressed') === 'true');

  function chooseClaim(button) {
    for (const option of claims) option.setAttribute('aria-pressed', String(option === button));
    const claim = button && button.dataset.claim;
    handoff.querySelector('#jo-feedback').textContent = claim ? copy(claim) : '';
    handoff.querySelector('#jo-ready').hidden = claim !== 'contact';
    worked.open = false;
    sample.textContent = '';
  }

  for (const button of sources) button.addEventListener('click', () => {
    const selected = button.getAttribute('aria-pressed') !== 'true';
    button.setAttribute('aria-pressed', String(selected));
    const key = button.dataset.source;
    call.querySelector('#jo-' + key).hidden = !selected;
    call.querySelector(key === 'call' ? '.call' : '.visit').hidden = !selected;
    const captions = opened().map(source => call.querySelector('#jo-' + source.dataset.source + ' p').textContent);
    description.textContent = captions.length ? captions.join(' / ') + ' · Hatched time is unobserved.' : initialCaption;
    next.hidden = handoff.querySelector('[data-ready]').hidden = !captions.length;
    handoff.querySelector('[data-locked]').hidden = Boolean(captions.length);
    chooseClaim(null);
  });
  for (const button of claims) button.addEventListener('click', () => chooseClaim(button));
  next.addEventListener('click', () => fdBedsideFocus(claims[0]));
  handoff.querySelector('[data-back]').addEventListener('click', () => fdBedsideFocus(sources[0]));
  // A search or print operation can expand a disclosure. Only a learner action fills it.
  worked.querySelector('summary').addEventListener('click', () => {
    const observations = opened().map(button => copy(button.dataset.source));
    sample.textContent = !worked.open && observations.length && !handoff.querySelector('#jo-ready').hidden
      ? '“' + copy('start') + ' ' + observations.join(' and ') + '. ' + copy('end') + '”' : '';
  });
}

function fdMountLeeTimeline(body) {
  const timeline = body.querySelector('#lee-letter');
  const resident = body.querySelector('#lee-res');
  if (!timeline || !resident || timeline.dataset.mounted) return;
  timeline.dataset.mounted = 'true';

  const ask = timeline.querySelector('#lee-ask');
  const askLabel = ask.textContent;
  const alternate = timeline.querySelector('#lee-switch');
  const next = timeline.querySelector('[data-continue]');
  const marks = timeline.querySelectorAll('[data-onset]');
  const questions = resident.querySelectorAll('[data-follow]');
  const worked = resident.querySelector('#lee-worked');
  const sample = resident.querySelector('#lee-sample');
  let history = timeline.querySelector('template[data-history="after"]');
  let question;
  const copy = field => history.content.querySelector('[data-' + field + ']').textContent;

  function chooseFollowUp(button) {
    for (const option of questions) option.setAttribute('aria-pressed', String(option === button));
    question = button && button.dataset.follow;
    resident.querySelector('#lee-more').hidden = worked.hidden = !question;
    resident.querySelector('#lee-detail').textContent = question ? copy(question + '-words') : '';
    worked.open = false;
    sample.textContent = '';
  }
  function markOnset(button) {
    for (const option of marks) option.setAttribute('aria-pressed', String(option === button));
    const matched = button && button.dataset.onset === history.dataset.history;
    next.hidden = resident.querySelector('[data-ready]').hidden = !matched;
    resident.querySelector('[data-locked]').hidden = Boolean(matched);
    timeline.querySelector('#lee-feedback').textContent = button ? copy(matched ? 'feedback' : 'hint') : '';
    chooseFollowUp(null);
  }
  function showStory(show) {
    timeline.querySelector('#lee-story').hidden = timeline.querySelector('#lee-mark').hidden = alternate.hidden = !show;
    timeline.querySelector('#lee-reply').textContent = show ? copy('words') : '';
    ask.setAttribute('aria-expanded', String(show));
    ask.textContent = show ? 'Close Lee’s account' : askLabel;
    markOnset(null);
  }
  ask.addEventListener('click', () => showStory(ask.getAttribute('aria-expanded') !== 'true'));
  alternate.addEventListener('click', () => {
    const key = history.dataset.history === 'after' ? 'before' : 'after';
    history = timeline.querySelector('template[data-history="' + key + '"]');
    showStory(true);
    fdBedsideFocus(marks[0]);
  });
  for (const button of marks) button.addEventListener('click', () => markOnset(button));
  for (const button of questions) button.addEventListener('click', () => chooseFollowUp(button));
  next.addEventListener('click', () => fdBedsideFocus(questions[0]));
  resident.querySelector('[data-back]').addEventListener('click', () => fdBedsideFocus(ask));
  worked.querySelector('summary').addEventListener('click', () => {
    sample.textContent = !worked.open && question ? '“' + copy(question + '-note') + '”' : '';
  });
}


function fdMountFamilyPause(body) {
  const card = body.querySelector('#family-pause');
  if (!card || card.dataset.mounted) return;
  card.dataset.mounted = 'true';

  const find = selector => card.querySelector(selector);
  const voices = Array.from(card.querySelectorAll('[data-fp-ask]'));
  const lines = card.querySelectorAll('[data-fp-line]');
  const heard = new Set();
  const hint = find('#fp-hint'), openingHint = hint.textContent;
  const responses = find('#fp-lines'), response = find('#fp-response');
  const dialogue = find('#fp-dialogue'), resident = find('#fp-resident');
  const notes = find('#fp-notes'), feedback = find('#fp-feedback');

  function markChoice(buttons, chosen) {
    for (const button of buttons) button.setAttribute('aria-pressed', String(button === chosen));
  }

  for (const button of voices) button.addEventListener('click', () => {
    const answer = find('#' + button.getAttribute('aria-controls'));
    answer.hidden = !answer.hidden;
    button.setAttribute('aria-expanded', String(!answer.hidden));
    if (!answer.hidden) heard.add(button);
    if (heard.size === voices.length && responses.hidden) {
      responses.hidden = false;
      hint.textContent = hint.dataset.readyText;
    }
  });

  for (const button of lines) button.addEventListener('click', () => {
    const branch = find('template[data-fp-branch="' + button.dataset.fpLine + '"]').content;
    markChoice(lines, button);
    dialogue.replaceChildren(branch.querySelector('[data-fp-reply]').cloneNode(true));
    notes.replaceChildren(branch.querySelector('[data-fp-choices]').cloneNode(true));
    feedback.hidden = true;
    feedback.textContent = '';
    response.hidden = resident.hidden = false;
    fdBedsideFocus(response);
  });

  notes.addEventListener('click', event => {
    const choice = event.target.closest('button');
    if (!choice || !notes.contains(choice)) return;
    markChoice(notes.querySelectorAll('button'), choice);
    feedback.hidden = false;
    feedback.textContent = choice.nextElementSibling.textContent;
  });

  find('[data-fp-reset]').addEventListener('click', () => {
    heard.clear();
    for (const button of voices) {
      button.setAttribute('aria-expanded', 'false');
      find('#' + button.getAttribute('aria-controls')).hidden = true;
    }
    markChoice(lines, null);
    responses.hidden = response.hidden = resident.hidden = feedback.hidden = true;
    dialogue.replaceChildren();
    notes.replaceChildren();
    feedback.textContent = '';
    hint.textContent = openingHint;
    fdBedsideFocus(voices[0]);
  });
}

function fdMountNightSignout(body) {
  const card = body.querySelector('#night-signout');
  if (!card || card.dataset.mounted) return;
  card.dataset.mounted = 'true';

  const find = selector => card.querySelector(selector);
  const bank = find('[data-ns-bank]').content;
  const buttons = Array.from(card.querySelectorAll('[data-pick]'));
  const order = buttons.map(button => button.dataset.pick);
  const selected = new Set();
  const slip = find('#ns-slip-label'), openingLabel = slip.textContent;
  const speaker = find('#ns-resident-label'), residentLabel = speaker.textContent;
  const question = find('#ns-question'), status = find('#ns-status');
  let sent = false;
  const firstGap = () => order.find(key => !selected.has(key));
  const fact = key => bank.querySelector('[data-fact="' + key + '"]');
  const label = key => bank.querySelector('[data-ns-' + key + ']').textContent;

  function render() {
    const included = order.filter(key => selected.has(key));
    const list = find('#ns-card');
    list.replaceChildren(...included.map(key => fact(key).cloneNode(true)));
    list.hidden = !included.length;
    slip.textContent = sent ? label('sent') : included.length ? label('draft') : openingLabel;
    for (const button of buttons) {
      const isIncluded = selected.has(button.dataset.pick);
      button.setAttribute('aria-pressed', String(isIncluded));
      find('#' + button.getAttribute('aria-controls')).hidden = !isIncluded;
    }
    find('#ns-compose').hidden = sent;
    find('#ns-received').hidden = !sent;
    const missing = firstGap();
    speaker.textContent = missing ? residentLabel : label('readback');
    question.dataset.missing = sent && missing ? missing : 'none';
    question.textContent = sent ? bank.querySelector('[data-heard="' + (included.join('-') || 'none') + '"]').textContent : '';
    find('#ns-repair').hidden = !missing;
    if (missing) find('#ns-clarify').textContent = fact(missing).dataset.clarify;
  }

  function receive(newFact) {
    sent = true;
    render();
    status.textContent = [newFact, question.textContent].filter(Boolean).join(' ');
    find(firstGap() ? '#ns-clarify' : '#ns-edit').focus({preventScroll:true});
    find('.ns-reader').scrollIntoView({block:'nearest'});
  }

  function edit(reset) {
    if (reset) selected.clear();
    sent = false;
    render();
    status.textContent = label(reset ? 'restarted' : 'editing');
    fdBedsideFocus(buttons[0]);
  }

  for (const button of buttons) button.addEventListener('click', () => {
    const key = button.dataset.pick;
    if (selected.has(key)) selected.delete(key);
    else selected.add(key);
    render();
    status.textContent = selected.has(key) ? find('#' + button.getAttribute('aria-controls')).textContent : label('removed');
  });
  find('#ns-send').addEventListener('click', () => receive(''));
  find('#ns-clarify').addEventListener('click', () => {
    const key = firstGap();
    if (!sent || !key) return;
    selected.add(key);
    receive(fact(key).querySelector('dd').textContent);
  });
  find('#ns-edit').addEventListener('click', () => edit(false));
  find('#ns-reset').addEventListener('click', () => edit(true));
}

function fdMountCoachLine(body) {
  const card = body.querySelector('#coach-line');
  if (!card || card.dataset.mounted) return;
  card.dataset.mounted = 'true';

  const get = selector => card.querySelector(selector);
  const views = card.querySelectorAll('[data-coach-view]');
  const scenes = card.querySelectorAll('[data-coach-scene]');
  const lines = card.querySelectorAll('[data-coach-line]');
  const openings = card.querySelectorAll('[data-coach-open]');
  const observations = card.querySelectorAll('[data-coach-observe]');
  const ask = get('[data-coach-open="ask"]');
  const match = get('[data-coach-observe="match"]');
  const other = get('[data-coach-observe="other"]');
  const hint = get('#cl-hint');
  const outcome = get('#cl-outcome');
  const student = get('#cl-student');
  const worked = get('#cl-worked');
  const reveal = get('[data-coach-reveal]');
  const status = get('[data-coach-status]');
  let selectedLine, branch;

  function press(group, selected) {
    for (const button of group) button.setAttribute('aria-pressed', String(button === selected));
  }
  function copy(field) {
    return branch.content.querySelector('[data-' + field + ']').textContent;
  }
  function clearPractice() {
    student.hidden = worked.hidden = true;
    reveal.setAttribute('aria-expanded', 'false');
    for (const selector of ['[data-coach-self]', '[data-coach-model]', '[data-coach-retry]']) {
      get(selector).textContent = '';
    }
    hint.textContent = outcome.textContent = status.textContent = '';
    match.textContent = other.textContent = '';
    press(observations, null);
  }

  for (const view of views) view.addEventListener('click', () => {
    if (view.getAttribute('aria-pressed') === 'true') return;
    press(views, view);
    for (const scene of scenes) scene.hidden = scene.dataset.coachScene !== view.dataset.coachView;
    selectedLine = branch = null;
    press(lines, null);
    press(openings, null);
    clearPractice();
    get('#cl-attempt').hidden = true;
    get('[data-coach-empty]').hidden = false;
    get('[data-coach-echo]').textContent = ask.textContent = '';
  });
  for (const line of lines) line.addEventListener('click', () => {
    selectedLine = line;
    branch = get('template[data-coach-branch="' + line.dataset.coachLine + '"]');
    press(lines, line);
    press(openings, null);
    clearPractice();
    get('[data-coach-empty]').hidden = true;
    get('#cl-attempt').hidden = false;
    get('[data-coach-echo]').textContent = '“' + line.querySelector('.cl-quote').textContent + '”';
    ask.textContent = copy('ask');
    const openingGroup = get('[data-coach-openings]');
    openingGroup.prepend(branch.hasAttribute('data-ask-first') ? ask : get('[data-coach-open="tell"]'));
    fdBedsideFocus(get('#cl-private-title'));
    status.textContent = line.closest('[data-coach-scene]').dataset.status;
  });
  for (const opening of openings) opening.addEventListener('click', () => {
    press(openings, opening);
    clearPractice();
    if (opening !== ask) {
      hint.textContent = hint.dataset.hint;
      return;
    }
    get('[data-coach-self]').textContent = copy('self');
    student.hidden = false;
    status.textContent = status.dataset.selfStatus;
  });
  reveal.addEventListener('click', () => {
    if (student.hidden) return;
    get('[data-coach-model]').textContent = copy('model');
    get('[data-coach-retry]').textContent = copy('retry');
    match.textContent = copy('match');
    other.textContent = copy('other');
    get('[data-coach-observations]').prepend(branch.hasAttribute('data-match-first') ? match : other);
    outcome.textContent = '';
    press(observations, null);
    worked.hidden = false;
    reveal.setAttribute('aria-expanded', 'true');
    fdBedsideFocus(get('#cl-worked-title'));
  });
  for (const choice of observations) choice.addEventListener('click', () => {
    press(observations, choice);
    outcome.textContent = choice === match ? copy('result') : outcome.dataset.hint;
  });
  get('[data-coach-back]').addEventListener('click', () => fdBedsideFocus(selectedLine));
}

function fdMountEctMemory(body) {
  const card = body.querySelector('#ect-memory-conversation');
  const resident = body.querySelector('#em-resident');
  if (!card || !resident || card.dataset.mounted) return;
  card.dataset.mounted = 'true';

  const concerns = card.querySelectorAll('[data-em-concern]');
  const replies = card.querySelectorAll('[data-em-reply]');
  const patient = card.querySelector('#em-patient');
  const practice = card.querySelector('#em-practice');
  const feedback = card.querySelector('#em-feedback');
  const next = card.querySelector('[data-em-continue]');
  const reset = card.querySelector('[data-em-reset]');
  const status = card.querySelector('[data-em-status]');
  const ready = resident.querySelector('[data-em-ready]');
  const model = resident.querySelector('[data-em-model]');
  const modelBody = model.querySelector('[data-em-model-body]');
  let scenario;
  let plan;

  function press(buttons, current) {
    for (const button of buttons) button.setAttribute('aria-pressed', String(button === current));
  }
  function clearReply() {
    press(replies, null);
    feedback.hidden = next.hidden = ready.hidden = true;
    feedback.querySelector('[data-em-interpretation]').textContent = '';
    feedback.querySelector('[data-em-coach]').textContent = '';
    resident.querySelector('[data-em-locked]').hidden = false;
    resident.querySelector('[data-em-rehearse]').textContent = '';
    model.open = false;
    modelBody.replaceChildren();
  }
  for (const button of concerns) button.addEventListener('click', () => {
    if (button.getAttribute('aria-pressed') === 'true') return;
    press(concerns, button);
    clearReply();
    const branch = button.dataset.emConcern;
    scenario = card.querySelector('template[data-em-scenario="' + branch + '"]').content;
    plan = resident.querySelector('template[data-em-plan="' + branch + '"]').content;
    const words = scenario.querySelector('[data-patient]').textContent;
    patient.querySelector('[data-em-patient]').textContent = words;
    card.querySelector('[data-em-reply="specific"]').textContent = scenario.querySelector('[data-specific]').textContent;
    patient.hidden = practice.hidden = reset.hidden = false;
    status.textContent = patient.querySelector('.case-kicker').textContent + '. ' + words;
  });
  for (const button of replies) button.addEventListener('click', () => {
    if (!scenario || button.getAttribute('aria-pressed') === 'true') return;
    clearReply();
    press(replies, button);
    const reaction = scenario.querySelector(button.dataset.emReply === 'general' ? '[data-general]' : '[data-reaction]').textContent;
    const coaching = scenario.querySelector('[data-coach]').textContent;
    feedback.querySelector('[data-em-interpretation]').textContent = reaction;
    feedback.querySelector('[data-em-coach]').textContent = coaching;
    resident.querySelector('[data-em-rehearse]').textContent = plan.querySelector('[data-rehearse]').textContent;
    feedback.hidden = next.hidden = ready.hidden = false;
    resident.querySelector('[data-em-locked]').hidden = true;
    status.textContent = feedback.querySelector('.case-kicker').textContent + '. ' + reaction + ' ' + coaching;
  });

  // Reader search and print may open details. Only a learner's activation supplies the model.
  model.querySelector('summary').addEventListener('click', () => {
    modelBody.replaceChildren();
    if (!ready.hidden && !model.open) modelBody.append(plan.querySelector('[data-model]').cloneNode(true));
  });
  next.addEventListener('click', () => fdBedsideFocus(resident.querySelector('#em-resident-title')));
  resident.querySelector('[data-em-back]').addEventListener('click', () => {
    fdBedsideFocus(card.querySelector('[data-em-concern][aria-pressed="true"]') || concerns[0]);
  });
  reset.addEventListener('click', () => {
    scenario = plan = null;
    press(concerns, null);
    clearReply();
    patient.hidden = practice.hidden = reset.hidden = true;
    patient.querySelector('[data-em-patient]').textContent = '';
    card.querySelector('[data-em-reply="specific"]').textContent = '';
    fdBedsideFocus(concerns[0]);
    status.textContent = status.dataset.resetMessage;
  });
}
