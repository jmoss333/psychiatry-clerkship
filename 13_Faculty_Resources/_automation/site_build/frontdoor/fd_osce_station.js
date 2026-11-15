/* Each station projects named sections of the OSCE guide onto role cards.
   Clinical facts, timing and debrief questions come from that reading. */
var FD_OSCE_STATIONS = {
  'suicide-risk-collateral': {
    title: 'Suicide risk with collateral hesitation',
    heading: 'Station 1 - Suicide Risk With Collateral Hesitation',
    timing: /^(\d+) minutes encounter, (\d+) minutes summary, (\d+) minutes feedback\.$/,
    phases: ['Patient encounter', 'Risk summary', 'Feedback'],
    roles: {
      interviewer: {label: 'Interviewer', fields: ['Interviewer role']},
      patient: {label: 'Patient', fields: ['Patient role']},
      sibling: {label: 'Sibling', fields: ['Sibling role']}
    },
    debriefField: 'Handoff debrief'
  },
  capacity: {
    title: 'Capacity to refuse medical treatment',
    heading: 'Station 2 - Capacity To Refuse Medical Treatment',
    timing: /^(\d+) minutes encounter, (\d+) minutes oral capacity summary\.$/,
    phases: ['Interview', 'Oral summary'],
    roles: {
      interviewer: {label: 'Interviewer', fields: ['Student task']},
      patient: {label: 'Patient', instruction: 'Play the patient described below. Ask the facilitator about any detail outside the brief.', fields: ['Patient brief']},
      observer: {label: 'Observer', instruction: 'Watch the interview and oral summary. Be ready to describe one specific example in the debrief.', fields: ['Behaviors to practice', 'Rater focus']}
    }
  },
  'possible-catatonia': {
    title: 'Possible catatonia',
    heading: 'Station 3 - Possible Catatonia',
    timing: /^(\d+) minutes observation\/interview, (\d+) minutes team presentation\.$/,
    phases: ['Observation and interview', 'Team presentation'],
    roles: {
      interviewer: {label: 'Interviewer', fields: ['Interviewer role']},
      patient: {label: 'Patient', fields: ['Patient role']},
      nurse: {label: 'Nurse', fields: ['Nurse role']}
    },
    debriefField: 'Handoff debrief'
  },
  'alcohol-withdrawal': {
    title: 'Alcohol withdrawal risk on the psychiatry unit',
    heading: 'Station 4 - Alcohol Withdrawal Risk On Psychiatry Unit',
    timing: /^(\d+) minutes encounter, (\d+) minutes presentation\.$/,
    phases: ['Patient encounter', 'Team presentation'],
    roles: {
      interviewer: {label: 'Interviewer', fields: ['Interviewer role']},
      patient: {label: 'Patient', fields: ['Patient role']},
      nurse: {label: 'Nurse', fields: ['Nurse role']}
    },
    debriefField: 'Handoff debrief'
  },
  'family-agenda': {
    title: 'Family meeting agenda before discharge',
    heading: 'Station 5 - Family Meeting Agenda Before Discharge',
    timing: /^(\d+) minutes prep\/presentation\.$/,
    phases: ['Preparation and presentation'],
    roles: {
      presenter: {label: 'Presenter', fields: ['Student task', 'Case brief', 'Presenter role']},
      family: {label: 'Family member', fields: ['Case brief', 'Family member role']},
      observer: {label: 'Observer', fields: ['Case brief', 'Observer role', 'Behaviors to practice', 'Rater focus']}
    }
  },
  'admission-presentation': {
    title: 'Oral presentation of a new admission',
    heading: 'Station 6 - Oral Presentation Of A New Admission',
    timing: /^(\d+)-minute presentation, (\d+)-minute questions\.$/,
    phases: ['Presentation', 'Questions'],
    roles: {
      presenter: {label: 'Presenter', fields: ['Student task', 'Case brief', 'Admission handoff', 'Presenter role']},
      resident: {label: 'Supervising resident', fields: ['Case brief', 'Admission handoff', 'Supervising resident role']},
      observer: {label: 'Observer', fields: ['Case brief', 'Admission handoff', 'Observer role', 'Behaviors to practice', 'Rater focus']}
    }
  }
};

var FD_OSCE_CIRCUITS = {
  'catatonia-withdrawal-circuit': {
    title: 'Possible Catatonia → Alcohol Withdrawal',
    cases: ['possible-catatonia', 'alcohol-withdrawal'],
    roles: {a: ['interviewer', 'nurse'], b: ['patient', 'interviewer'], c: ['nurse', 'patient']}
  },
  'full-six-station-circuit': {
    title: 'Full six-station circuit',
    cases: ['suicide-risk-collateral', 'capacity', 'possible-catatonia', 'alcohol-withdrawal', 'family-agenda', 'admission-presentation'],
    roles: {
      a: ['sibling', 'patient', 'interviewer', 'nurse', 'family', 'presenter'],
      b: ['interviewer', 'observer', 'patient', 'interviewer', 'observer', 'resident'],
      c: ['patient', 'interviewer', 'nurse', 'patient', 'presenter', 'observer']
    },
    rememberSeat: true,
    timingNote: "Includes Station 1's feedback. Allow extra time for the other five debriefs and transitions."
  },
  'teaching-time-20': {
    title: 'Fit my teaching time',
    cases: ['possible-catatonia'],
    roles: {a: ['interviewer'], b: ['patient'], c: ['nurse']},
    session: {goal: 'Acute assessment', minutes: 20, debrief: 5}
  },
  'communication-handoff-20': {
    title: 'Fit my teaching time',
    cases: ['admission-presentation'],
    roles: {a: ['presenter'], b: ['resident'], c: ['observer']},
    session: {goal: 'Communication and handoff', minutes: 20, debrief: 5, repeat: 5}
  }
};

var FD_HANDOFF_FOCUSES = {
  'name-the-source': 'Name the source',
  'state-the-uncertainty': 'State the uncertainty',
  'make-the-request': 'Make the request'
};

// The teaching-time preset uses the same two cases and learner rotation as the short circuit.
var fdShortCircuit = FD_OSCE_CIRCUITS['catatonia-withdrawal-circuit'];
FD_OSCE_CIRCUITS['teaching-time-45'] = {
  title: 'Fit my teaching time',
  cases: fdShortCircuit.cases,
  roles: fdShortCircuit.roles,
  session: {goal: 'Acute assessment', minutes: 45, debrief: 5, transition: 5}
};
FD_OSCE_CIRCUITS['communication-handoff-45'] = {
  title: 'Fit my teaching time',
  cases: ['family-agenda', 'admission-presentation'],
  roles: {a: ['presenter', 'observer'], b: ['family', 'presenter'], c: ['observer', 'resident']},
  session: {goal: 'Communication and handoff', minutes: 45, debrief: 5, transition: 5, repeat: 5}
};

// Round numbers in links and bookmarks are one-based. Explicit links also work without storage.
function fdCircuitRound(value, count) {
  var number = Number(value);
  return String(number) === value && Number.isInteger(number) && number >= 1 && number <= count ? number : 0;
}

function fdCircuitSavedRound(slug, seat, count) {
  try { return fdCircuitRound(localStorage.getItem('cw_osce_round_v1_' + slug + '_' + seat), count); }
  catch (_) { return 0; }
}

function fdOsceParts(markdown, station) {
  var sections = markdown.split(/^## /m);
  var section = sections.find(function(text) { return text.startsWith(station.heading + '\n'); });
  var questions = markdown.match(/^## Shared Debrief Questions\s*\n((?:- [^\n]+\n?)+)/m);
  if (!section || !questions) return null;

  var timeLine = section.match(/^\*\*Time:\*\* ([^\n]+)/m);
  var times = timeLine && station.timing.exec(timeLine[1].trim());
  if (!times) return null;
  var minutes = times.slice(1).map(Number);
  if (minutes.length !== station.phases.length || !minutes.every(function(n) { return n > 0; })) return null;

  var fields = Object.create(null);
  var chunks = section.split(/^\*\*([^*\n]+)\*\*[ \t]*$/m);
  for (var i = 1; i < chunks.length; i += 2) fields[chunks[i]] = chunks[i + 1].trim();
  var complete = Object.keys(station.roles).every(function(key) {
    return station.roles[key].fields.every(function(label) { return !!fields[label]; });
  });
  if (!complete || !fields['Behaviors to practice']) return null;
  if (station.debriefField && !fields[station.debriefField]) return null;
  return {minutes: minutes, fields: fields, questions: questions[1]};
}

function fdOsceLauncher(station, url, minutes) {
  var links = Object.keys(station.roles).map(function(key) {
    var label = station.roles[key].label;
    return '<li><a href="' + url + '&amp;role=' + key + '">' + label + '</a>' +
      '<button type="button" class="fd-btn fd-btn--ghost" data-station-copy aria-label="Copy ' +
      label.toLowerCase() + ' link">Copy link</button></li>';
  });
  return '<h2>Run this station</h2><p>Share one role link with each participant. Keep this page open to run the timer on this device.</p>' +
    fdOsceShareList(links) + fdOsceTimer(station.phases, minutes);
}

function fdOsceShareList(links, copyLabel) {
  return '<ul class="fd-station__roles">' + links.join('') + '</ul><p data-copy-status role="status"></p>' +
    '<label data-copy-fallback hidden>' + (copyLabel || 'Copy role link') + '<input type="url" readonly></label>';
}

function fdOsceTimer(labels, minutes, circuit, endMessage) {
  var phases = labels.map(function(label, index) {
    if (minutes.length === 1) return label;
    return '<label><input type="radio" name="station-phase" value="' + minutes[index] + '"' +
      (endMessage && index === labels.length - 1 ? ' data-end-message="' + endMessage + '"' : '') +
      (label === 'Repeat the handoff' ? ' data-repeat-phase' : '') +
      (index === 0 ? ' checked' : '') + (label === 'Debrief' ? ' data-open-debrief' : '') + '> ' + label + '</label>';
  });
  return '<fieldset data-timer-phases><legend>Facilitator timer</legend>' + phases.join('') + '</fieldset>' +
    '<div' + (circuit ? ' class="fd-circuit__timer" role="group" aria-label="Facilitator timer controls"' : '') + '>' +
    (circuit ? '<div data-timer-caption><span data-current-phase>' + labels[0] + '</span>' +
      (labels.indexOf('Repeat the handoff') !== -1 ? '<strong data-timer-focus hidden></strong>' : '') + '</div>' : '') +
    '<div class="fd-station__clock" role="timer" aria-label="Time remaining" data-initial-minutes="' + minutes[0] + '">' + minutes[0] + ':00</div>' +
    '<div class="fd-station__actions"><button type="button" class="fd-btn fd-btn--primary" data-timer-toggle>Start</button>' +
    '<button type="button" class="fd-btn fd-btn--ghost" data-timer-reset>Reset</button></div></div><p role="status" data-timer-status></p>';
}

function fdOsceRoleCard(role, parts, parse) {
  var card = '<h2>' + role.label + '</h2>';
  if (role.instruction) card += '<p>' + role.instruction + '</p>';
  return card + role.fields.map(function(field) { return parse(parts.fields[field]); }).join('');
}

function fdSessionSchedule(circuit, rounds) {
  var elapsed = 0;
  return rounds.map(function(parts, index) {
    var current = FD_OSCE_STATIONS[circuit.cases[index]];
    var phases = current.phases.slice();
    var minutes = parts.minutes.slice();
    var blocks = [];
    function addBlock(label, length) {
      blocks.push({label: label, start: elapsed, end: elapsed + length});
      elapsed += length;
    }
    function addPhase(label, length, description) {
      phases.push(label);
      minutes.push(length);
      addBlock(description, length);
    }
    if (rounds.length === 1) {
      current.phases.forEach(function(label, i) { addBlock(label, parts.minutes[i]); });
    } else {
      addBlock(current.title, minutes.reduce(function(a,b) { return a+b; }, 0));
    }
    addPhase('Debrief', circuit.session.debrief, 'Handoff debrief');
    if (index + 1 < rounds.length) addPhase('Transition', circuit.session.transition, 'Transition · switch roles and prepare for the next case');
    else if (circuit.session.repeat) addPhase('Repeat the handoff', circuit.session.repeat, 'Repeat the handoff');
    return {phases: phases, minutes: minutes, blocks: blocks, end: elapsed};
  });
}

function fdSessionPlan(circuit, schedule, url) {
  var durations = [], goals = [];
  Object.keys(FD_OSCE_CIRCUITS).forEach(function(slug) {
    var option = FD_OSCE_CIRCUITS[slug].session;
    if (!option) return;
    var link = '<a href="?page=osce.md&amp;station=' + slug + '"' +
      (option === circuit.session ? ' aria-current="page"' : '') + '>';
    if (option.goal === circuit.session.goal) durations.push(link + option.minutes + ' minutes</a>');
    if (option.minutes === circuit.session.minutes) goals.push(link + option.goal + '</a>');
  });
  function choices(label, links) {
    return '<nav class="fd-session__choices" aria-label="' + label + '"><h3>' + label + '</h3>' + links.join(' ') + '</nav>';
  }
  var caseSummary = circuit.cases.map(function(id, index) {
    var lead = Object.keys(circuit.roles).find(function(seat) {
      var role = circuit.roles[seat][index];
      return role === 'interviewer' || role === 'presenter';
    });
    return FD_OSCE_STATIONS[id].title + ' · Learner ' + lead.toUpperCase() + ' leads';
  });
  var rows = schedule.map(function(round) {
    return round.blocks.map(function(block) {
      return '<li><strong>' + block.start + '–' + block.end + ' min</strong> · ' + block.label + '</li>';
    }).join('');
  }).join('');
  return '<h2>' + circuit.session.minutes + '-minute session plan</h2>' +
    choices('Session duration', durations) + choices('Teaching goal', goals) +
    '<p>' + caseSummary.join('<br>') + '</p>' +
    '<ol aria-label="Session agenda">' + rows + '</ol>' +
    '<p><a class="fd-btn fd-btn--primary" href="' + url + '&amp;round=1">Start session</a></p>' + fdCircuitSeats(circuit, url);
}

function fdCircuitView(circuit, current, rounds, round, seat, url, parse, schedule) {
  var title = (rounds.length > 1 ? 'Case ' + (round + 1) + ' of ' + rounds.length + ' · ' : '') + current.title;
  var body = '<p class="fd-circuit__case"><strong>' + title + '</strong></p>';
  var next = circuit.cases[round + 1];
  if (next) body += '<p>Up next: ' + FD_OSCE_STATIONS[next].title + '</p>';
  var minutes = rounds[round].minutes;
  if (seat) {
    var assigned = current.roles[circuit.roles[seat][round]];
    body += '<p>Learner ' + seat.toUpperCase() + '</p>' + fdOsceRoleCard(assigned, rounds[round], parse);
  } else {
    var labels = current.phases;
    if (schedule) {
      var plan = schedule[round];
      labels = plan.phases;
      minutes = plan.minutes;
      body += '<p>Minutes ' + plan.blocks[0].start + '–' + plan.end + ' of ' + circuit.session.minutes +
        '. Select and start each phase in order.</p>';
    } else {
      var total = rounds.reduce(function(sum, part) {
        return sum + part.minutes.reduce(function(a,b) { return a+b; }, 0);
      }, 0);
      body += '<p>' + total + ' timed minutes. ' + (circuit.timingNote || 'Allow extra time for debriefs.') + '</p>';
    }
    var endMessage = schedule && (next ? 'Transition complete. Cue everyone to tap Next case.' : 'Session complete.');
    body += fdOsceTimer(labels, minutes, true, endMessage) + fdCircuitSeats(circuit, url);
  }
  return body;
}

function fdCircuitSeats(circuit, url) {
  var instructions = circuit.cases.length === 1 ? 'Share one role link with each learner before starting the clock.' :
    'Give each learner one link for the circuit. Cue everyone when it is time to tap Next case.';
  return '<h3>Learner links</h3><p>' + instructions + '</p>' +
    fdOsceShareList(Object.keys(circuit.roles).map(function(key) {
      var label = 'Learner ' + key.toUpperCase();
      var assignment = circuit.roles[key].map(function(role, i) {
        return FD_OSCE_STATIONS[circuit.cases[i]].roles[role].label;
      }).join(' → ');
      return fdCircuitShareRow(url + '&amp;role=' + key, label, 'qr-' + key, assignment);
    }));
}

function fdCircuitShareRow(href, label, qrId, description, linkText) {
  return '<li><div><a href="' + href + '" target="_blank" rel="noopener">' + (linkText || label) + '</a>' +
    (description ? '<br>' + description : '') + '</div>' +
    '<button type="button" class="fd-btn fd-btn--ghost" data-seat-qr="' + label + '" aria-expanded="false" aria-controls="' + qrId +
    '" aria-label="Show QR for ' + label + '">Show QR</button>' +
    '<button type="button" class="fd-btn fd-btn--ghost" data-station-copy aria-label="Copy ' + label +
    ' link">Copy link</button><div class="fd-circuit__qr" id="' + qrId + '" hidden></div></li>';
}

function fdHandoffPicker(selected, shareUrl) {
  var radios = Object.keys(FD_HANDOFF_FOCUSES).map(function(key) {
    return '<label><input type="radio" name="handoff-focus" value="' + key + '"' +
      (key === selected ? ' checked' : '') + '> ' + FD_HANDOFF_FOCUSES[key] + '</label>';
  });
  return '<fieldset data-handoff-picker><legend>Feedback focus</legend><p>Choose one change for the presenter’s next attempt.</p>' +
    radios.join('') + '</fieldset>' + (shareUrl ? '<div data-focus-share="' + shareUrl + '" hidden></div>' : '');
}

function fdCircuitNavigation(circuit, round, seatUrl, seat) {
  var next = circuit.cases[round + 1];
  var navigation = next
    ? '<p>On the facilitator’s cue, move to ' + FD_OSCE_STATIONS[next].title + '.</p>' +
      '<a class="fd-btn fd-btn--primary" href="' + seatUrl + '&amp;round=' + (round + 2) + '">Next case</a>'
    : (circuit.session && circuit.session.repeat
      ? '<p>After the debrief, keep your roles for the handoff rehearsal.</p>'
      : '<p>Final case · End with the debrief.</p>');
  if (circuit.rememberSeat) {
    navigation += '<details><summary>Go to a station</summary>' +
      (seat ? '<p>Reopen your QR link in this browser to resume. On a new device, choose the station your group is on.</p>' : '') +
      '<ol>' + circuit.cases.map(function(slug, index) {
      return '<li><a href="' + seatUrl + '&amp;round=' + (index + 1) + '"' +
        (round === index ? ' aria-current="step"' : '') + '>' + FD_OSCE_STATIONS[slug].title + '</a></li>';
    }).join('') + '</ol></details>';
    if (round > 0) navigation += '<p><a href="' + seatUrl + '&amp;round=1">Start at station 1</a></p>';
  } else if (!next && circuit.session && !seat) navigation += '<a href="' + seatUrl + '">Back to session plan</a>';
  else if (!next && circuit.cases.length > 1) navigation += '<a href="' + seatUrl + '">Back to first case</a>';
  return navigation;
}

function fdOsceStation(markdown, search, parse) {
  var params = new URLSearchParams(search);
  var station = fdStationForRoute('osce.md', params);
  if (!station) return '';
  var slug = params.get('station');
  var circuit = station.cases ? station : null;
  var key = params.get('role');
  var seat = circuit && fdOwn(circuit.roles, key) ? key : null;
  var remember = circuit && circuit.rememberSeat && seat;
  var round = 0;
  var rounds;
  if (circuit) {
    var number = fdCircuitRound(params.get('round'), circuit.cases.length);
    if (!params.has('round') && remember) number = fdCircuitSavedRound(slug, seat, circuit.cases.length);
    round = (number || 1) - 1;
    rounds = circuit.cases.map(function(id) { return fdOsceParts(markdown, FD_OSCE_STATIONS[id]); });
    station = FD_OSCE_STATIONS[circuit.cases[round]];
  }
  var parts = circuit ? rounds[round] : fdOsceParts(markdown, station);
  var full = '<a href="?page=osce.md">Full OSCE station set</a>';
  // Retain the reading's centrally generated crisis contacts on each view.
  var crisis = markdown.match(/^> <div class="crisis-block-hook"[^\n]*(?:\n>[^\n]*)*/m);
  var contacts = crisis ? parse(crisis[0]) : '';
  if (!parts || (circuit && !rounds.every(Boolean))) return '<p role="status">The station could not be opened. ' + full + '</p>' + contacts;
  if (circuit && circuit.session && circuit.session.repeat && !rounds[rounds.length - 1].fields['Repeat the handoff'])
    return '<p role="status">The handoff rehearsal could not be opened. ' + full + '</p>' + contacts;

  var url = '?page=osce.md&amp;station=' + slug;
  var bookmark = remember ? ' data-circuit-slug="' + slug + '" data-circuit-seat="' + seat + '" data-circuit-round="' + (round + 1) + '"' : '';
  var body = '<section class="fd-station" data-osce-station' + bookmark + '><p>Fictional practice case.</p>';
  var navigation = '', repeatAction = '', repeatInstructions = '';
  if (circuit) {
    var schedule = circuit.session && fdSessionSchedule(circuit, rounds);
    if (schedule && schedule[schedule.length - 1].end !== circuit.session.minutes)
      return '<p role="status">The current station timings no longer fit this session. ' + full + '</p>' + contacts;
    if (schedule && !seat && !params.has('round'))
      return body + fdSessionPlan(circuit, schedule, url) + '<p>' + full + '</p></section>' + contacts;
    body += fdCircuitView(circuit, station, rounds, round, seat, url, parse, schedule);
    var seatUrl = url + (seat ? '&amp;role=' + seat : '');
    navigation = fdCircuitNavigation(circuit, round, seatUrl, seat);
    if (schedule && circuit.session.repeat && round === rounds.length - 1) {
      if (!seat) repeatAction = fdHandoffPicker(params.get('handoffFocus')) +
        '<p><button type="button" class="fd-btn fd-btn--primary" data-start-repeat>Repeat the handoff</button></p>';
      repeatInstructions = '<section' + (seat ? '' : ' data-repeat-coaching hidden') + '><h3 tabindex="-1">Repeat the handoff</h3>' +
        parse(parts.fields['Repeat the handoff']) + '</section>';
      if (seat && circuit.roles[seat][round] === 'observer')
        repeatInstructions += fdHandoffPicker(null, url + '&amp;round=' + (round + 1));
    }
  } else if (fdOwn(station.roles, key)) {
    body += fdOsceRoleCard(station.roles[key], parts, parse) + '<p><a href="' + url + '">Back to station</a></p>';
  } else {
    body += fdOsceLauncher(station, url, parts.minutes);
  }
  return body + '<button type="button" class="fd-btn fd-btn--ghost" data-station-debrief aria-expanded="false" aria-controls="station-debrief">Open debrief</button>' +
    '<div id="station-debrief" hidden><h3>Debrief</h3>' +
    (station.debriefField ? '<h4>' + station.debriefField + '</h4>' + parse(parts.fields[station.debriefField]) : '') +
    parse(parts.fields['Behaviors to practice']) +
    '<h4>Discuss together</h4>' + parse(parts.questions) + repeatAction + '</div>' + repeatInstructions +
    navigation + '<p>' + full + '</p></section>' + contacts;
}

function fdMountOsceStation(panel){
  var shares=panel.querySelector('.fd-station__roles');
  if(shares)fdMountOsceShareLinks(panel, shares);
  if(panel.dataset.circuitSeat){
    var address = new URL(location.href);
    var round = panel.dataset.circuitRound;
    try { localStorage.setItem('cw_osce_round_v1_' + panel.dataset.circuitSlug + '_' + panel.dataset.circuitSeat, round); } catch (_) {}
    // Pin this history entry to the displayed round so Back still returns there after a rotation.
    if(address.searchParams.get('round') !== round){
      address.searchParams.set('round', round);
      try { history.replaceState(history.state, '', address); } catch (_) {}
    }
  }
  var debrief=panel.querySelector('[data-station-debrief]');
  if(!debrief)return;
  debrief.onclick=function(){
    var content=panel.querySelector('#station-debrief');
    content.hidden=!content.hidden;
    debrief.setAttribute('aria-expanded',String(!content.hidden));
    debrief.textContent=content.hidden?'Open debrief':'Close debrief';
  };
  var picker=panel.querySelector('[data-handoff-picker]');
  var share=panel.querySelector('[data-focus-share]');
  if(share)picker.onchange=function(event){
    var key=event.target.value;
    if(!fdOwn(FD_HANDOFF_FOCUSES,key))return;
    var url=fdEsc(share.dataset.focusShare + '&handoffFocus=' + key);
    share.innerHTML='<p>To put your focus beside the countdown, open the timer here or share it with the facilitator.</p>' +
      fdOsceShareList([fdCircuitShareRow(url,'focused timer','qr-focused-timer','','Open focused timer')],'Copy timer link');
    share.hidden=false;
    fdMountOsceShareLinks(share,share.querySelector('ul'));
  };
  var toggle=panel.querySelector('[data-timer-toggle]');
  if(!toggle)return;
  var display=panel.querySelector('[role="timer"]'),status=panel.querySelector('[data-timer-status]');
  var reset=panel.querySelector('[data-timer-reset]'),remaining=0,deadline=null,tick=null;
  var repeatButton=panel.querySelector('[data-start-repeat]'), repeatPhase=panel.querySelector('[data-repeat-phase]');
  var coaching=panel.querySelector('[data-repeat-coaching]');
  var timerFocus=panel.querySelector('[data-timer-focus]');
  function showFocus(){
    if(!timerFocus)return;
    var choice=picker.querySelector(':checked');
    timerFocus.hidden=!choice || !repeatPhase.checked;
    timerFocus.textContent=choice ? FD_HANDOFF_FOCUSES[choice.value] : '';
    var address=new URL(location.href);
    var key=timerFocus.hidden ? null : choice.value;
    if(address.searchParams.get('handoffFocus')!==key){
      if(key)address.searchParams.set('handoffFocus',key);
      else address.searchParams.delete('handoffFocus');
      history.replaceState(history.state,'',address);
    }
  }
  if(picker){
    picker.onchange=showFocus;
    if(picker.querySelector(':checked'))repeatPhase.checked=true;
  }
  function stop(){
    clearTimeout(tick);
    deadline=null;
  }
  function paint(){
    var seconds=Math.ceil(remaining/1000);
    display.textContent=Math.floor(seconds/60)+':'+('0'+(seconds%60)).slice(-2);
  }
  function update(){
    if(!panel.isConnected){stop();return;}
    remaining=Math.max(0,deadline-Date.now());
    paint();
    if(remaining===0){
      stop();
      toggle.textContent='Start';
      toggle.disabled=true;
      var selected=panel.querySelector('input[name="station-phase"]:checked');
      status.textContent=selected ? selected.dataset.endMessage || 'Time is up. Reset the timer or select the next phase.'
        : 'Time is up. Reset the timer to start again.';
      if(repeatPhase && selected.hasAttribute('data-open-debrief'))status.textContent='Debrief complete. Select Repeat the handoff.';
    }else tick=setTimeout(update,remaining%1000||1000);
  }
  function resetPhase(){
    stop();
    var selected=panel.querySelector('input[name="station-phase"]:checked');
    if(coaching){
      coaching.hidden=selected!==repeatPhase;
      repeatButton.hidden=selected===repeatPhase;
    }
    var phaseLabel=panel.querySelector('[data-current-phase]');
    if(phaseLabel && selected)phaseLabel.textContent=selected.parentNode.textContent.trim();
    showFocus();
    remaining=Number(selected ? selected.value : display.dataset.initialMinutes)*60000;
    toggle.disabled=false;
    toggle.textContent='Start';
    status.textContent='';
    paint();
  }
  reset.onclick=resetPhase;
  panel.querySelector('[data-timer-phases]').onchange=function(event){
    resetPhase();
    if(event.target.hasAttribute('data-open-debrief') && debrief.getAttribute('aria-expanded')==='false')debrief.click();
  };
  if(repeatButton)repeatButton.onclick=function(){
    repeatPhase.checked=true;
    resetPhase();
    toggle.click();
    coaching.querySelector('h3').focus();
  };
  toggle.onclick=function(){
    if(deadline!==null){
      remaining=Math.max(0,deadline-Date.now());
      if(remaining===0){clearTimeout(tick);update();return;}
      stop();
      paint();
      toggle.textContent='Resume';
      status.textContent='Paused.';
    }else{
      deadline=Date.now()+remaining;
      toggle.textContent='Pause';
      status.textContent='Timer running.';
      update();
    }
  };
  resetPhase();
}

function fdMountOsceShareLinks(panel, shares){
  var copyStatus=panel.querySelector('[data-copy-status]'),fallback=panel.querySelector('[data-copy-fallback]');
  var latestCopy=0;
  shares.onclick=async function(event){
    var qrButton=event.target.closest('[data-seat-qr]');
    if(qrButton){
      var row=qrButton.closest('li'), learner=row.querySelector('a'), output=row.querySelector('.fd-circuit__qr');
      if(output.hidden && !output.firstChild){
        try{
          var qr=qrcode(0,'M');
          qr.addData(learner.href,'Byte');
          qr.make();
          output.innerHTML=qr.createSvgTag({scalable:true,title:{id:output.id+'-title',text:'QR code for '+qrButton.dataset.seatQr}});
        }catch(error){output.textContent='QR unavailable. Use Copy link.';}
      }
      output.hidden=!output.hidden;
      var action=output.hidden?'Show QR':'Hide QR';
      qrButton.textContent=action;
      qrButton.setAttribute('aria-expanded',String(!output.hidden));
      qrButton.setAttribute('aria-label',action+' for '+qrButton.dataset.seatQr);
      return;
    }
    var button=event.target.closest('[data-station-copy]');
    if(!button)return;
    var attempt=++latestCopy;
    var link=button.closest('li').querySelector('a');
    fallback.hidden=true;
    copyStatus.textContent='';
    try{
      await navigator.clipboard.writeText(link.href);
      if(attempt===latestCopy)copyStatus.textContent=link.textContent+' link copied.';
    }catch(error){
      if(attempt!==latestCopy||!panel.isConnected)return;
      var field=fallback.querySelector('input');
      field.value=link.href;
      fallback.hidden=false;
      field.focus();
      field.select();
      copyStatus.textContent='Copy the selected link.';
    }
  };
}
