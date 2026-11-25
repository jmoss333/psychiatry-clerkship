/* "Updated since you last opened it" -- a one-time notice on a reading the learner marked read.

   Pages change mid-rotation, and some changes are corrections (2026-11-24: a Case of the Week
   question taught the wrong dialysis threshold for lithium and was rewritten after learners had
   read it). A learner who marked the page read never comes back to find out.

   WHAT COUNTS AS AN UPDATE is the author's call, not a hash's. A page opts in with one marker,
   an HTML comment whose text is

       content-updated: 2026-11-24

   written as an ordinary HTML comment in the Markdown, so it is invisible in the reader. (This
   file does not type the comment delimiters because it is inlined into a script element.) At most
   one per page, a real calendar date: tests/content-updated-marker.test.mjs.

   An author who makes a change a learner who already read the page should come back for -- a
   corrected threshold, a changed recommendation, a new safety step -- sets the marker to that day.
   A typo fix, a re-wrapped line, a citation renumbering or a link repair leaves it alone and
   shows nothing. The first version of this module (#1304) fingerprinted the whole text, so
   every copy edit re-prompted every learner who had read the page; a notice that fires on typos
   teaches learners to ignore the one that matters.

   The device keeps, per reading, the marker it last saw and the day it was last opened
   (cw_page_seen_v1, ref -> {v, at}). When a page the learner marked read is opened with a marker
   that differs from the stored one AND is not older than their last open, the reader says so
   once, above the page, with both dates. "Not older" stops a marker added after the fact, for a
   change the learner already read, from notifying. Rows written by the first version
   ({h, at}, no marker) are read as "no marker seen", so a page that gains its first marker
   notifies exactly the learners who last opened it on or before the marked day.

   What it never does: tell the learner WHAT changed, send anything anywhere, or touch the
   canonical progress store (cw_progress_v1). The store is its own cw_ key, so "Erase everything"
   clears it with the rest. Storage that throws or holds junk degrades to no notice, never to an
   error. */

var FD_PAGE_SEEN_KEY='cw_page_seen_v1';
var FD_PAGE_SEEN_MAX=400;
var FD_DAY_RE=/^\d{4}-\d{2}-\d{2}$/;

/* The page's content-updated marker as YYYY-MM-DD, or '' when it has none or the date is not a
   real calendar day. The first marker wins; the repository test keeps it to one per page. */
function fdPageContentVersion(text){
  var m=/<!-{2}\s*content-updated:\s*(\d{4}-\d{2}-\d{2})\s*-{2}>/i.exec(String(text==null?'':text));
  if(!m) return '';
  var d=new Date(m[1]+'T00:00:00Z');
  return !isNaN(d.getTime())&&d.toISOString().slice(0,10)===m[1]?m[1]:'';
}

function fdPageSeenDay(ms){
  var d=new Date(ms);
  return isNaN(d.getTime())?'':d.toISOString().slice(0,10);
}

/* Pure: given the stored map, this page's ref and content version, whether it is marked read, and
   the time, return whether to show the notice, the day it was last opened, and the map to save. */
function fdPageSeenStep(seen, ref, version, isDone, nowMs){
  var map={}, src=seen&&typeof seen==='object'&&!Array.isArray(seen)?seen:{};
  var ver=FD_DAY_RE.test(version||'')?version:'';
  for(var k in src){
    if(!Object.prototype.hasOwnProperty.call(src,k)) continue;
    var row=src[k];
    if(!row||typeof row!=='object') continue;
    var at=typeof row.at==='string'&&FD_DAY_RE.test(row.at)?row.at:'';
    if(typeof row.v==='string'&&(row.v===''||FD_DAY_RE.test(row.v))) map[k]={v:row.v, at:at};
    /* A first-version row: the page was opened, no marker was recorded. */
    else if(typeof row.h==='string'&&/^[0-9a-f]{8}$/.test(row.h)) map[k]={v:'', at:at};
  }
  var prev=Object.prototype.hasOwnProperty.call(map,ref)?map[ref]:null;
  var changed=!!(isDone&&prev&&ver&&ver!==prev.v&&ver>=prev.at);
  delete map[ref];
  map[ref]={v:ver, at:fdPageSeenDay(nowMs)};
  /* Oldest-first insertion order: past the cap, drop from the front. */
  var keys=Object.keys(map);
  while(keys.length>FD_PAGE_SEEN_MAX){ delete map[keys.shift()]; }
  return {changed:changed, lastSeen:prev?prev.at:'', updated:ver, next:map};
}

function fdPageChangedHtml(lastSeen, updated){
  var on=FD_DAY_RE.test(updated||'')?' on '+updated:'';
  var when=FD_DAY_RE.test(lastSeen||'')?' on '+lastSeen:'';
  return '<p class="fd-page-changed" role="status">This page was updated'+on+
    ', after you last opened it'+when+'. You marked it read, so skim it again for what changed.</p>';
}

function fdPageSeenLoad(store){
  try{
    var raw=store&&store.getItem(FD_PAGE_SEEN_KEY);
    var parsed=raw?JSON.parse(raw):{};
    return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{};
  }catch(_){ return {}; }
}

/* The device store, or null. Reading the localStorage property itself throws (SecurityError)
   when the browser blocks site storage, so it is only ever touched inside a try. */
function fdPageSeenStore(){
  try{ return typeof localStorage!=='undefined'&&localStorage?localStorage:null; }catch(_){ return null; }
}

/* Mount on a learner's rendered reading. Returns true when the notice was shown. It never throws:
   the reader calls it before its remaining enhancements (collapsible sections, tables, the
   reading place), and an exception here would skip them all. */
function fdMountPageChanged(body, ref, text, isDone, opts){
  try{
    var o=opts||{}, store=o.store||fdPageSeenStore();
    if(!body||!ref||typeof text!=='string'||!store) return false;
    var step=fdPageSeenStep(fdPageSeenLoad(store), ref, fdPageContentVersion(text), !!isDone,
      typeof o.now==='number'?o.now:Date.now());
    try{ store.setItem(FD_PAGE_SEEN_KEY, JSON.stringify(step.next)); }catch(_){ return false; }
    if(!step.changed||typeof body.querySelector!=='function') return false;
    if(body.querySelector('.fd-page-changed')) return false;
    var h1=body.querySelector('h1');
    if(h1&&typeof h1.insertAdjacentHTML==='function') h1.insertAdjacentHTML('afterend', fdPageChangedHtml(step.lastSeen, step.updated));
    else if(typeof body.insertAdjacentHTML==='function') body.insertAdjacentHTML('afterbegin', fdPageChangedHtml(step.lastSeen, step.updated));
    else return false;
    return true;
  }catch(_){ return false; }
}
