#!/usr/bin/env python3
"""Generate a self-contained faculty attestation tool for the topic_meta topics.

Reads topic_meta.json (content) + 13_Faculty_Resources/reviewed.json (current
sign-off state) and emits 13_Faculty_Resources/attest-batch.html with the data
EMBEDDED, so it works by just double-clicking (no server / no CDN).

The tool shows every topic's rendered content (tldr, points, can't-miss, ruleOut,
firstMove, quiz with the correct option marked, cta), lets Dr. Moss check off
"Attested", flags topics whose content just changed (re-attest), and exports a
reviewed.json in the EXACT schema the site + QA gate consume:
    { "<key>": {"status":"reviewed","at":"YYYY-MM-DD","by":"Joshua Moss, MD"}, ... }

Re-run this generator whenever topic_meta.json changes to refresh the snapshot.
Usage:  python3 13_Faculty_Resources/_automation/build_attest.py
"""
import json, os, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
LIB  = os.path.abspath(os.path.join(HERE, "..", ".."))          # repo root
TM   = os.path.join(LIB, "topic_meta.json")
RV   = os.path.join(LIB, "13_Faculty_Resources", "reviewed.json")
OUT  = os.path.join(LIB, "13_Faculty_Resources", "attest-batch.html")

# Topics whose content changed and should be re-attested. Updated 2026-07-04 for PR #112
# (teaching content behind these was edited: clozapine/lithium wording + OSCE scored checklists).
CHANGED = [
    "t_psychosis.md", "t_mood.md", "psychopharm_primer.md", "osce.md",
]

meta = json.load(open(TM, encoding="utf-8"))
reviewed = json.load(open(RV, encoding="utf-8")) if os.path.exists(RV) else {}

topics = {k: v for k, v in meta.items() if k != "_note" and isinstance(v, dict)}

payload = {
    "topics": topics,
    "reviewed": reviewed,
    "changed": CHANGED,
    "today": datetime.date.today().isoformat(),
    "count": len(topics),
}

TEMPLATE = r"""<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Attest — Topic Metadata</title>
<style>
  :root{ --bg:#f4efe4; --card:#fffdf8; --ink:#2b2620; --muted:#7a7060;
         --green:#3f6b5f; --green2:#2f5a4f; --line:#e3dccb; --danger:#9b3d3d; --hy:#8a6d1f; }
  *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--ink);
    font:15px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
  header{position:sticky;top:0;z-index:5;background:rgba(244,239,228,.96);
    backdrop-filter:blur(6px);border-bottom:1px solid var(--line);padding:12px 18px}
  h1{font:600 22px/1.2 Georgia,serif;color:var(--green2);margin:0 0 8px}
  .row{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
  .pill{font-size:13px;padding:4px 10px;border:1px solid var(--line);border-radius:999px;
    background:var(--card);cursor:pointer}
  .pill.on{background:var(--green);color:#fff;border-color:var(--green)}
  .prog{font-weight:600}
  input[type=text]{padding:5px 9px;border:1px solid var(--line);border-radius:8px;font-size:13px}
  .btn{padding:6px 14px;border:0;border-radius:8px;background:var(--green);color:#fff;
    font-weight:600;cursor:pointer}
  main{max-width:820px;margin:0 auto;padding:16px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:14px;
    padding:16px 18px;margin:12px 0;box-shadow:0 1px 2px rgba(0,0,0,.03)}
  .card.attested{border-color:var(--green);box-shadow:0 0 0 1px var(--green) inset}
  .ttl{font:600 18px/1.25 Georgia,serif;color:var(--green2);margin:0}
  .key{color:var(--muted);font-size:12px;font-family:ui-monospace,Menlo,monospace}
  .badge{font-size:11px;font-weight:700;padding:2px 7px;border-radius:6px;margin-left:6px;vertical-align:middle}
  .b-hy{background:#f3ecd3;color:var(--hy)} .b-chg{background:#f6e2e2;color:var(--danger)}
  .b-ok{background:#e2efe6;color:var(--green2)}
  .lab{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-top:12px}
  ul{margin:4px 0;padding-left:20px} li{margin:2px 0}
  .cant{color:var(--danger)} .fm{color:var(--green2)}
  .chips span{display:inline-block;background:#efeadd;border:1px solid var(--line);
    border-radius:999px;padding:2px 9px;margin:3px 4px 0 0;font-size:12px}
  .q{background:#faf7ef;border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-top:6px}
  .opt{padding:3px 0} .opt.correct{color:var(--green2);font-weight:600}
  .why{color:var(--muted);font-size:13px;margin-top:4px}
  .att{display:flex;align-items:center;gap:8px;margin-top:14px;padding-top:12px;border-top:1px dashed var(--line)}
  .att input{width:18px;height:18px} .meta{color:var(--muted);font-size:12px}
  .disc{color:var(--muted);font-size:12px;max-width:820px;margin:8px auto 40px;padding:0 16px}
</style></head><body>
<header>
  <h1>Attest — Topic Metadata</h1>
  <div class="row">
    <span class="prog" id="prog"></span>
    <span class="pill on" data-f="all">All</span>
    <span class="pill" data-f="todo">Unattested</span>
    <span class="pill" data-f="changed">Changed</span>
    <span style="flex:1"></span>
    <label class="meta">Reviewer</label>
    <input type="text" id="rev" value="Joshua Moss, MD">
    <button class="btn" id="save">Save &amp; rebuild</button>
    <button class="btn" id="exp" style="background:#7a7060">Download</button>
    <span id="msg" class="meta"></span>
  </div>
</header>
<main id="list"></main>
<div class="disc">Educational governance tool. Attestation means you have read the page and it is
learner-ready. Export writes <code>reviewed.json</code> in the site schema — drop it at
<code>13_Faculty_Resources/reviewed.json</code> and rebuild. Content changed 2026-07-03 is flagged for re-attestation. Joshua Moss, MD.</div>
<script>
const P = __PAYLOAD__;
const T = P.topics, RV = P.reviewed || {}, CHG = new Set(P.changed||[]), TODAY = P.today;
const keys = Object.keys(T);
const state = {}; keys.forEach(k => state[k] = !!(RV[k] && RV[k].status === "reviewed"));
let filter = "all";
const esc = s => (s==null?"":String(s)).replace(/[&<>]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
const pretty = k => k.replace(/\.(md|html)$/,"").replace(/^t_/,"").replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase());

function card(k){
  const v=T[k], on=state[k], chg=CHG.has(k), was=RV[k];
  let h = '<div class="card'+(on?' attested':'')+'" data-k="'+k+'">';
  h += '<div><span class="ttl">'+esc(pretty(k))+'</span>';
  if(v.hy) h+='<span class="badge b-hy">HIGH-YIELD</span>';
  if(chg) h+='<span class="badge b-chg">CHANGED · RE-ATTEST</span>';
  else if(was) h+='<span class="badge b-ok">was reviewed '+esc(was.at||"")+'</span>';
  h += ' <span class="key">'+esc(k)+(v.read?' · '+esc(v.read):'')+'</span></div>';
  if(v.tldr) h+='<div class="lab">TL;DR</div><div>'+esc(v.tldr)+'</div>';
  if(Array.isArray(v.points)&&v.points.length){h+='<div class="lab">Points</div><ul>'+v.points.map(p=>'<li>'+esc(p)+'</li>').join('')+'</ul>';}
  if(v.cant) h+='<div class="lab">Can’t miss</div><div class="cant">'+esc(v.cant)+'</div>';
  if(Array.isArray(v.ruleOut)&&v.ruleOut.length){h+='<div class="lab">Rule out first</div><div class="chips">'+v.ruleOut.map(r=>'<span>'+esc(r)+'</span>').join('')+'</div>';}
  if(v.firstMove) h+='<div class="lab">First move</div><div class="fm">'+esc(v.firstMove)+'</div>';
  if(v.quiz&&v.quiz.q){ const q=v.quiz;
    h+='<div class="lab">Test yourself</div><div class="q"><div>'+esc(q.q)+'</div>';
    (q.o||[]).forEach(o=>{h+='<div class="opt'+(o.c?' correct':'')+'">'+(o.c?'✓ ':'· ')+esc(o.t)+'</div>';});
    if(q.why) h+='<div class="why">'+esc(q.why)+'</div>';
    h+='</div>'; }
  if(v.cta) h+='<div class="lab">CTA</div><div class="meta">'+esc(typeof v.cta==="object"?JSON.stringify(v.cta):v.cta)+'</div>';
  h += '<div class="att"><input type="checkbox" '+(on?'checked':'')+' onchange="toggle(\''+k+'\',this.checked)"><b>Attested</b>'
     + '<span class="meta">'+(on?('by '+esc((was&&was.by)||document.getElementById("rev").value)):'not yet')+'</span></div>';
  return h+'</div>';
}
function visible(k){ if(filter==="todo") return !state[k]; if(filter==="changed") return CHG.has(k); return true; }
function render(){
  document.getElementById("list").innerHTML = keys.filter(visible).map(card).join("");
  const done=keys.filter(k=>state[k]).length;
  document.getElementById("prog").textContent = done+" / "+keys.length+" attested";
}
window.toggle=(k,val)=>{ state[k]=val; render(); };
document.querySelectorAll(".pill").forEach(p=>p.onclick=()=>{
  document.querySelectorAll(".pill").forEach(x=>x.classList.remove("on"));
  p.classList.add("on"); filter=p.dataset.f; render(); });
function build(){
  const by=document.getElementById("rev").value||"Joshua Moss, MD";
  const out=Object.assign({}, RV);
  keys.forEach(k=>{
    if(state[k]){ const keep = RV[k] && !CHG.has(k); out[k] = keep ? RV[k] : {status:"reviewed", at:TODAY, by:by}; }
    else { delete out[k]; }
  });
  return out;
}
const msg=(t,ok)=>{const m=document.getElementById("msg");m.textContent=t;
  m.style.color = ok===false?"#9b3d3d":(ok?"#2f5a4f":"#7a7060");};
document.getElementById("save").onclick=async()=>{
  msg("Saving + rebuilding…");
  try{
    const r=await fetch("/save",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(build())});
    const j=await r.json();
    if(j.ok){ msg("Saved ✓  "+j.attested+" attested"+(j.gate?(" · gate "+j.gate):""), j.gate!=="FAIL"); }
    else { msg("Save failed: "+(j.error||"server error"), false); }
  }catch(e){ msg("No save server running — use Download, or run attest_serve.py.", false); }
};
document.getElementById("exp").onclick=()=>{
  const blob=new Blob([JSON.stringify(build(),null,2)+"\n"],{type:"application/json"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob);
  a.download="reviewed.json"; document.body.appendChild(a); a.click(); a.remove();
  msg("Downloaded reviewed.json");
};
render();
</script></body></html>
"""

html = TEMPLATE.replace("__PAYLOAD__", json.dumps(payload, ensure_ascii=False))
open(OUT, "w", encoding="utf-8").write(html)
print("wrote", os.path.relpath(OUT, LIB),
      "| topics:", len(topics),
      "| already attested:", sum(1 for k in topics if reviewed.get(k, {}).get("status") == "reviewed"),
      "| flagged changed:", len(CHANGED))
