/* The primer supplies the interview, clinical interpretations and evidence. */
function fdMountMorganExposure(body) {
  const root = body.querySelector('#morgan-exposure');
  if (!root || root.dataset.mounted) return;
  root.dataset.mounted = 'true';

  const find = selector => root.querySelector(selector);
  const all = selector => root.querySelectorAll(selector);
  const template = name => find('template[data-mg-template="' + name + '"]').content;
  const wording = template('copy');
  const copy = key => wording.querySelector('[data-copy="' + key + '"]').textContent;
  const history = new Set();
  const tracks = Array.from(all('[data-track]'));
  const emptyTracks = tracks.map(node => node.textContent);
  const exposureLabel = find('#mg-exposure-label');
  const initialLabel = exposureLabel.textContent;
  const notes = find('[data-notes]');
  const initialNotes = notes.textContent;
  const leading = find('#mg-leading');
  const alternate = find('#mg-alternate');
  const check = find('#mg-next-check');
  const debrief = find('[data-debrief]');
  const error = find('[data-error]');
  const status = find('[data-announcement]');
  let plan = '';

  function selectStage(name, moveFocus) {
    for (const stage of all('[data-stage]')) stage.setAttribute('aria-pressed', String(stage.dataset.stage === name));
    for (const scene of all('[data-scene]')) scene.hidden = scene.dataset.scene !== name;
    root.dataset.stage = name;
    if (moveFocus) fdBedsideFocus(find('[data-scene="' + name + '"] h4'));
  }

  function clearDebrief() {
    error.hidden = true;
    debrief.hidden = true;
    debrief.replaceChildren();
  }

  function recordHistory() {
    const exposures = [
      history.has('cigarettes') && copy('track-home'),
      history.has('last') && copy('track-unit'),
      plan && copy('track-' + plan)
    ];
    tracks.forEach((node, i) => {
      node.textContent = exposures[i] || emptyTracks[i];
      node.parentElement.classList.toggle('mg-known', Boolean(exposures[i]));
    });
    exposureLabel.textContent = history.has('future') || exposures.some(Boolean) ? 'Cigarette smoke' : initialLabel;
    const other = [...history].filter(key => !['cigarettes','last','future'].includes(key));
    if (!other.length) {
      notes.textContent = exposures.some(Boolean) ? 'Your smoking history appears on the timeline.' : initialNotes;
      return;
    }
    const list = document.createElement('ul');
    for (const key of other) {
      const item = document.createElement('li');
      item.textContent = copy('note-' + key);
      list.append(item);
    }
    notes.replaceChildren(list);
  }

  // Each of the two exposures can be missing independently.
  function pair(home, unit) {
    if (history.has(home)) return history.has(unit) ? 'both' : 'home';
    return history.has(unit) ? 'unit' : 'neither';
  }

  function evidence(key, followup) {
    const smoking = pair('cigarettes','last');
    if (key === 'unknown') {
      return smoking === 'both' ? copy('unknown-both') : copy('unknown') + ' ' + copy('smoke-' + smoking);
    }
    if (key === 'smoke') return copy((followup && smoking === 'both' ? 'check-smoke-' : 'smoke-') + smoking);
    if (key === 'adherence') return copy('adherence-' + pair('doses','meds'));
    if (key === 'level') return copy('check-level');
    const heard = history.has(key === 'sedative' ? 'meds' : 'illness');
    return copy((followup ? 'check-' : '') + key + (heard ? '-heard' : '-missing'));
  }

  function result(name, text) {
    const output = debrief.querySelector('[data-result="' + name + '"]');
    output.textContent = text;
    output.parentElement.hidden = !text;
  }

  function handoff() {
    const smoking = pair('cigarettes','last');
    const recorded = [...history].filter(key => !['future','contact','support'].includes(key));
    result('report', [copy('report'), ...recorded.map(key => copy('note-' + key))].join(' '));
    result('assessment', copy('handoff-smoke-' + smoking) + ' ' + copy('assessment'));
    result('safety', history.has('illness') ? template('question-illness').querySelector('[data-safety]').textContent : '');
    const transition = plan ? [copy('report-' + plan), copy((smoking === 'both' ? 'action-' : 'incomplete-') + plan)] : [copy('future-unknown')];
    for (const key of ['contact','support']) if (history.has(key)) transition.push(copy('note-' + key));
    result('transition', [...transition, copy('transition')].join(' '));
  }

  function commit() {
    const missing = [leading, alternate, check].find(select => !select.value);
    if (missing || leading.value === alternate.value) {
      error.textContent = missing ? 'Choose an answer for each of the three prompts.' : 'Choose a different possibility to keep in the differential.';
      error.hidden = false;
      fdBedsideFocus(missing || alternate);
      return;
    }
    error.hidden = true;
    debrief.replaceChildren(template('debrief').cloneNode(true));
    debrief.hidden = false;
    result('leading', evidence(leading.value, false));
    result('alternate', evidence(alternate.value, false));
    result('check', evidence(check.value, true));
    result('patch', history.has('patch') ? copy('patch') : '');
    const opening = [...history][0];
    result('opening', opening ? copy('why-' + opening) : '');
    const sources = debrief.querySelector('[data-blood-source]');
    if (history.has('illness')) sources.hidden = false;
    else sources.remove();
    // Programmatic expansion by printing or guide search must not simulate a handoff request.
    const sample = debrief.querySelector('[data-sample]');
    sample.querySelector('summary').addEventListener('click', () => {
      if (!sample.open) handoff();
    });
    fdBedsideFocus(debrief.querySelector('h4'));
  }

  function ask(question) {
    const key = question.dataset.ask;
    const answer = find('#' + question.getAttribute('aria-controls'));
    const opening = answer.hidden;
    question.setAttribute('aria-expanded', String(opening));
    answer.hidden = !opening;
    if (!opening) return;
    if (!answer.hasChildNodes()) answer.append(template('question-' + key).cloneNode(true));
    if (!history.has(key)) {
      history.add(key);
      clearDebrief();
      recordHistory();
    }
    const reply = answer.querySelector('blockquote');
    status.textContent = reply ? reply.textContent + (key === 'illness' ? ' ' + answer.querySelector('[data-safety]').textContent : '') : 'Choose one possible reply from Morgan.';
  }

  for (const button of all('[data-stage]')) button.addEventListener('click', () => selectStage(button.dataset.stage, true));
  for (const button of all('[data-ask]')) button.addEventListener('click', () => ask(button));
  for (const button of all('[data-next]')) button.addEventListener('click', () => {
    if (button.dataset.next === 'assessment') fdBedsideFocus(leading);
    else selectStage(button.dataset.next, true);
  });
  for (const select of [leading, alternate, check]) select.addEventListener('change', clearDebrief);
  root.addEventListener('change', event => {
    if (!event.target.matches('input[name="mg-future-plan"]')) return;
    plan = event.target.value;
    clearDebrief();
    recordHistory();
    status.textContent = copy('report-' + plan);
  });
  find('[data-commit]').addEventListener('click', commit);
  find('[data-reset]').addEventListener('click', () => {
    history.clear();
    plan = '';
    for (const field of [leading, alternate, check]) field.value = '';
    for (const question of all('[data-ask]')) {
      question.setAttribute('aria-expanded','false');
      const answer = find('#' + question.getAttribute('aria-controls'));
      answer.hidden = true;
      answer.replaceChildren();
    }
    clearDebrief();
    recordHistory();
    selectStage('home', false);
    fdBedsideFocus(find('[data-stage="home"]'));
    status.textContent = 'Case restarted. Questions, assessment and discharge plan cleared.';
  });
  selectStage('home', false);
}
