/* Capacity OSCE role views. Clinical copy and phase lengths come from osce.md. */
var FD_CAPACITY_URL='?page=osce.md&station=capacity';
var FD_CAPACITY_ROLES={interviewer:'Interviewer',patient:'Patient',observer:'Observer'};

function fdCapacityParts(markdown){
  var section=markdown.split(/^## /m).find(function(text){
    return text.startsWith('Station 2 - Capacity To Refuse Medical Treatment\n');
  });
  var questions=markdown.match(/^## Shared Debrief Questions\s*\n((?:- [^\n]+\n?)+)/m);
  if(!section||!questions)return null;
  var time=section.match(/^\*\*Time:\*\* (\d+) minutes encounter, (\d+) minutes oral capacity summary\./m);
  if(!time||!Number(time[1])||!Number(time[2]))return null;
  var fields=section.split(/^\*\*(Student task|Patient brief|Behaviors to practice|Rater focus)\*\*\s*$/m);
  var parts={minutes:[Number(time[1]),Number(time[2])],questions:questions[1]};
  for(var i=1;i<fields.length;i+=2)parts[fields[i]]=fields[i+1].trim();
  return parts['Student task']&&parts['Patient brief']&&parts['Behaviors to practice']&&parts['Rater focus']?parts:null;
}

function fdCapacityStation(markdown,search,parse){
  var params=new URLSearchParams(search);
  if(params.get('station')!=='capacity')return '';
  var parts=fdCapacityParts(markdown);
  var full='<a href="?page=osce.md">Full OSCE station set</a>';
  // Keep the full page's centrally generated contacts on every station view.
  var crisis=markdown.match(/^> <div class="crisis-block-hook"[^\n]*(?:\n>[^\n]*)*/m);
  var contacts=crisis?parse(crisis[0]):'';
  if(!parts)return '<p role="status">The capacity station could not be opened. '+full+'</p>'+contacts;
  var role=params.get('role');
  if(!Object.prototype.hasOwnProperty.call(FD_CAPACITY_ROLES,role))role='';
  var body='<section class="fd-station" data-capacity-station><p>Fictional practice case.</p>';
  if(role){
    body+='<h2>'+FD_CAPACITY_ROLES[role]+'</h2>';
    if(role==='interviewer')body+=parse(parts['Student task']);
    if(role==='patient')body+='<p>Play the patient described below. Ask the facilitator about any detail outside the brief.</p>'+parse(parts['Patient brief']);
    if(role==='observer')body+='<p>Watch the interview and oral summary. Be ready to describe one specific example in the debrief.</p>'+
      parse(parts['Behaviors to practice'])+parse(parts['Rater focus']);
    body+='<p><a href="'+FD_CAPACITY_URL+'">Back to station</a></p>';
  }else{
    body+='<h2>Run this station</h2><p>Share one role link with each participant. Keep this page open to run the timer on this device.</p><ul class="fd-station__roles">';
    Object.keys(FD_CAPACITY_ROLES).forEach(function(key){
      var label=FD_CAPACITY_ROLES[key];
      body+='<li><a href="'+FD_CAPACITY_URL+'&amp;role='+key+'">'+label+'</a>'+
        '<button type="button" class="fd-btn fd-btn--ghost" data-station-copy aria-label="Copy '+label.toLowerCase()+' link">Copy link</button></li>';
    });
    body+='</ul><p data-copy-status role="status"></p><label data-copy-fallback hidden>Copy role link<input type="url" readonly></label>';
    body+='<fieldset><legend>Facilitator timer</legend>';
    ['Interview','Oral summary'].forEach(function(label,index){
      body+='<label><input type="radio" name="capacity-phase" value="'+parts.minutes[index]+'"'+
        (index===0?' checked':'')+'> '+label+'</label>';
    });
    body+='</fieldset><div class="fd-station__clock" role="timer" aria-label="Time remaining">'+parts.minutes[0]+':00</div>'+
      '<div class="fd-station__actions"><button type="button" class="fd-btn fd-btn--primary" data-timer-toggle>Start</button>'+
      '<button type="button" class="fd-btn fd-btn--ghost" data-timer-reset>Reset</button></div><p role="status" data-timer-status></p>';
  }
  body+='<button type="button" class="fd-btn fd-btn--ghost" data-station-debrief aria-expanded="false" aria-controls="capacity-debrief">Open debrief</button>'+
    '<div id="capacity-debrief" hidden><h3>Debrief</h3>'+parse(parts['Behaviors to practice'])+
    '<h4>Discuss together</h4>'+parse(parts.questions)+'</div><p>'+full+'</p></section>';
  return body+contacts;
}

function fdMountCapacityStation(panel){
  var debrief=panel.querySelector('[data-station-debrief]');
  debrief.onclick=function(){
    var content=panel.querySelector('#capacity-debrief');
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
      status.textContent='Time is up. Reset the timer or select the next phase.';
    }else tick=setTimeout(update,remaining%1000||1000);
  }
  function resetPhase(){
    stop();
    remaining=Number(panel.querySelector('input[name="capacity-phase"]:checked').value)*60000;
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
