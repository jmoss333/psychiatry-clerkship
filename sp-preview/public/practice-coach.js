/* Optional authored coaching. Choices, reveals and reflection stay in this
   mounted view; only the controller may pause or reopen the conversation. */
(function(root,factory){
  'use strict';var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.PracticeCoach=api;
}(typeof window!=='undefined'?window:null,function(){
  'use strict';
  function mount(env,options){
    var doc=env.document,entry=options.entry,room=options.room,content=options.content;
    var profile=null,goal=null,depth='student',begun=false,disposed=false,latest={},wasOpen=false,listeners=[];
    function node(tag,parent,attributes,text){
      var item=doc.createElement(tag);
      Object.keys(attributes||{}).forEach(function(key){item.setAttribute(key,attributes[key]);});
      if(text!==undefined)item.textContent=text;
      if(parent)parent.appendChild(item);return item;
    }
    function listen(item,kind,callback){item.addEventListener(kind,callback);listeners.push(function(){item.removeEventListener(kind,callback);});}
    function empty(item){while(item.firstChild)item.removeChild(item.firstChild);}
    function button(parent,id,text,callback){var item=node('button',parent,{id:id,type:'button'},text);listen(item,'click',function(){if(!disposed&&!item.disabled&&!item.hidden)callback();});return item;}
    function reviewLabel(parent){return node('p',parent,{class:'practice-review'},'Draft coaching · faculty review pending');}
    empty(entry);empty(room);entry.classList.add('practice-entry');room.classList.add('practice-room');
    var chooser=node('fieldset',entry,{class:'practice-chooser'});
    node('legend',chooser,{},'One thing to practice');
    node('label',chooser,{for:'practice-goal'},'Your communication goal');
    var goalChoice=node('select',chooser,{id:'practice-goal'});
    var depthOptions=node('details',chooser,{id:'practice-depth-options',class:'practice-depth-options'});
    var depthSummary=node('summary',depthOptions,{id:'practice-depth-summary'},'Student coaching · Change depth');
    node('label',depthOptions,{for:'practice-depth'},'Coaching depth');
    var depthChoice=node('select',depthOptions,{id:'practice-depth','aria-describedby':'practice-depth-help'});
    node('option',depthChoice,{value:'student'},'Student · foundations');
    node('option',depthChoice,{value:'resident'},'Resident · deeper reflection');
    node('p',depthOptions,{id:'practice-depth-help',class:'fine'},'Changes the coaching depth only. Your clinical role and authority in the case stay the same.');
    function showDepth(){depthSummary.textContent=(depthChoice.value==='resident'?'Resident':'Student')+' coaching · Change depth';}
    listen(depthChoice,'change',showDepth);
    reviewLabel(chooser);

    var reminder=node('div',room,{class:'practice-reminder'}),reminderText=node('div',reminder,{});
    node('p',reminderText,{class:'practice-label'},'Your focus');
    var goalReminder=node('p',reminderText,{id:'practice-goal-reminder',class:'practice-goal-title'});
    var depthReminder=node('p',reminderText,{class:'practice-depth-note'});
    var openButton=button(reminder,'practice-open','I’m stuck',function(){
      if(!eligible())return;
      options.onOpen();
      // The controller publishes coachingOpen synchronously only after capture
      // has stopped. Never reveal help from the click alone.
      if(latest.coachingOpen&&!panel.hidden)heading.focus();
    });
    openButton.setAttribute('aria-controls','practice-coaching-panel');openButton.setAttribute('aria-expanded','false');

    var panel=node('section',room,{id:'practice-coaching-panel',class:'practice-coaching-panel','aria-labelledby':'practice-coaching-title'});panel.hidden=true;
    var heading=node('h3',panel,{id:'practice-coaching-title',tabindex:'-1'},'A pause to think');
    node('p',panel,{class:'fine'},'The microphone is paused. Your completed draft stays in the conversation. Take the time you need.');
    var unfinished=node('div',panel,{id:'practice-unfinished',class:'practice-unfinished'});unfinished.hidden=true;
    node('p',unfinished,{class:'practice-label'},'Unfinished recognition · not sent');
    var unfinishedWords=node('p',unfinished,{});
    node('p',unfinished,{class:'fine'},'This fragment was still being recognized. Review or repeat it when you return.');
    var question=node('p',panel,{id:'practice-question',class:'practice-question'});
    node('p',panel,{class:'fine'},'Use coaching as often as it helps. Asking for help is not scored.');
    var hintButton=button(panel,'practice-show-hint','Show a hint',function(){hint.hidden=false;hintButton.hidden=true;examplesButton.hidden=false;hint.focus();});
    hintButton.setAttribute('aria-controls','practice-hint');
    var hint=node('p',panel,{id:'practice-hint',class:'practice-hint',tabindex:'-1'});hint.hidden=true;
    var examplesButton=button(panel,'practice-show-examples','Show two examples',function(){examples.hidden=false;examplesButton.hidden=true;examplesTitle.focus();});
    examplesButton.setAttribute('aria-controls','practice-examples');examplesButton.hidden=true;
    var examples=node('section',panel,{id:'practice-examples',class:'practice-examples','aria-labelledby':'practice-examples-title'});examples.hidden=true;
    var examplesTitle=node('h4',examples,{id:'practice-examples-title',tabindex:'-1'},'Two possible ways to say it');
    node('p',examples,{class:'fine'},'Adapt these to what you actually heard. Use your own words; nothing here is sent to the patient.');
    var exampleOne=node('blockquote',examples,{}),exampleTwo=node('blockquote',examples,{});
    var returnRow=node('div',panel,{class:'practice-return'});
    button(returnRow,'practice-close','Return to the conversation',function(){options.onClose();if(!latest.coachingOpen&&!openButton.hidden)openButton.focus();});
    node('p',returnRow,{class:'fine'},'The microphone stays paused. Choose Resume microphone when you are ready, or type your next question.');
    reviewLabel(panel);

    var reflectionPanel=node('section',room,{id:'practice-reflection-panel',class:'practice-reflection','aria-labelledby':'practice-reflection-title'});reflectionPanel.hidden=true;
    node('h3',reflectionPanel,{id:'practice-reflection-title'},'Return to your goal');
    var reflectionQuestion=node('label',reflectionPanel,{for:'practice-reflection',id:'practice-reflection-question'});
    var reflection=node('textarea',reflectionPanel,{id:'practice-reflection',rows:'3',maxlength:'2400','aria-describedby':'practice-reflection-help'});
    node('p',reflectionPanel,{id:'practice-reflection-help',class:'fine'},'Private notes for your own thinking. They stay on this page, are not sent for feedback, and disappear when you clear or leave.');
    reviewLabel(reflectionPanel);

    function selectedGoal(){return profile&&profile.goals.find(function(item){return item.id===goalChoice.value;})||profile&&profile.goals[0]||null;}
    function resetReveals(){hint.hidden=true;hintButton.hidden=false;examples.hidden=true;examplesButton.hidden=true;}
    function eligible(){return begun&&profile&&latest.caseId===profile.id&&latest.mode==='full'&&!latest.busy&&!latest.restartRequired&&!latest.coachingOpen&&['ready','listening','connecting','paused'].includes(latest.phase);}
    function update(snapshot){
      if(disposed)return;latest=snapshot||{};
      var active=begun&&goal&&profile&&latest.caseId===profile.id&&latest.mode==='full',open=!!(active&&latest.coachingOpen&&latest.phase!=='ended'&&latest.phase!=='gate');
      room.hidden=!active||latest.phase==='gate';goalChoice.disabled=depthChoice.disabled=!!(active&&latest.phase!=='gate');
      openButton.hidden=latest.phase==='ended';openButton.disabled=!eligible();openButton.setAttribute('aria-expanded',String(open));panel.hidden=!open;
      if(goal){
        var coaching=goal[depth];goalReminder.textContent=goal.title;depthReminder.textContent=(depth==='resident'?'Resident':'Student')+' coaching depth';
        question.textContent=coaching.question;hint.textContent=coaching.hint;exampleOne.textContent=coaching.examples[0];exampleTwo.textContent=coaching.examples[1];
        reflectionQuestion.textContent=latest.turn>0?coaching.reflection:'What would you want to try for this goal next time, and what remains unknown?';
      }
      unfinished.hidden=!open||!latest.coachingUnfinished;unfinishedWords.textContent=open?latest.coachingUnfinished||'':'';
      reflectionPanel.hidden=!active||latest.phase!=='ended';
      if(open&&!wasOpen){resetReveals();heading.focus();}
      if(!open&&wasOpen)resetReveals();wasOpen=open;
    }
    function clear(){
      if(disposed)return;begun=false;goal=null;depth='student';latest={};wasOpen=false;depthChoice.value='student';depthOptions.open=false;showDepth();if(profile)goalChoice.value=profile.goals[0].id;
      reflection.value='';unfinishedWords.textContent='';resetReveals();panel.hidden=reflectionPanel.hidden=room.hidden=true;goalChoice.disabled=depthChoice.disabled=false;openButton.setAttribute('aria-expanded','false');
    }
    function preview(caseId,isFull){
      if(disposed)return;clear();profile=isFull&&content&&typeof content.getCase==='function'?content.getCase(caseId):null;
      if(!profile||!Array.isArray(profile.goals)||!profile.goals.length)profile=null;
      empty(goalChoice);entry.hidden=!profile;
      if(profile){profile.goals.forEach(function(item){node('option',goalChoice,{value:item.id},item.title);});goalChoice.value=profile.goals[0].id;}
    }
    function begin(){
      if(disposed)return;goal=selectedGoal();depth=depthChoice.value==='resident'?'resident':'student';begun=!!goal;reflection.value='';resetReveals();
    }
    function dispose(){if(disposed)return;clear();disposed=true;listeners.forEach(function(remove){remove();});listeners=[];profile=null;empty(entry);empty(room);entry.hidden=room.hidden=true;}
    entry.hidden=room.hidden=true;
    return {preview:preview,begin:begin,update:update,clear:clear,dispose:dispose};
  }
  return {mount:mount};
}));
