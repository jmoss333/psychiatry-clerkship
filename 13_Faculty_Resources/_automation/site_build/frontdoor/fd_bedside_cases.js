/* The clinical text lives with its reading. Each mounted exercise keeps its choices in the DOM. */
function fdMountBedsideCases(body) {
  fdMountJoCall(body);
  fdMountLeeTimeline(body);
  fdMountEctMemory(body);
  fdMountRaeReturnVisit(body);
  fdMountImaniGrounding(body);
}

function fdBedsideFocus(control) {
  const section = control.closest('.sec-c');
  if (section && !section.classList.contains('open')) section.querySelector('.sec-h button').click();
  control.focus({preventScroll: true});
  control.scrollIntoView({block: 'center'});
}

function fdMountImaniGrounding(body) {
  const bedside = body.querySelector('#imani-grounding');
  const handoff = body.querySelector('#imani-handoff');
  if (!bedside || !handoff || bedside.dataset.mounted) return;
  bedside.dataset.mounted = 'true';

  const choices = bedside.querySelectorAll('[data-preference]');
  const reports = handoff.querySelectorAll('[data-report]');
  const listen = bedside.querySelector('[data-listen]');
  const listenLabel = listen.textContent;
  const ready = handoff.querySelector('[data-ready]');
  let branch;

  function selectReport(selected) {
    for (const report of reports) report.setAttribute('aria-pressed', String(report === selected));
    const matches = selected && selected.dataset.report === branch.dataset.branch;
    handoff.querySelector('[data-handoff]').hidden = !matches;
    handoff.querySelector('[data-sample]').textContent = matches ? branch.content.querySelector('[data-report]').textContent : '';
    const feedback = handoff.querySelector('[data-feedback]');
    feedback.textContent = '';
    if (selected) feedback.textContent = matches ? 'That matches Imani’s words.' : 'Read Imani’s last line again. What did Imani actually tell you?';
  }

  function showReply(heard) {
    listen.setAttribute('aria-expanded', String(heard));
    listen.textContent = heard ? 'Hide Imani’s response' : listenLabel;
    bedside.querySelector('#imani-after').hidden = !heard;
    bedside.querySelector('[data-after]').textContent = heard ? branch.content.querySelector('[data-reply]').textContent : '';
    bedside.querySelector('[data-follow]').textContent = heard ? branch.content.querySelector('[data-follow]').textContent : '';
    ready.hidden = !heard;
    handoff.querySelector('[data-locked]').hidden = heard;
    selectReport(null);
  }

  for (const choice of choices) choice.addEventListener('click', () => {
    if (choice.getAttribute('aria-pressed') === 'true') return;
    for (const option of choices) option.setAttribute('aria-pressed', String(option === choice));
    branch = bedside.querySelector('template[data-branch="' + choice.dataset.preference + '"]');
    bedside.querySelector('[data-line]').textContent = branch.content.querySelector('[data-line]').textContent;
    bedside.querySelector('#imani-turn').hidden = false;
    showReply(false);
  });
  listen.addEventListener('click', () => showReply(listen.getAttribute('aria-expanded') !== 'true'));
  for (const report of reports) report.addEventListener('click', () => selectReport(report));
  bedside.querySelector('[data-next]').addEventListener('click', () => fdBedsideFocus(reports[0]));
  handoff.querySelector('[data-back]').addEventListener('click', () => {
    fdBedsideFocus(bedside.querySelector('[data-preference][aria-pressed="true"]') || choices[0]);
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
