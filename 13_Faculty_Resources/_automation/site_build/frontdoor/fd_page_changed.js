/* "Updated since you last opened it" -- a one-time notice on a reading the learner marked read.

   Pages change mid-rotation, and some changes are corrections (2026-11-24: a Case of the Week
   question taught the wrong dialysis threshold for lithium and was rewritten after learners had
   read it). A learner who marked the page read never comes back to find out. This module keeps a
   fingerprint of each reading's text on the device each time it is opened; when a page the
   learner marked read is opened again and its text no longer matches, the reader says so once,
   above the page, with the date they last opened it.

   What it never does: tell the learner WHAT changed (the device holds a hash, not the old text),
   send anything anywhere, or touch the canonical progress store (cw_progress_v1). The store is
   its own cw_ key, so "Erase everything" clears it with the rest. Storage that throws or holds
   junk degrades to no notice, never to an error. */

var FD_PAGE_SEEN_KEY='cw_page_seen_v1';
var FD_PAGE_SEEN_MAX=400;

/* FNV-1a over the page text with whitespace runs collapsed, so a re-wrapped line or a trailing
   newline is not a change. 8 hex digits: a fingerprint for "different or not", not security. */
function fdPageFingerprint(text){
  var s=String(text==null?'':text).replace(/\s+/g,' ').trim(), h=0x811c9dc5;
  for(var i=0;i<s.length;i++){
    h^=s.charCodeAt(i);
    h=(h+((h<<1)+(h<<4)+(h<<7)+(h<<8)+(h<<24)))>>>0;
  }
  return ('0000000'+h.toString(16)).slice(-8);
}

function fdPageSeenDay(ms){
  var d=new Date(ms);
  return isNaN(d.getTime())?'':d.toISOString().slice(0,10);
}

/* Pure: given the stored map, this page's ref and fingerprint, whether it is marked read, and the
   time, return whether to show the notice, the day it was last opened, and the map to save. */
function fdPageSeenStep(seen, ref, fingerprint, isDone, nowMs){
  var map={}, src=seen&&typeof seen==='object'&&!Array.isArray(seen)?seen:{};
  for(var k in src){
    if(!Object.prototype.hasOwnProperty.call(src,k)) continue;
    var row=src[k];
    if(row&&typeof row.h==='string'&&/^[0-9a-f]{8}$/.test(row.h)) map[k]={h:row.h, at:typeof row.at==='string'?row.at:''};
  }
  var prev=Object.prototype.hasOwnProperty.call(map,ref)?map[ref]:null;
  var changed=!!(isDone&&prev&&prev.h!==fingerprint);
  delete map[ref];
  map[ref]={h:fingerprint, at:fdPageSeenDay(nowMs)};
  /* Oldest-first insertion order: past the cap, drop from the front. */
  var keys=Object.keys(map);
  while(keys.length>FD_PAGE_SEEN_MAX){ delete map[keys.shift()]; }
  return {changed:changed, lastSeen:prev?prev.at:'', next:map};
}

function fdPageChangedHtml(lastSeen){
  var when=/^\d{4}-\d{2}-\d{2}$/.test(lastSeen||'')?' on '+lastSeen:'';
  return '<p class="fd-page-changed" role="status">This page was updated after you last opened it'+
    when+'. You marked it read, so skim it again for what changed.</p>';
}

function fdPageSeenLoad(store){
  try{
    var raw=store&&store.getItem(FD_PAGE_SEEN_KEY);
    var parsed=raw?JSON.parse(raw):{};
    return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{};
  }catch(_){ return {}; }
}

/* Mount on a learner's rendered reading. Returns true when the notice was shown. */
function fdMountPageChanged(body, ref, text, isDone, opts){
  var o=opts||{}, store=o.store||(typeof localStorage!=='undefined'?localStorage:null);
  if(!body||!ref||typeof text!=='string'||!store) return false;
  var step=fdPageSeenStep(fdPageSeenLoad(store), ref, fdPageFingerprint(text), !!isDone,
    typeof o.now==='number'?o.now:Date.now());
  try{ store.setItem(FD_PAGE_SEEN_KEY, JSON.stringify(step.next)); }catch(_){ return false; }
  if(!step.changed||typeof body.querySelector!=='function') return false;
  if(body.querySelector('.fd-page-changed')) return false;
  var h1=body.querySelector('h1');
  if(h1&&typeof h1.insertAdjacentHTML==='function') h1.insertAdjacentHTML('afterend', fdPageChangedHtml(step.lastSeen));
  else if(typeof body.insertAdjacentHTML==='function') body.insertAdjacentHTML('afterbegin', fdPageChangedHtml(step.lastSeen));
  else return false;
  return true;
}
