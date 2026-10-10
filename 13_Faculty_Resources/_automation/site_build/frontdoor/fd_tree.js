/* Safety decision trees: the branching view inside a safety-kit protocol sheet, and the
   escalation script it opens. 2026-10-10 safety-drawer spec, sections 4.1-4.4
   (docs/superpowers/specs/2026-10-10-safety-drawer-decision-trees-design.md).

   Pure, like fd_sheet.js: fdTreeView(tree, view, opts) -> string. No browser globals, no
   storage, no clock. ES5 only (var/function): it is a build-injected snippet, not a module.

   *** No clinical text lives here. *** Every question, answer, action and script line comes
   from topic_meta.json's safetyTree, which carries the page's faculty attestation. The only
   strings in this file are interface labels. tests/fd-tree.test.mjs pins both halves.

   State is a replay, not a pointer. view.path lists the answers taken, each
   "<nodeId>.<optionIndex>"; the current node is wherever replaying that list from tree.start
   leads. A path that does not replay (an answer for a different node, an option that is not
   there) renders the tree from its start, never a node the answers did not lead to. Nothing is
   persisted: the wiring clears the path whenever a sheet opens or closes.

   Escalation never waits for the end of a tree. "Escalate to attending" is on every tree
   screen: on a question it opens the "now" script (when in doubt, escalate now); on an action it
   opens that action's own script. A "soon" script offers the "now" script; nothing offers the
   reverse. */

function fdTreeNodes(tree){
  var list=tree&&tree.nodes, out={};
  if(!list||typeof list.length!=='number') return null;
  for(var i=0;i<list.length;i++){
    var n=list[i];
    if(!n||typeof n.id!=='string'||!FD_TREE_ID_RE.test(n.id)||out[n.id]) return null;
    out[n.id]=n;
  }
  return out;
}

var FD_TREE_ID_RE=/^[a-z][a-z0-9-]{0,23}$/;
var FD_TREE_STEP_RE=/^([a-z][a-z0-9-]{0,23})\.([0-3])$/;
var FD_TREE_MAX_QUESTIONS=5;
var FD_TREE_SCRIPT_PARTS=[
  ['identify','Identify'],['situation','Situation'],['background','Background'],
  ['assessment','Assessment'],['recommendation','Recommendation'],['readBack','Read back']
];

function fdTreeText(s){ return typeof s==='string'&&!!s.trim(); }

function fdTreeIsQuestion(n){ return !!n&&typeof n.ask==='string'&&!!n.options; }

function fdTreeScriptValid(s){
  if(!s||!fdTreeText(s.label)) return false;
  for(var i=0;i<FD_TREE_SCRIPT_PARTS.length;i++){
    if(!fdTreeText(s[FD_TREE_SCRIPT_PARTS[i][0]])) return false;
  }
  return true;
}

/* Every path from "id" reaches an action without revisiting a node and within the question
   budget; a cycle or a sixth question fails. */
function fdTreeDepthOk(nodes, id, asked, onPath){
  var n=nodes[id];
  if(!n||onPath[id]) return false;
  if(!fdTreeIsQuestion(n)) return true;
  if(asked>=FD_TREE_MAX_QUESTIONS) return false;
  onPath[id]=true;
  for(var i=0;i<n.options.length;i++){
    if(!fdTreeDepthOk(nodes,n.options[i].next,asked+1,onPath)){ onPath[id]=false; return false; }
  }
  onPath[id]=false;
  return true;
}

/* Runtime twin of validate_topic_meta.py's tree rules, failing CLOSED: anything malformed and
   the sheet shows the checklist instead. The build validator rejects bad data first; this is
   for a payload that arrives interrupted or stale. */
function fdTreeValid(tree){
  var nodes=fdTreeNodes(tree), scripts=tree&&tree.scripts;
  if(!nodes||!scripts||!fdTreeScriptValid(scripts.now)) return false;
  if(scripts.soon!==undefined&&!fdTreeScriptValid(scripts.soon)) return false;
  if(typeof tree.start!=='string'||!nodes[tree.start]) return false;
  for(var id in nodes){
    if(!Object.prototype.hasOwnProperty.call(nodes,id)) continue;
    var n=nodes[id];
    if(fdTreeIsQuestion(n)){
      var opts=n.options;
      if(!fdTreeText(n.ask)||typeof opts.length!=='number'||opts.length<2||opts.length>4) return false;
      for(var i=0;i<opts.length;i++){
        if(!opts[i]||!fdTreeText(opts[i].label)||!nodes[opts[i].next]) return false;
      }
    } else {
      if(!fdTreeText(n.title)||(n.tone!=='danger'&&n.tone!=='first')) return false;
      if(!n.act||typeof n.act.length!=='number'||n.act.length<1||n.act.length>4) return false;
      for(var j=0;j<n.act.length;j++){ if(!fdTreeText(n.act[j])) return false; }
      if(n.escalate!=='now'&&!(n.escalate==='soon'&&scripts.soon)) return false;
    }
  }
  return fdTreeDepthOk(nodes,tree.start,0,{});
}

/* Replays path from tree.start. {node, trail:[{ask,label}], ok}; on a path that does not replay,
   the start node with an empty trail and ok:false. Caller has established fdTreeValid(tree). */
function fdTreeWalk(tree, path){
  var nodes=fdTreeNodes(tree), node=nodes[tree.start], trail=[], steps=path||[];
  for(var i=0;i<steps.length;i++){
    var m=FD_TREE_STEP_RE.exec(String(steps[i]));
    var opt=(m&&m[1]===node.id&&fdTreeIsQuestion(node))?node.options[+m[2]]:null;
    if(!opt) return {node:nodes[tree.start],trail:[],ok:false};
    trail.push({ask:node.ask,label:opt.label});
    node=nodes[opt.next];
  }
  return {node:node,trail:trail,ok:true};
}

/* Script text with each spoken blank marked. Escaped FIRST, so the only markup is ours; the
   brackets stay inside the mark, so a blank still reads as one with styles off. The bound is
   160, not the validator's 80: escaping lengthens a blank ("don't" becomes "don&#39;t"), and
   a long spoken menu must not silently lose its mark. */
function fdTreeBlanks(text){
  return fdEsc(text).replace(/\[([^\[\]]{1,160})\]/g,'<mark class="fd-script__blank">[$1]</mark>');
}

function fdTreeEscalateButton(script, label){
  return '<button type="button" class="fd-tree__escalate" data-fd-escalate="'+script+'">'+
    fdEsc(label)+'</button>';
}

function fdTreeScriptView(tree, key){
  var used=(key==='soon'&&tree.scripts.soon)?'soon':'now', s=tree.scripts[used];
  var out='<section class="fd-script" aria-labelledby="fdScriptHeading">'+
    '<h3 class="fd-tree__heading" id="fdScriptHeading" tabindex="-1">Say this to your attending</h3>'+
    '<p class="fd-script__label">'+fdEsc(s.label)+'</p><dl class="fd-script__parts">';
  for(var i=0;i<FD_TREE_SCRIPT_PARTS.length;i++){
    var part=FD_TREE_SCRIPT_PARTS[i];
    out+='<dt>'+part[1]+'</dt><dd>'+fdTreeBlanks(s[part[0]])+'</dd>';
  }
  out+='</dl>';
  if(used==='soon') out+=fdTreeEscalateButton('now','Need them sooner? Use the come-now script');
  out+='<button type="button" class="fd-btn fd-btn--ghost" data-fd-escalate-close>'+
    '‹ Back to where you were</button>';
  return out+'</section>';
}

function fdTreeQuestionView(node){
  var out='<h3 class="fd-tree__heading" tabindex="-1">'+fdEsc(node.ask)+'</h3>';
  if(fdTreeText(node.hint)) out+='<p class="fd-tree__hint">'+fdEsc(node.hint)+'</p>';
  out+='<ul class="fd-tree__options">';
  for(var i=0;i<node.options.length;i++){
    out+='<li><button type="button" class="fd-tree__option" data-fd-tree-answer="'+
      fdEsc(node.id+'.'+i)+'">'+fdEsc(node.options[i].label)+'</button></li>';
  }
  return out+'</ul>';
}

/* Tone is said in words ("Act now" / "First move") as well as shown in colour, so it survives
   forced colours, a monochrome print and a screen reader. */
function fdTreeActionView(node, kitTitles){
  var danger=(node.tone==='danger'), titles=kitTitles||{}, see=node.see||[];
  var out='<div class="fd-tree__verdict'+(danger?' is-danger':'')+'">'+
    '<span class="fd-tree__tone">'+(danger?'Act now':'First move')+'</span>'+
    '<h3 class="fd-tree__heading" tabindex="-1">'+fdEsc(node.title)+'</h3></div>';
  out+='<ol class="fd-tree__acts">';
  for(var i=0;i<node.act.length;i++) out+='<li>'+fdEsc(node.act[i])+'</li>';
  out+='</ol>';
  var links='';
  for(var j=0;j<see.length;j++){
    if(!titles[see[j]]) continue;
    links+='<button type="button" class="fd-btn fd-btn--ghost" data-fd-safety="'+fdEsc(see[j])+'">'+
      'Open the '+fdEsc(titles[see[j]])+' protocol →</button>';
  }
  if(links) out+='<div class="fd-tree__see">'+links+'</div>';
  return out;
}

/* view: {path:[...], escalate:null|'now'|'soon'}; opts: {draft:boolean, kitTitles:{ref:title}}.
   The caller has established fdTreeValid(tree). */
function fdTreeView(tree, view, opts){
  var v=view||{}, o=opts||{};
  var walk=fdTreeWalk(tree,v.path), node=walk.node, question=fdTreeIsQuestion(node);
  var out='<div class="fd-tree">';
  if(o.draft===true){
    out+='<p class="fd-tree__draft" role="note">DRAFT — not faculty-reviewed. '+
      'Learners do not see this tree.</p>';
  }
  if(v.escalate==='now'||v.escalate==='soon') return out+fdTreeScriptView(tree,v.escalate)+'</div>';
  out+=fdTreeEscalateButton(question?'now':node.escalate,'Escalate to attending');
  if(walk.trail.length){
    out+='<ol class="fd-tree__trail" aria-label="Your answers">';
    for(var i=0;i<walk.trail.length;i++){
      out+='<li>'+fdEsc(walk.trail[i].ask)+' — <b>'+fdEsc(walk.trail[i].label)+'</b></li>';
    }
    out+='</ol>';
  }
  out+=question?fdTreeQuestionView(node):fdTreeActionView(node,o.kitTitles);
  if(walk.trail.length){
    out+='<div class="fd-tree__nav">'+
      '<button type="button" class="fd-btn fd-btn--ghost" data-fd-tree-back>‹ Back</button>'+
      '<button type="button" class="fd-btn fd-btn--ghost" data-fd-tree-restart>Start over</button>'+
    '</div>';
  }
  return out+'</div>';
}
