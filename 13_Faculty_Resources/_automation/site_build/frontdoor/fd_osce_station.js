/* Each station projects named sections of the OSCE guide onto role cards.
   Clinical facts, timing and debrief questions come from that reading. */
var FD_OSCE_STATIONS = {
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
  return complete ? {minutes: minutes, fields: fields, questions: questions[1]} : null;
}

function fdOsceLauncher(station, url, minutes) {
  var links = Object.keys(station.roles).map(function(key) {
    var label = station.roles[key].label;
    return '<li><a href="' + url + '&amp;role=' + key + '">' + label + '</a>' +
      '<button type="button" class="fd-btn fd-btn--ghost" data-station-copy aria-label="Copy ' +
      label.toLowerCase() + ' link">Copy link</button></li>';
  });
  var phases = station.phases.map(function(label, index) {
    if (minutes.length === 1) return label;
    return '<label><input type="radio" name="station-phase" value="' + minutes[index] + '"' +
      (index === 0 ? ' checked' : '') + '> ' + label + '</label>';
  });
  return '<h2>Run this station</h2><p>Share one role link with each participant. Keep this page open to run the timer on this device.</p>' +
    '<ul class="fd-station__roles">' + links.join('') + '</ul><p data-copy-status role="status"></p>' +
    '<label data-copy-fallback hidden>Copy role link<input type="url" readonly></label>' +
    '<fieldset><legend>Facilitator timer</legend>' + phases.join('') + '</fieldset>' +
    '<div class="fd-station__clock" role="timer" aria-label="Time remaining" data-initial-minutes="' + minutes[0] + '">' + minutes[0] + ':00</div>' +
    '<div class="fd-station__actions"><button type="button" class="fd-btn fd-btn--primary" data-timer-toggle>Start</button>' +
    '<button type="button" class="fd-btn fd-btn--ghost" data-timer-reset>Reset</button></div><p role="status" data-timer-status></p>';
}

function fdOsceStation(markdown, search, parse) {
  var params = new URLSearchParams(search);
  var station = fdStationForRoute('osce.md', params);
  if (!station) return '';
  var parts = fdOsceParts(markdown, station);
  var full = '<a href="?page=osce.md">Full OSCE station set</a>';
  // Retain the reading's centrally generated crisis contacts on each view.
  var crisis = markdown.match(/^> <div class="crisis-block-hook"[^\n]*(?:\n>[^\n]*)*/m);
  var contacts = crisis ? parse(crisis[0]) : '';
  if (!parts) return '<p role="status">The station could not be opened. ' + full + '</p>' + contacts;

  var url = '?page=osce.md&amp;station=' + params.get('station');
  var key = params.get('role');
  var body = '<section class="fd-station" data-osce-station><p>Fictional practice case.</p>';
  if (fdOwn(station.roles, key)) {
    var role = station.roles[key];
    body += '<h2>' + role.label + '</h2>';
    if (role.instruction) body += '<p>' + role.instruction + '</p>';
    role.fields.forEach(function(label) { body += parse(parts.fields[label]); });
    body += '<p><a href="' + url + '">Back to station</a></p>';
  } else {
    body += fdOsceLauncher(station, url, parts.minutes);
  }
  return body + '<button type="button" class="fd-btn fd-btn--ghost" data-station-debrief aria-expanded="false" aria-controls="station-debrief">Open debrief</button>' +
    '<div id="station-debrief" hidden><h3>Debrief</h3>' + parse(parts.fields['Behaviors to practice']) +
    '<h4>Discuss together</h4>' + parse(parts.questions) + '</div><p>' + full + '</p></section>' + contacts;
}

function fdMountOsceStation(panel){
  var debrief=panel.querySelector('[data-station-debrief]');
  debrief.onclick=function(){
    var content=panel.querySelector('#station-debrief');
    content.hidden=!content.hidden;
    debrief.setAttribute('aria-expanded',String(!content.hidden));
    debrief.textContent=content.hidden?'Open debrief':'Close debrief';
  };
  var toggle=panel.querySelector('[data-timer-toggle]');
  if(!toggle)return;
  var display=panel.querySelector('[role="timer"]'),status=panel.querySelector('[data-timer-status]');
  var reset=panel.querySelector('[data-timer-reset]'),remaining=0,deadline=null,tick=null;
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
      status.textContent=panel.querySelector('input[name="station-phase"]')
        ? 'Time is up. Reset the timer or select the next phase.' : 'Time is up. Reset the timer to start again.';
    }else tick=setTimeout(update,remaining%1000||1000);
  }
  function resetPhase(){
    stop();
    var selected=panel.querySelector('input[name="station-phase"]:checked');
    remaining=Number(selected ? selected.value : display.dataset.initialMinutes)*60000;
    toggle.disabled=false;
    toggle.textContent='Start';
    status.textContent='';
    paint();
  }
  reset.onclick=resetPhase;
  panel.querySelector('fieldset').onchange=resetPhase;
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

  var copyStatus=panel.querySelector('[data-copy-status]'),fallback=panel.querySelector('[data-copy-fallback]');
  var latestCopy=0;
  panel.querySelector('.fd-station__roles').onclick=async function(event){
    var button=event.target.closest('[data-station-copy]');
    if(!button)return;
    var attempt=++latestCopy;
    var link=button.parentNode.querySelector('a');
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
