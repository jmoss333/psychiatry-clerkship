/* The clinical text lives with its reading. Each mounted exercise keeps its choices in the DOM. */
function fdMountBedsideCases(body) {
  fdMountHomeDoseHistory(body);
  fdMountMorganExposure(body);
  fdMountFeverExams(body);
  fdMountJoCall(body);
  fdMountNicoCall(body);
  fdMountLeeTimeline(body);
  fdMountNightSignout(body);
  fdMountCoachLine(body);
  fdMountAlexTiming(body);
  fdMountEveningCalls(body);
  fdMountDinnerMap(body);
  fdMountTherapyChain(body);
  fdMountEctMemory(body);
  fdMountRaeReturnVisit(body);
  fdMountTreatmentRationale(body);
  fdMountFollowupStudy(body);
  fdMountLangCulture(body);
  fdMountCatieStop(body);
  fdMountDayroomChoices(body);
  fdMountCatatoniaFrames(body);
  fdMountConsultCallback(body);
  fdMountOvernightPlan(body);
  fdMountPerinatalComparison(body);
  fdMountEvidenceRails(body);
  fdMountReplyThread(body);
  fdMountNicoInterview(body);
  fdMountElenaVisit(body);
}

function fdMountConsultCallback(body) {
  const card = body.querySelector('#consult-callback');
  if (!card || card.dataset.mounted) return;
  card.dataset.mounted = 'true';

  const field = key => card.querySelector('#cc-' + key);
  const answers = card.querySelector('template[data-answers]').content;
  const sourceButtons = [...card.querySelectorAll('button[data-source]')];
  const callButtons = [...card.querySelectorAll('button[data-call]')];
  const accounts = new Map([...answers.querySelectorAll('[data-account]')].map(el => [el.dataset.account, el]));
  const heard = new Set();
  const panel = field('source-card');
  const reply = field('reply');
  const receipt = field('receipt');
  const focused = card.querySelector('[data-call="focused"]');
  let expanded = null;

  function accountText(key, fieldName) {
    return accounts.get(key).querySelector('[data-' + fieldName + ']').textContent;
  }
  function clearCall() {
    for (const button of callButtons) button.setAttribute('aria-pressed', 'false');
    reply.hidden = true;
    reply.replaceChildren();
    receipt.hidden = true;
    receipt.querySelector('details').open = false;
  }
  function renderMap() {
    const opened = [];
    for (const button of sourceButtons) {
      const key = button.dataset.source;
      const slot = button.closest('[data-slot]');
      const instruction = accountText(key, 'instruction');
      const summary = accountText(key, 'summary');
      slot.dataset.opened = String(heard.has(key));
      slot.querySelector('.slot-text').textContent = heard.has(key) ? summary : instruction;
      button.setAttribute('aria-label', heard.has(key) ? instruction + '. Heard. ' + summary : instruction);
      button.setAttribute('aria-expanded', String(expanded === key));
      if (heard.has(key)) opened.push(key);
      if (expanded === key) {
        slot.append(panel);
        panel.querySelector('.speaker').textContent = accountText(key, 'speaker');
        panel.querySelector('[data-quote]').textContent = accountText(key, 'quote');
      }
    }
    panel.hidden = expanded === null;
    field('count').textContent = heard.size + ' of ' + sourceButtons.length + ' heard';
    const evidence = opened.join(' ') || 'none';
    focused.textContent = answers.querySelector('[data-question-for="' + evidence + '"]').textContent;
  }
  for (const button of sourceButtons) button.addEventListener('click', () => {
    const key = button.dataset.source;
    const isNew = !heard.has(key);
    heard.add(key);
    expanded = expanded === key ? null : key;
    if (isNew || receipt.hidden) clearCall();
    renderMap();
  });

  function replyVariant(choice, missing) {
    if (choice === 'broad') return heard.has('intern') ? 'intern' : 'initial';
    if (choice === 'premature') return heard.has('patient') ? 'patient' : 'initial';
    return missing || 'complete';
  }
  for (const button of callButtons) button.addEventListener('click', () => {
    const choice = button.dataset.call;
    for (const other of callButtons) other.setAttribute('aria-pressed', String(other === button));
    const missing = ['intern', 'patient', 'nurse'].find(key => !heard.has(key));
    const variant = choice + '-' + replyVariant(choice, missing);
    const words = document.createElement('p');
    words.textContent = answers.querySelector('[data-reply-for="' + variant + '"]').textContent;
    const speaker = document.createElement('strong');
    speaker.textContent = accountText('intern', 'speaker');
    reply.replaceChildren(speaker, words);
    if (choice === 'focused' && missing) {
      const followUp = document.createElement('button');
      followUp.type = 'button';
      followUp.className = 'follow-up';
      followUp.textContent = missing === 'intern'
        ? answers.querySelector('[data-ask-intern]').textContent : accountText(missing, 'instruction');
      followUp.addEventListener('click', () => {
        const source = sourceButtons.find(item => item.dataset.source === missing);
        source.click();
        source.focus();
        source.scrollIntoView({block:'center'});
      });
      reply.append(followUp);
    }
    reply.hidden = false;
    receipt.hidden = choice !== 'focused' || Boolean(missing);
    if (receipt.hidden) receipt.querySelector('details').open = false;
  });
  field('reset').addEventListener('click', () => {
    heard.clear();
    expanded = null;
    clearCall();
    renderMap();
    sourceButtons[0].focus();
  });
  renderMap();
}

function fdMountOvernightPlan(body) {
  const card = body.querySelector('#lucia-rehearsal');
  if (!card || card.dataset.mounted) return;
  card.dataset.mounted = 'true';
  const find = key => card.querySelector('#lucia-' + key);
  const questions = card.querySelectorAll('button[aria-controls^="lucia-reply-"]');
  const choices = card.querySelectorAll('input[name="lucia-revision"]');

  function clearResult() {
    find('result').hidden = find('feedback').hidden = true;
    find('new-line').textContent = '';
  }

  function clearChoice() {
    clearResult();
    for (const choice of choices) choice.checked = false;
    find('apply').disabled = true;
  }

  function showNight(isNight) {
    find('day').hidden = isNight;
    find('night').hidden = find('work').hidden = !isNight;
    find(isNight ? 'barrier' : 'title').focus();
  }

  find('try-night').addEventListener('click', () => showNight(true));
  for (const question of questions) {
    const reply = card.querySelector('#' + question.getAttribute('aria-controls'));
    const choice = find('pick-' + question.id.slice('lucia-ask-'.length));
    question.addEventListener('click', () => {
      const opening = reply.hidden;
      reply.hidden = !opening;
      question.setAttribute('aria-expanded', String(opening));
      if (opening) choice.disabled = false;
    });
  }
  for (const choice of choices) {
    choice.addEventListener('change', () => {
      clearResult();
      find('apply').disabled = false;
    });
  }
  find('apply').addEventListener('click', () => {
    const selected = card.querySelector('input:checked:enabled');
    if (!selected) return;
    clearResult();
    if (selected.value === 'sister') {
      find('feedback').hidden = false;
      find('feedback').focus();
      return;
    }
    find('new-line').textContent = find('line-' + selected.value).content.textContent;
    find('result').hidden = false;
    find('result-title').focus();
  });
  find('edit').addEventListener('click', () => {
    clearChoice();
    find('questions').focus();
  });
  find('reset').addEventListener('click', () => {
    clearChoice();
    for (const question of questions) {
      question.setAttribute('aria-expanded', 'false');
      card.querySelector('#' + question.getAttribute('aria-controls')).hidden = true;
    }
    find('pick-roommate').disabled = find('pick-text').disabled = true;
    showNight(false);
  });
}

function fdMountNicoInterview(body) {
  const card = body.querySelector('#nico-interview');
  if (!card || card.dataset.mounted) return;
  card.dataset.mounted = 'true';
  const find = id => card.querySelector('#ni-' + id);
  const sample = find('sample');
  const compare = find('compare');
  const checkLabel = compare.textContent;
  const mapOpening = find('map-title').textContent;
  const nextTurn = find('end-label').textContent;
  const choices = {move: '', quote: '', reading: ''};
  let scenario;

  const field = name => scenario.content.querySelector('[data-ni-' + name + ']').textContent;

  function select(group, value) {
    choices[group] = value;
    for (const button of card.querySelectorAll('[data-' + group + ']')) {
      button.setAttribute('aria-pressed', String(button.dataset[group] === value));
    }
  }

  function closeFeedback() {
    find('feedback').hidden = true;
    compare.setAttribute('aria-expanded', 'false');
    compare.textContent = checkLabel;
    sample.open = false;
    find('note').textContent = '';
    find('quote-feedback').textContent = '';
    find('reading-feedback').textContent = '';
    find('source').hidden = true;
  }

  function showExchange(move) {
    select('move', move);
    select('quote', '');
    select('reading', '');
    closeFeedback();
    scenario = move ? card.querySelector('template[data-ni-turn="' + move + '"]') : null;
    find('check').hidden = true;
    find('result').hidden = find('rounds').hidden = !scenario;
    for (const name of ['action', 'reply']) find(name).textContent = scenario ? field(name) : '';
    card.querySelector('[data-quote="end"]').textContent = scenario ? field('quote') : '';
    find('end-label').textContent = scenario ? field('end') : nextTurn;
    find('map-title').textContent = scenario ? field('map') : mapOpening;
    find('map-cue').textContent = scenario ? scenario.dataset.cue : '';
    find('finish').setAttribute('d', scenario ? scenario.dataset.path : '');
    find('finish').toggleAttribute('hidden', !scenario);
    find('redirect').toggleAttribute('hidden', !scenario || move === 'wait');
    find('terminal').setAttribute('class', scenario ? 'person' : 'unknown');
  }

  card.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || button.getAttribute('aria-pressed') === 'true') return;
    if (button.dataset.move) {
      showExchange(button.dataset.move);
      find('live').textContent = field('action') + ' Nico says ' + field('reply');
    } else if (button.dataset.quote || button.dataset.reading) {
      const group = button.dataset.quote ? 'quote' : 'reading';
      select(group, button.dataset[group]);
      closeFeedback();
      find('check').hidden = !(choices.quote && choices.reading);
      find('live').textContent = find('check').hidden ? 'Choice selected.' : 'Your choices are ready to check.';
    } else if (button === compare && scenario && choices.quote && choices.reading) {
      if (!find('feedback').hidden) {
        closeFeedback();
        return;
      }
      const quoteFeedback = card.querySelector('template[data-ni-feedback="' + choices.quote + '"]').content;
      find('quote-feedback').textContent = quoteFeedback.textContent.trim();
      find('reading-feedback').textContent = (choices.move === choices.reading ? 'That fits. ' : 'Look again at your turn. ') + field('reasoning');
      find('feedback').hidden = false;
      compare.setAttribute('aria-expanded', 'true');
      compare.textContent = 'Hide feedback';
      find('live').textContent = find('quote-feedback').textContent + ' ' + find('reading-feedback').textContent;
    } else if (button === find('replay')) {
      showExchange('');
      fdBedsideFocus(card.querySelector('[data-move]'));
      find('live').textContent = 'New interview. Choose your next move.';
    }
  });

  // Search and print can expand details. Only a learner's reveal supplies the worked note.
  sample.querySelector('summary').addEventListener('click', () => {
    const revealing = !sample.open && !find('feedback').hidden && scenario;
    find('note').textContent = revealing ? field('note') : '';
    find('source').hidden = !(revealing && choices.move === 'wait');
  });
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

function fdMountHomeDoseHistory(body) {
  const card = body.querySelector('#home-dose-history');
  if (!card || card.dataset.mounted) return;
  card.dataset.mounted = 'true';
  const get = id => card.querySelector('#mh-' + id);
  const copy = Object.fromEntries(Array.from(get('copy').content.children,
    row => [row.dataset.copy, row.textContent]));
  const sources = {rx: 'order-line', fill: 'fill-line'};
  const claims = card.querySelectorAll('[data-claim]');
  const nights = get('nights');
  const recordInputs = nights.querySelectorAll('input');
  const opened = new Set();
  const pending = get('dose-line').textContent;
  const unopened = get('order-line').textContent;
  const openLabel = get('rx').querySelector('.mh-state').textContent;
  let history = 'unopened';

  function clearHandoff() {
    get('handoff').textContent = '';
    get('final').hidden = true;
    get('practice').open = false;
    get('dose-line').textContent = pending;
    get('dose-row').classList.remove('mh-complete');
    get('revision-feedback').hidden = true;
  }

  function clearInterview() {
    clearHandoff();
    for (const input of recordInputs) input.checked = false;
    get('quote').textContent = '';
    get('reply').hidden = get('revise').hidden = true;
    get('hear').hidden = false;
    get('hear').setAttribute('aria-expanded', 'false');
  }

  function hear(nextHistory) {
    clearInterview();
    history = nextHistory;
    get('quote').textContent = copy[history + '-quote'];
    get('hear').hidden = true;
    get('hear').setAttribute('aria-expanded', 'true');
    get('reply').hidden = get('revise').hidden = false;
    get('quote').focus();
  }

  for (const [key, line] of Object.entries(sources)) get(key).addEventListener('click', () => {
    opened.add(key);
    for (const id of opened) {
      get(id).setAttribute('aria-pressed', String(id === key));
      get(id).querySelector('.mh-state').textContent = id === key ? 'Reading' : 'Reviewed';
    }
    get('record-label').textContent = copy[key + '-label'];
    get('record-copy').textContent = copy[key + '-full'];
    get('record').hidden = false;
    get(line).textContent = copy[key + '-line'];
    get('interim').hidden = opened.size < 2;
    get('reset').hidden = false;
    if (opened.size === 2) get('status').textContent = 'Both records reviewed. Choose a handoff below.';
  });

  for (const choice of claims) choice.addEventListener('click', () => {
    const key = choice.dataset.claim;
    for (const option of claims) option.setAttribute('aria-pressed', String(option === choice));
    clearInterview();
    get('ask').hidden = key !== 'open';
    get('claim-feedback').hidden = key === 'open';
    get('claim-feedback').textContent = key === 'open' ? '' : copy[key];
    if (key === 'open') get('ask-title').focus();
  });

  get('hear').addEventListener('click', () => hear('unopened'));
  get('other').addEventListener('click', () => hear(history === 'unopened' ? 'friday' : 'unopened'));
  nights.addEventListener('change', clearHandoff);
  get('check').addEventListener('click', () => {
    const friday = nights.querySelector('[name="mh-fri"]:checked');
    const saturday = nights.querySelector('[name="mh-sat"]:checked');
    if (!friday || !saturday || friday.value !== (history === 'friday' ? 'taken' : 'none') || saturday.value !== 'none') {
      clearHandoff();
      get('revision-feedback').textContent = !friday || !saturday ? copy.partial : copy[history + '-coach'];
      get('revision-feedback').hidden = false;
      return;
    }
    const dose = copy[history + '-dose'];
    get('revision-feedback').hidden = true;
    get('dose-line').textContent = dose;
    get('dose-row').classList.add('mh-complete');
    get('handoff').textContent = '“' + copy.handoff + ' ' + dose + '”';
    get('final').hidden = false;
    get('final-title').focus();
  });

  get('reset').addEventListener('click', () => {
    opened.clear();
    clearInterview();
    for (const choice of claims) choice.setAttribute('aria-pressed', 'false');
    for (const [key, line] of Object.entries(sources)) {
      get(key).setAttribute('aria-pressed', 'false');
      get(key).querySelector('.mh-state').textContent = openLabel;
      get(line).textContent = unopened;
    }
    get('record-label').textContent = get('record-copy').textContent = '';
    get('claim-feedback').hidden = get('interim').hidden = get('ask').hidden = get('record').hidden = true;
    get('reset').hidden = true;
    get('rx').focus();
    get('status').textContent = 'Case restarted.';
  });
}

function fdMountAlexTiming(body) {
  const card = body.querySelector('#alex-timing');
  if (!card || card.dataset.mounted) return;
  card.dataset.mounted = 'true';

  const get = id => card.querySelector('#at-' + id);
  const copy = Object.fromEntries(Array.from(get('copy').content.children,
    item => [item.dataset.copy, item.textContent]));
  const dates = ['before', 'after'];
  const reasons = ['before', 'after', 'certain'];
  const questions = ['prior', 'course'];
  const initialLabel = get('call-label').textContent;
  const initialHint = get('map-hint').textContent;
  let version = null;

  function select(group, keys, active) {
    for (const key of keys) get(group + '-' + key).setAttribute('aria-pressed', String(key === active));
  }

  function clearNote() {
    select('check', questions, null);
    get('note').textContent = '';
    get('sample').hidden = true;
    get('evidence').open = false;
  }

  function clearReasoning() {
    clearNote();
    select('reason', reasons, null);
    get('reason-feedback').hidden = get('next-step').hidden = true;
  }

  function drawPlacement(side) {
    get('map').dataset.placement = side || 'unknown';
    select('place', dates, side);
    for (const key of dates) {
      const pin = get('place-' + key);
      pin.disabled = !version;
      pin.querySelector('b').textContent = key === side ? '✓' : '+';
    }
    get('call-label').textContent = side ? copy[side + '-day'] + ' · First unusual call at 3 a.m.' : initialLabel;
  }

  function loadStory(next) {
    version = next;
    clearReasoning();
    drawPlacement(null);
    get('reasoning').hidden = get('placement-feedback').hidden = true;
    get('callback').hidden = get('switch').hidden = get('restart').hidden = !next;
    get('hear').hidden = Boolean(next);
    get('hear').setAttribute('aria-expanded', String(Boolean(next)));
    get('map-hint').textContent = next ? 'Tap the day of the first unusual call.' : initialHint;
    get('caller').textContent = next ? copy[next + '-label'] : '';
    get('quote').textContent = next ? copy[next + '-quote'] : '';
    get(next ? 'caller' : 'hear').focus();
    get('status').textContent = next ? 'New callback. Place the first unusual call on the timeline.' : 'Started again.';
  }

  get('hear').addEventListener('click', () => loadStory('before'));
  get('switch').addEventListener('click', () => loadStory(version === 'before' ? 'after' : 'before'));
  get('restart').addEventListener('click', () => loadStory(null));
  for (const side of dates) get('place-' + side).addEventListener('click', () => {
    clearReasoning();
    const correct = side === version;
    drawPlacement(correct ? side : null);
    get('reasoning').hidden = !correct;
    get('placement-feedback').hidden = correct;
    get('placement-feedback').textContent = correct ? '' : copy[version + '-coached'];
    if (correct) {
      get('status').textContent = copy[side + '-day'] + ' placed. Choose how that changes your differential.';
      get('rh').focus();
    }
  });
  for (const reason of reasons) get('reason-' + reason).addEventListener('click', () => {
    clearNote();
    select('reason', reasons, reason);
    const fits = version === reason;
    get('reason-feedback').hidden = fits;
    get('next-step').hidden = !fits;
    get('reason-feedback').textContent = fits ? '' : copy[reason === 'certain' ? 'overclaim' : version + '-mismatch'];
    if (fits) get('nh').focus();
  });
  for (const question of questions) get('check-' + question).addEventListener('click', () => {
    select('check', questions, question);
    get('note').textContent = '“' + [copy.intro, copy[version + '-interpretation'], copy[question]].join(' ') + '”';
    get('sample').hidden = false;
    get('sh').focus();
  });
}

function fdMountEveningCalls(body) {
  const card = body.querySelector('#evening-calls');
  if (!card || card.dataset.mounted) return;
  card.dataset.mounted = 'true';
  const find = id => card.querySelector('#ec-' + id);
  const copy = Object.fromEntries(Array.from(find('copy').content.children,
    item => [item.dataset.copy, item.textContent]));
  const calls = ['before', 'week'];
  const heard = new Set();
  const initialLabel = find('annotation-before').textContent;
  let current = null;

  function drawCalls() {
    for (const call of calls) {
      const open = call === current;
      const button = find('call-' + call);
      button.setAttribute('aria-expanded', String(open));
      button.dataset.heard = String(heard.has(call));
      button.querySelector('.symbol').textContent = open ? '−' : '+';
      find('quote-' + call).hidden = !open;
      find('annotation-' + call).textContent = heard.has(call) ? copy[call] : initialLabel;
    }
    find('count').textContent = heard.size + ' of 2 heard';
    find('meaning-panel').hidden = heard.size !== calls.length;
    find('reset').hidden = heard.size === 0;
  }

  function press(group, key) {
    for (const button of group.querySelectorAll('button[aria-pressed]')) {
      button.setAttribute('aria-pressed', String(button.id === 'ec-' + key));
    }
  }
  function clearRounds() {
    press(find('rounds-panel'), null);
    find('feedback').hidden = find('sample').hidden = true;
    find('feedback').textContent = '';
  }

  for (const call of calls) find('call-' + call).addEventListener('click', () => {
    heard.add(call);
    current = current === call ? null : call;
    drawCalls();
    const transcript = current ? find('quote-' + current).innerText + ' ' : '';
    find('status').textContent = transcript + find('count').textContent +
      (heard.size === calls.length ? '. Choose a follow-up question below.' : '.');
  });

  for (const ask of ['ask-fewer', 'ask-miss']) find(ask).addEventListener('click', () => {
    clearRounds();
    press(find('meaning-panel'), ask);
    find('meaning-words').textContent = copy[ask];
    find('meaning-reply').hidden = false;
    const heardMeaning = ask === 'ask-miss';
    find('retry').hidden = heardMeaning;
    find('rounds-panel').hidden = !heardMeaning;
    find('status').textContent = copy[ask] + ' ' +
      (heardMeaning ? 'The rounds choices are available below.' : find('retry').textContent);
  });

  for (const line of ['line-fewer', 'line-role', 'line-conflict']) find(line).addEventListener('click', () => {
    press(find('rounds-panel'), line);
    const grounded = line === 'line-role';
    find('sample').hidden = !grounded;
    find('feedback').hidden = grounded;
    find('feedback').textContent = grounded ? '' : copy[line];
  });

  find('reset').addEventListener('click', () => {
    current = null;
    heard.clear();
    drawCalls();
    clearRounds();
    press(find('meaning-panel'), null);
    find('meaning-words').textContent = '';
    find('meaning-reply').hidden = find('retry').hidden = find('rounds-panel').hidden = true;
    find('status').textContent = 'Started again. Choose either evening call.';
    find('call-before').focus();
  });
}

function fdMountDinnerMap(body) {
  const card = body.querySelector('#dinner-map');
  if (!card || card.dataset.mounted) return;
  card.dataset.mounted = 'true';
  const find = id => card.querySelector('#dm-' + id);
  const copy = Object.fromEntries(Array.from(find('copy').content.querySelectorAll('[data-copy]'),
    piece => [piece.dataset.copy, piece.textContent]));
  const stops = ['route', 'kitchen', 'dinner'];
  const claims = ['requested', 'confirmed'];
  const replies = ['pending', 'ready'];
  const initialPrompt = find('evidence').textContent;
  const heard = new Set();
  let report = null;

  function drawMap() {
    find('pin-pantry').hidden = find('pin-home').hidden = !heard.has('route');
    find('pin-kitchen').hidden = !heard.has('kitchen');
    const meal = find('pin-meal');
    meal.hidden = !heard.has('dinner');
    meal.textContent = meal.dataset[report || 'requested'];
    meal.classList.toggle('dm-verified', report === 'ready');
    find('count').textContent = find('count').dataset.format.replace('{n}', heard.size);
    find('reset').hidden = heard.size === 0;
    find('handoff').hidden = heard.size !== stops.length;
  }

  function clearClaim() {
    claims.forEach(key => find('claim-' + key).setAttribute('aria-pressed', 'false'));
    for (const id of ['claim-feedback', 'team-note']) find(id).hidden = true;
    find('claim-feedback').textContent = find('note-text').textContent = '';
  }

  function enableClaims(enabled) {
    claims.forEach(key => { find('claim-' + key).disabled = !enabled; });
  }

  function ask(key) {
    const open = find('quote-' + key).hidden;
    heard.add(key);
    for (const stop of stops) {
      const active = open && stop === key;
      find('stop-' + stop).setAttribute('aria-expanded', String(active));
      find('quote-' + stop).hidden = !active;
    }
    find('map-' + key).textContent = find('map-' + key).dataset.fact;
    find('stop-' + key).closest('li').classList.add('dm-heard');
    drawMap();
    find('announce').textContent = find('count').textContent +
      (heard.size === stops.length ? '. The handoff is available below.' : '.');
  }

  function chooseClaim(key) {
    clearClaim();
    find('claim-' + key).setAttribute('aria-pressed', 'true');
    if ((key === 'confirmed') !== (report === 'ready')) {
      find('claim-feedback').textContent = copy['feedback-' + (report || 'requested')];
      find('claim-feedback').hidden = false;
      return;
    }
    find('note-text').textContent = copy.account + ' ' + copy[report ? report + '-summary' : 'requested'];
    find('team-note').hidden = false;
    find('call-unit').hidden = !find('callback').hidden;
  }

  function hearCallback(key) {
    clearClaim();
    report = key;
    drawMap();
    enableClaims(true);
    replies.forEach(reply => find('reply-' + reply).setAttribute('aria-pressed', String(reply === key)));
    find('nurse-quote').textContent = copy[key + '-quote'];
    find('nurse-report').hidden = false;
    find('evidence').textContent = copy['after-call'];
    find('announce').textContent = copy[key + '-quote'] + ' Revise the handoff below.';
  }

  stops.forEach(key => find('stop-' + key).addEventListener('click', () => ask(key)));
  claims.forEach(key => find('claim-' + key).addEventListener('click', () => chooseClaim(key)));
  replies.forEach(key => find('reply-' + key).addEventListener('click', () => hearCallback(key)));
  find('call-unit').addEventListener('click', () => {
    clearClaim();
    enableClaims(false);
    find('evidence').textContent = copy['await-call'];
    find('callback').hidden = false;
    find('call-unit').hidden = true;
    find('call-unit').setAttribute('aria-expanded', 'true');
    find('reply-pending').focus();
  });
  find('reset').addEventListener('click', () => {
    heard.clear();
    report = null;
    drawMap();
    clearClaim();
    enableClaims(true);
    for (const key of stops) {
      find('map-' + key).textContent = '';
      find('stop-' + key).closest('li').classList.remove('dm-heard');
      find('stop-' + key).setAttribute('aria-expanded', 'false');
      find('quote-' + key).hidden = true;
    }
    for (const id of ['call-unit', 'callback', 'nurse-report']) find(id).hidden = true;
    replies.forEach(key => find('reply-' + key).setAttribute('aria-pressed', 'false'));
    find('call-unit').setAttribute('aria-expanded', 'false');
    find('evidence').textContent = initialPrompt;
    find('nurse-quote').textContent = '';
    find('announce').textContent = 'Started again. The evening map is empty.';
    find('stop-route').focus();
  });
}

function fdMountTherapyChain(body) {
  const card = body.querySelector('#therapy-chain');
  if (!card || card.dataset.mounted) return;
  card.dataset.mounted = 'true';
  const find = id => card.querySelector('#tc-' + id);
  const slots = Array.from(card.querySelectorAll('[data-slot]'));
  const moments = card.querySelectorAll('[data-moment]');
  const prompts = slots.map(slot => slot.querySelector('[data-link-text]').textContent);
  const completed = new Set();
  let activeSlot;
  let chosenMoment;

  function getTemplate(kind, key) {
    return find(kind + '-' + key).content;
  }
  function press(buttons, selected) {
    for (const button of buttons) button.setAttribute('aria-pressed', String(button === selected));
  }
  function showOptions(group, template) {
    const buttons = template.querySelector('[data-' + group + ']').children;
    find(group).replaceChildren(...Array.from(buttons, button => button.cloneNode(true)));
  }
  function drawMap() {
    slots.forEach((slot, index) => {
      const key = slot.dataset.slot;
      const complete = completed.has(key);
      const record = getTemplate('link', key);
      slot.setAttribute('aria-expanded', String(slot === activeSlot));
      slot.dataset.filled = String(complete);
      slot.querySelector('.tc-symbol').textContent = complete ? '✓' : '＋';
      slot.querySelector('.case-kicker').textContent =
        (complete ? 'Patient · ' : 'Missing link · ') + record.querySelector('[data-name]').textContent;
      slot.querySelector('[data-link-text]').textContent = complete ? record.querySelector('[data-saved]').textContent : prompts[index];
    });
    find('count').textContent = find('count').dataset.format.replace('{n}', completed.size);
  }
  function clearAnswer() {
    for (const id of ['reply', 'add-link', 'fill-feedback']) find(id).hidden = true;
    find('answer').textContent = find('fill-feedback').textContent = '';
    find('fills').replaceChildren();
  }
  function clearOffer() {
    chosenMoment = null;
    press(moments, null);
    for (const id of ['offer-script', 'offer-reply', 'debrief', 'try-moment']) find(id).hidden = true;
    for (const id of ['offer-line', 'their-preference', 'plan-summary']) find(id).textContent = '';
    find('make-offer').hidden = false;
  }
  function closeInterview() {
    activeSlot = null;
    find('interview').hidden = true;
    clearAnswer();
    drawMap();
    find('offer').hidden = completed.size !== slots.length;
  }
  function hear(question) {
    const record = getTemplate('link', activeSlot.dataset.slot);
    const invited = question.dataset.question === 'invite';
    press(find('questions').children, question);
    find('answer').textContent = record.querySelector(invited ? '[data-reply]' : '[data-correction]').textContent;
    find('reply').hidden = false;
    find('fill-feedback').hidden = true;
    find('add-link').hidden = !invited;
    if (invited) showOptions('fills', record);
  }
  for (const slot of slots) slot.addEventListener('click', () => {
    activeSlot = slot;
    const record = getTemplate('link', slot.dataset.slot);
    clearOffer();
    clearAnswer();
    drawMap();
    find('offer').hidden = true;
    find('interview').hidden = find('reset').hidden = false;
    find('interview-title').textContent = record.querySelector('[data-title]').textContent;
    showOptions('questions', record);
    if (completed.has(slot.dataset.slot)) hear(find('questions').querySelector('[data-question="invite"]'));
    fdBedsideFocus(find('interview-title'));
  });
  find('questions').addEventListener('click', event => {
    const button = event.target.closest('[data-question]');
    if (button && activeSlot) hear(button);
  });
  find('fills').addEventListener('click', event => {
    const button = event.target.closest('[data-fill]');
    if (!button || !activeSlot) return;
    const key = activeSlot.dataset.slot;
    const record = getTemplate('link', key);
    press(find('fills').children, button);
    if (button.dataset.fill === 'inferred') {
      find('fill-feedback').hidden = false;
      find('fill-feedback').textContent = record.querySelector('[data-feedback]').textContent;
      return;
    }
    completed.add(key);
    closeInterview();
    find('announce').textContent = record.querySelector('[data-saved]').textContent + ' ' + find('count').textContent;
    fdBedsideFocus(slots.find(slot => !completed.has(slot.dataset.slot)) || find('offer-title'));
  });
  find('back').addEventListener('click', () => {
    const previous = activeSlot;
    closeInterview();
    fdBedsideFocus(previous);
  });
  for (const moment of moments) moment.addEventListener('click', () => {
    clearOffer();
    chosenMoment = getTemplate('moment', moment.dataset.moment);
    press(moments, moment);
    find('offer-line').textContent = chosenMoment.querySelector('[data-line]').textContent;
    find('offer-script').hidden = false;
  });
  find('make-offer').addEventListener('click', () => {
    if (!chosenMoment || completed.size !== slots.length) return;
    find('their-preference').textContent = chosenMoment.querySelector('[data-reply]').textContent;
    find('plan-summary').textContent = chosenMoment.querySelector('[data-plan]').textContent;
    for (const id of ['offer-reply', 'debrief', 'try-moment']) find(id).hidden = false;
    find('make-offer').hidden = true;
    fdBedsideFocus(find('offer-reply'));
  });
  find('try-moment').addEventListener('click', () => {
    clearOffer();
    fdBedsideFocus(moments[0]);
  });
  find('reset').addEventListener('click', () => {
    completed.clear();
    clearOffer();
    closeInterview();
    find('reset').hidden = true;
    find('announce').textContent = find('count').textContent;
    fdBedsideFocus(slots[0]);
  });
}

function fdMountElenaVisit(body) {
  const card = body.querySelector('#elena-visit');
  if (!card || card.dataset.mounted) return;
  card.dataset.mounted = 'true';

  const find = selector => card.querySelector(selector);
  const openings = card.querySelectorAll('[data-ei-opening]');
  const questions = card.querySelectorAll('[data-ei-question]');
  const crop = find('.ei-crop'), art = crop.querySelector('img'), initialAlt = art.alt;
  const exchange = find('#ei-exchange'), speaker = find('#ei-speaker'), line = find('#ei-line');
  const next = find('#ei-next'), nextLabel = next.textContent, followup = find('#ei-followup');
  const reply = find('#ei-reply'), rounds = find('#ei-rounds'), note = find('#ei-note');
  const status = find('#ei-status');
  let turns = [], position = 0;

  function select(buttons, selected) {
    for (const button of buttons) button.setAttribute('aria-pressed', String(button === selected));
  }

  function clearReply() {
    select(questions, null);
    reply.hidden = true;
    rounds.open = false;
    find('#ei-answer').textContent = note.textContent = '';
  }

  function renderTurn() {
    const turn = turns[position];
    const last = position === turns.length - 1;
    crop.dataset.view = turn.dataset.view;
    art.alt = art.dataset[turn.dataset.view];
    speaker.textContent = turn.dataset.speaker;
    line.textContent = turn.textContent;
    line.lang = turn.lang || 'en';
    find('#ei-count').textContent = (position + 1) + ' of ' + turns.length;
    next.textContent = turn.hasAttribute('data-repair') ? next.dataset.repair : nextLabel;
    next.hidden = last;
    exchange.hidden = false;
    followup.hidden = !last;
    status.textContent = speaker.textContent + '. ' + line.textContent;
    if (last) find('#ei-follow-title').focus({preventScroll:true});
  }

  for (const button of openings) button.addEventListener('click', () => {
    const path = find('template[data-ei-path="' + button.dataset.eiOpening + '"]').content;
    turns = [...path.children, find('[data-ei-last]').content.firstElementChild];
    position = 0;
    select(openings, button);
    clearReply();
    renderTurn();
    next.focus({preventScroll:true});
    exchange.scrollIntoView({block:'nearest'});
  });

  next.addEventListener('click', () => {
    if (position + 1 < turns.length) {
      position++;
      renderTurn();
    }
  });

  for (const button of questions) button.addEventListener('click', () => {
    const answer = find('template[data-ei-answer="' + button.dataset.eiQuestion + '"]').content;
    select(questions, button);
    rounds.open = false;
    find('#ei-answer').textContent = answer.querySelector('blockquote').textContent;
    note.textContent = answer.querySelector('p').textContent;
    reply.hidden = false;
    status.textContent = find('#ei-answer').textContent;
  });

  find('#ei-reset').addEventListener('click', () => {
    turns = [];
    position = 0;
    select(openings, null);
    clearReply();
    exchange.hidden = followup.hidden = true;
    crop.dataset.view = 'direct';
    art.alt = initialAlt;
    speaker.textContent = line.textContent = status.textContent = '';
    fdBedsideFocus(openings[0]);
  });
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

function fdMountLangCulture(body) {
  const card = body.querySelector('[data-lang-culture]');
  if (!card || card.dataset.mounted) return;
  card.dataset.mounted = 'true';

  const field = name => card.querySelector('#lang-' + name);
  const visits = Array.from(card.querySelectorAll('button[data-visit]'));
  const questions = Array.from(field('questions').querySelectorAll('button[data-ask]'));
  const options = field('options');
  const feedback = field('feedback');
  const comparison = field('compare');
  const histories = new Map();
  let account;
  let history;

  function update() {
    const matched = Array.from(histories.values()).filter(item => item.matched).length;
    field('progress').textContent = matched + ' of ' + visits.length + ' handoffs matched';
    comparison.hidden = matched !== visits.length;
    if (comparison.hidden) comparison.open = false;
    if (!history) return;

    for (const question of questions) {
      const key = question.dataset.ask;
      const answer = account.querySelector('[data-reply="' + key + '"]');
      question.setAttribute('aria-pressed', String(history.last === key));
      question.querySelector('.lang-tag').textContent = history.heard.has(key) ? answer.dataset.label : 'Ask';
    }
    field('reply').hidden = !history.last;
    field('words').textContent = history.last ? account.querySelector('[data-reply="' + history.last + '"]').textContent : '';
    field('handoffs').hidden = history.heard.size !== questions.length;
    for (const button of options.children) {
      button.setAttribute('aria-pressed', String(button.dataset.choice === history.choice));
    }
    feedback.hidden = history.choice === null;
    feedback.textContent = feedback.hidden ? '' : account.querySelector('[data-coaching="' + history.choice + '"]').textContent;
    feedback.dataset.fit = String(history.matched);
    field('other').hidden = feedback.hidden || !comparison.hidden;
  }

  function enter(visit) {
    const key = visit.dataset.visit;
    if (!histories.has(key)) histories.set(key, { heard: new Set(), last: null, choice: null, matched: false });
    account = card.querySelector('template[data-account="' + key + '"]').content;
    history = histories.get(key);
    for (const tab of visits) tab.setAttribute('aria-pressed', String(tab === visit));
    field('interview-title').textContent = visit.textContent + ' · At the bedside';
    const otherVisit = visits.find(tab => tab !== visit);
    field('other').textContent = 'Open interview ' + otherVisit.dataset.visit.toUpperCase();
    options.replaceChildren(...account.querySelector('[data-handoffs]').cloneNode(true).children);
    field('interview').hidden = false;
    update();
    field('interview-title').focus();
  }

  for (const visit of visits) visit.addEventListener('click', () => enter(visit));
  for (const question of questions) question.addEventListener('click', () => {
    history.last = question.dataset.ask;
    history.heard.add(history.last);
    update();
  });
  options.addEventListener('click', event => {
    const choice = event.target.closest('button[data-choice]');
    if (!choice || field('handoffs').hidden) return;
    history.choice = choice.dataset.choice;
    history.matched = choice.hasAttribute('data-matched');
    update();
  });
  field('other').addEventListener('click', () => enter(visits.find(tab => tab.getAttribute('aria-pressed') === 'false')));
  card.querySelector('[data-reset]').addEventListener('click', () => {
    histories.clear();
    history = account = null;
    for (const tab of visits) tab.setAttribute('aria-pressed', 'false');
    field('interview').hidden = field('reply').hidden = field('handoffs').hidden = feedback.hidden = true;
    options.replaceChildren();
    field('words').textContent = feedback.textContent = '';
    update();
    visits[0].focus();
  });
}

function fdMountCatieStop(body) {
  const card = body.querySelector('#catie-stop');
  if (!card || card.dataset.mounted) return;
  card.dataset.mounted = 'true';

  const field = id => card.querySelector('#catie-' + id);
  const patients = Array.from(card.querySelectorAll('button[data-patient]'));
  const handoffs = field('handoffs');
  const feedback = field('feedback');
  const compare = field('compare');
  const answers = new Map();
  const visited = new Set();
  let active = null;
  let account = null;

  function updateResults() {
    const matched = Array.from(answers.values()).filter(answer => answer.matched).length;
    field('progress').textContent = matched + ' of ' + patients.length + ' handoffs matched';
    compare.hidden = matched !== patients.length;
    if (compare.hidden) compare.open = false;
    const answer = answers.get(active);
    for (const button of handoffs.children) {
      button.setAttribute('aria-pressed', String(button.dataset.choice === answer?.choice));
    }
    feedback.hidden = !answer;
    feedback.dataset.supported = String(Boolean(answer?.matched));
    feedback.textContent = answer ? account.querySelector('[data-explanation="' + answer.choice + '"]').textContent : '';
    field('other').hidden = !answer || !compare.hidden;
  }

  function renderPatientButtons() {
    for (const button of patients) {
      const key = button.dataset.patient;
      const isActive = key === active;
      button.setAttribute('aria-pressed', String(isActive));
      const state = button.querySelector('.ct-open-state');
      state.textContent = isActive ? 'Open now' : visited.has(key) ? 'Revisit' : 'Open interview';
    }
  }

  function openInterview(key) {
    active = key;
    visited.add(key);
    account = card.querySelector('template[data-interview="' + key + '"]').content;
    renderPatientButtons();
    field('overnight').textContent = account.querySelector('[data-note]').textContent;
    field('quote').textContent = account.querySelector('[data-account]').textContent;
    field('interview-title').textContent = 'Patient ' + key.toUpperCase() + '’s account';
    field('other').textContent = 'Open Patient ' + (key === 'a' ? 'B' : 'A') + '’s interview';
    handoffs.replaceChildren(...account.querySelector('[data-options]').cloneNode(true).children);
    field('interview').hidden = false;
    updateResults();
    field('interview-title').focus();
  }

  for (const patient of patients) patient.addEventListener('click', () => openInterview(patient.dataset.patient));
  handoffs.addEventListener('click', event => {
    const button = event.target.closest('button[data-choice]');
    if (!button || !active) return;
    answers.set(active, {choice: button.dataset.choice, matched: button.hasAttribute('data-matched')});
    updateResults();
  });
  field('other').addEventListener('click', () => openInterview(active === 'a' ? 'b' : 'a'));
  card.querySelector('[data-reset]').addEventListener('click', () => {
    active = null;
    account = null;
    answers.clear();
    visited.clear();
    field('interview').hidden = true;
    field('overnight').textContent = field('quote').textContent = '';
    handoffs.replaceChildren();
    renderPatientButtons();
    updateResults();
    patients[0].focus();
  });
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

function fdMountNicoCall(body) {
  const card = body.querySelector('#night-witness');
  if (!card || card.dataset.mounted) return;
  card.dataset.mounted = 'true';
  const find = selector => card.querySelector(selector);
  const bank = find('[data-nw-bank]');
  const answers = bank.content;
  const nights = [...card.querySelectorAll('[data-night]')];
  const questions = card.querySelectorAll('[data-ask]');
  const followups = card.querySelectorAll('[data-next]');
  const readings = card.querySelectorAll('[data-read]');
  const dial = find('#nw-dial').content;
  const rounds = find('#nw-rounds');
  const sample = find('#nw-sample');
  const reset = find('[data-reset]');
  const opened = new Set();
  let question, speaker, reading;

  const answerFor = night => answers.querySelector('[data-answer-for="' + night + '"]');
  const responseFor = person => answers.querySelector('[data-followup-for="' + person + '"]');
  for (const night of nights) {
    night.append(dial.cloneNode(true));
    const key = night.dataset.night;
    const observation = key === 'wed' ? responseFor('father') : answerFor(key);
    const {minutes, shape} = observation.dataset;
    const angle = Math.PI * (1 - Number(minutes) / 480);
    const mark = night.querySelector('[data-mark]');
    mark.setAttribute('transform', 'translate(' + (70 + 58 * Math.cos(angle)) + ' ' + (68 - 58 * Math.sin(angle)) + ')');
    mark.dataset.shape = shape;
  }

  function render() {
    const followup = speaker && responseFor(speaker);
    for (const night of nights) {
      const key = night.dataset.night;
      let observation = opened.has(key) && answerFor(key);
      if (key === 'wed' && speaker === 'father') observation = followup;
      night.querySelector('[data-mark]').toggleAttribute('hidden', !observation || !observation.hasAttribute('data-minutes'));
      night.querySelector('.nw-value').textContent = observation ? observation.dataset.time : bank.dataset.unasked;
      night.querySelector('.nw-kind').textContent = observation ? observation.dataset.source : '';
    }
    for (const button of questions) {
      button.dataset.heard = String(opened.has(button.dataset.ask));
      button.setAttribute('aria-pressed', String(question === button.dataset.ask));
    }
    const answer = question && answerFor(question);
    find('#nw-reply').hidden = !answer;
    find('#nw-label').textContent = answer ? answer.dataset.speaker : '';
    find('#nw-answer').textContent = answer ? answer.querySelector('blockquote').textContent : '';
    find('#nw-res').hidden = !answer;
    for (const button of followups) button.setAttribute('aria-pressed', String(button.dataset.next === speaker));
    find('#nw-consult').hidden = find('#nw-assess').hidden = !followup;
    find('#nw-who').textContent = followup ? followup.dataset.speaker : '';
    find('#nw-consult-answer').textContent = followup ? followup.querySelector('blockquote').textContent : '';
    for (const button of readings) button.setAttribute('aria-pressed', String(button.dataset.read === reading));
    let feedback = '';
    if (reading) {
      const options = answers.querySelectorAll('[data-coach-for="' + speaker + '-' + reading + '"]');
      feedback = [...options].find(option => !option.dataset.ifOpen || opened.has(option.dataset.ifOpen)).textContent;
    }
    find('#nw-feedback').textContent = feedback;
    find('#nw-feedback').hidden = rounds.hidden = !reading;
    rounds.open = false;
    sample.textContent = '';
    reset.disabled = !opened.size;
  }

  for (const button of questions) button.addEventListener('click', () => {
    question = button.dataset.ask;
    if (!opened.has(question)) reading = null;
    opened.add(question);
    render();
  });
  for (const button of followups) button.addEventListener('click', () => {
    if (speaker !== button.dataset.next) reading = null;
    speaker = button.dataset.next;
    render();
  });
  for (const button of readings) button.addEventListener('click', () => {
    reading = button.dataset.read;
    render();
  });
  rounds.querySelector('summary').addEventListener('click', () => {
    sample.textContent = '';
    if (!reading || rounds.open) return;
    const facts = nights.map(night => night.dataset.night).filter(key => opened.has(key))
      .map(key => answerFor(key).querySelector('p').textContent);
    const family = bank.dataset.patientFamily + ' ' + new Intl.ListFormat('en-US').format(facts) + '.';
    sample.textContent = [family, bank.dataset.uncertainty, responseFor(speaker).querySelector('p').textContent].join(' ');
  });
  reset.addEventListener('click', () => {
    opened.clear();
    question = speaker = reading = null;
    render();
    fdBedsideFocus(questions[0]);
  });
  render();
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
