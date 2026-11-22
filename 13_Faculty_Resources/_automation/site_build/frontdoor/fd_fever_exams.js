/* A pinned exam and that patient's opened histories are the evidence for the debrief. */
function fdMountFeverExams(body) {
  const card = body.querySelector('#febrile-exam-pair');
  if (!card || card.dataset.mounted) return;
  card.dataset.mounted = 'true';
  const el = id => card.querySelector('#fp-' + id);
  const copy = key => card.querySelector('[data-fp-text="' + key + '"]').textContent;
  const patients = {taye:'Taye', ana:'Ana'};
  const draft = () => ({lead:'', rival:'', prediction:'', committed:false});
  let region, pinned, heard, expanded, choice;
  function reset() {
    region = pinned = null;
    heard = new Set();
    expanded = new Set();
    choice = draft();
  }
  function ready() {
    return !!(pinned && choice.lead && choice.rival && choice.lead !== choice.rival && choice.prediction);
  }
  function discuss() {
    const key = pinned.key, name = patients[key], flags = new Set([key,pinned.region]);
    const med = heard.has(key + '-med'), ward = heard.has(key + '-ward');
    if (med) flags.add('med');
    if (ward) flags.add('ward');
    function interpretation(dx) {
      const rows = Array.from(card.querySelectorAll('[data-dx="' + dx + '"]'));
      return rows.find(row => row.dataset.when.split(' ').filter(Boolean).every(flag => flags.has(flag))).textContent;
    }
    el('result-title').textContent = 'Reconsider ' + name + '’s case';
    el('leading-line').textContent = 'Your leading explanation. ' + interpretation(choice.lead);
    el('rival-line').textContent = 'Your alternative. ' + interpretation(choice.rival);
    const radio = el('prediction-choices').querySelector('input:checked');
    const predictionFit = !radio.dataset.favors ? 'This update has limited diagnostic weight.' :
      radio.dataset.favors === choice.rival ? 'That update would strengthen your alternative.' : 'That update would favor a different explanation.';
    el('prediction-line').textContent = predictionFit + ' ' + copy('update-' + choice.prediction);
    const handoff = [name + ' is febrile and confused. On exam, ' + copy(key + '-' + pinned.region + '-short') + '.'];
    if (med) handoff.push(copy(key + '-med'));
    if (ward) handoff.push(copy(key + '-nurse'));
    handoff.push(interpretation('handoff'));
    if (ward && key === 'taye') handoff.push(copy('taye-infection'));
    el('sample').textContent = '“' + handoff.join(' ') + '”';
  }
  function render() {
    for (const button of card.querySelectorAll('[data-region]')) {
      button.setAttribute('aria-pressed',String(region === button.dataset.region));
    }
    el('intro').hidden = !!region;
    for (const [key,name] of Object.entries(patients)) {
      const finding = el(key + '-finding'), pin = card.querySelector('[data-pin="' + key + '"]');
      finding.hidden = pin.hidden = !region;
      finding.textContent = region ? copy(key + '-' + region) : '';
      const selected = pinned?.key === key && pinned.region === region;
      pin.setAttribute('aria-pressed',String(selected));
      pin.textContent = selected ? 'Pinned for discussion' : 'Pin ' + name + '’s finding';
      for (const source of ['med','ward']) {
        const id = key + '-' + source, panel = el(id), open = expanded.has(id);
        const button = card.querySelector('[data-' + source + '="' + key + '"]');
        button.setAttribute('aria-expanded',String(open));
        if (source === 'med') button.textContent = !open && heard.has(id) ? 'Reread medication history' : 'Medication history';
        else button.textContent = !open && heard.has(id) ? 'Reread nurse’s report' : 'Ask the bedside nurse';
        panel.hidden = !open;
        panel.textContent = open ? copy(id) : '';
      }
    }
    el('guide').hidden = !!pinned;
    el('task').hidden = !pinned;
    el('choice').textContent = pinned ? patients[pinned.key] + ' · ' + copy(pinned.key + '-' + pinned.region + '-short') + '.' : '';
    el('lead').value = choice.lead;
    el('rival').value = choice.rival;
    for (const option of el('rival').options) option.disabled = !!choice.lead && option.value === choice.lead;
    for (const radio of el('prediction-choices').querySelectorAll('input')) radio.checked = radio.value === choice.prediction;
    el('commit').disabled = !ready();
    el('status').textContent = !choice.lead || !choice.rival ? 'Choose a lead and an alternative.' :
      !choice.prediction ? 'Choose the update you would look for.' : choice.committed ? 'Reasoning discussed below.' : '';
    el('result').hidden = !(ready() && choice.committed);
    if (!el('result').hidden) discuss();
    else {
      el('report').open = el('evidence').open = false;
      for (const id of ['sample','leading-line','rival-line','prediction-line']) el(id).textContent = '';
    }
  }
  card.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.region) region = button.dataset.region;
    else if (button.dataset.pin && region) {
      if (pinned?.key !== button.dataset.pin || pinned.region !== region) {
        pinned = {key:button.dataset.pin,region};
        choice = draft();
      }
    } else if (button.dataset.med || button.dataset.ward) {
      const key = button.dataset.med || button.dataset.ward;
      const id = key + (button.dataset.med ? '-med' : '-ward');
      if (expanded.has(id)) expanded.delete(id);
      else expanded.add(id);
      if (!heard.has(id) && key === pinned?.key) choice.committed = false;
      heard.add(id);
    } else if (button === el('commit') && ready()) choice.committed = true;
    else if (button === el('reset')) reset();
    else return;
    render();
    if (button === el('reset')) fdBedsideFocus(card.querySelector('.tools [data-region]'));
  });
  card.addEventListener('change', event => {
    const field = event.target;
    if (field === el('lead')) {
      choice.lead = field.value;
      if (choice.rival === field.value) choice.rival = choice.prediction = '';
    } else if (field === el('rival')) {
      choice.rival = field.value;
      choice.prediction = '';
    } else if (field.name === 'fp-what-if') choice.prediction = field.value;
    else return;
    choice.committed = false;
    render();
  });
  reset();
  render();
}
